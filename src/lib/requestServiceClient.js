'use strict';

/**
 * External Request / Rendering Service Client
 *
 * ── Strategy (v3.1) ─────────────────────────────────────────────────────────
 *
 * 1. **curl-based fetch (primary)** – Cloudflare blocks Node.js native fetch()
 *    because of TLS fingerprinting (Node uses OpenSSL, browsers use BoringSSL).
 *    We shell out to system `curl` which has a TLS fingerprint that Cloudflare
 *    accepts. This keeps the API self-contained with no npm dependencies.
 *
 * 2. **Rendering service fallback** – If curl fails AND the external rendering
 *    service is configured and reachable, the request is retried through it.
 *    This preserves backward compatibility for edge cases.
 *
 * Configure the optional fallback service with the REQUEST_SERVICE_URL
 * environment variable, e.g.:
 *   REQUEST_SERVICE_URL=http://localhost:8191
 *
 * Public API (unchanged — drop-in compatible):
 *   requestFetch(url, options)  → { status, ok, text }
 *   fetchHtml(url)              → html string
 *   getCookieHeader()           → ''  (no-op, kept for backward compatibility)
 *   invalidate()                → void (no-op)
 */

const { execFile } = require('child_process');
const { REQUEST_SERVICE_URL, REQUEST_SERVICE_TIMEOUT_MS } = require('../config/env');

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_UA =
  'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36';

const CHALLENGE_SIGNATURES = [
  '<title>Just a moment...</title>',
  'cf-challenge-stage',
  '__cf_chl_opt',
];

const CURL_TIMEOUT_SECS = Math.ceil((REQUEST_SERVICE_TIMEOUT_MS || 60_000) / 1000);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Detect whether a response body looks like a Cloudflare challenge page.
 * @param {string} text
 * @returns {boolean}
 */
function isChallengeResponse(text) {
  if (!text) return false;
  return CHALLENGE_SIGNATURES.some(sig => text.includes(sig));
}

/**
 * Build the absolute endpoint URL for the external request service.
 * @param {string} path
 * @returns {string}
 */
function serviceEndpoint(path) {
  const base = (REQUEST_SERVICE_URL || '').replace(/\/+$/, '');
  return `${base}${path}`;
}

/** Track whether we've already warned about the service being unavailable. */
let _serviceWarned = false;

// ── curl-based fetch (primary strategy) ─────────────────────────────────────

/**
 * Execute an HTTP request using system curl.
 *
 * curl's TLS fingerprint is accepted by Cloudflare, unlike Node.js native
 * fetch (undici/OpenSSL). We use -w to capture the HTTP status code and
 * parse it from the output.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {string} [options.method='GET']
 * @param {string} [options.body]
 * @param {object} [options.headers]
 * @returns {Promise<{ status: number, ok: boolean, text: string }>}
 */
function curlFetch(url, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const args = [
      '-s',                          // silent mode (no progress bar)
      '-L',                          // follow redirects
      '--max-time', String(CURL_TIMEOUT_SECS),
      '--compressed',                // accept gzip/brotli/zstd
      '-w', '\n__CURL_STATUS__%{http_code}',  // append status code
      '-X', method,
    ];

    // Merge default + caller headers
    const mergedHeaders = {
      'user-agent': DEFAULT_UA,
      'accept-language': 'en-US,en;q=0.9',
      ...headers,
    };

    for (const [key, value] of Object.entries(mergedHeaders)) {
      args.push('-H', `${key}: ${value}`);
    }

    if (body) {
      args.push('-d', body);
    }

    args.push(url);

    execFile('curl', args, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const reason = err.killed
          ? `curl timed out after ${CURL_TIMEOUT_SECS}s`
          : (err.message || 'curl execution failed');
        console.error(`[requestService] curl failed for ${url}: ${reason}`);
        resolve({ status: 0, ok: false, text: reason });
        return;
      }

      // Parse status code from the sentinel we appended via -w
      let status = 0;
      let text = stdout || '';

      const statusMatch = text.match(/\n__CURL_STATUS__(\d+)$/);
      if (statusMatch) {
        status = parseInt(statusMatch[1], 10);
        text = text.substring(0, statusMatch.index);
      }

      const ok = status >= 200 && status < 300;

      resolve({ status, ok, text });
    });
  });
}

// ── Rendering service fetch (fallback) ──────────────────────────────────────

/**
 * Delegate a request to the external rendering microservice.
 * Returns the same normalised { status, ok, text } shape.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {string} [options.method='GET']
 * @param {string} [options.body]
 * @param {object} [options.headers]
 * @returns {Promise<{ status: number, ok: boolean, text: string }>}
 */
async function serviceFetch(url, { method = 'GET', body, headers = {} } = {}) {
  if (!REQUEST_SERVICE_URL) {
    return { status: 0, ok: false, text: 'REQUEST_SERVICE_URL is not configured' };
  }

  let res;
  try {
    res = await fetch(serviceEndpoint('/fetch'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ url, method, body, headers }),
      signal: REQUEST_SERVICE_TIMEOUT_MS
        ? AbortSignal.timeout(REQUEST_SERVICE_TIMEOUT_MS)
        : undefined,
    });
  } catch (err) {
    const reason =
      err && err.name === 'TimeoutError'
        ? `request service timed out after ${REQUEST_SERVICE_TIMEOUT_MS}ms`
        : (err && err.message) || 'request service unavailable';
    console.error(`[requestService] service call failed for ${url}: ${reason}`);
    return { status: 0, ok: false, text: reason };
  }

  let payload = null;
  const raw = await res.text();
  try {
    payload = JSON.parse(raw);
  } catch (_) {
    console.error(`[requestService] invalid JSON from service (status ${res.status})`);
    return { status: 0, ok: false, text: raw };
  }

  if (!res.ok) {
    console.warn(`[requestService] service returned ${res.status} for ${url}`);
    return {
      status: Number(payload.status) || 0,
      ok: false,
      text: payload.text || raw,
    };
  }

  return {
    status: Number(payload.status) || 0,
    ok: payload.ok !== false && Number(payload.status) >= 200 && Number(payload.status) < 300,
    text: payload.text || '',
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a URL with automatic fallback.
 *
 * 1. Try curl-based HTTP request (bypasses Cloudflare TLS fingerprinting).
 * 2. If the response is a Cloudflare challenge AND the rendering service is
 *    configured, retry through the service.
 * 3. Otherwise return the curl result (even if it failed).
 *
 * @param {string} url
 * @param {object} [options]
 * @param {string} [options.method='GET']
 * @param {string} [options.body]
 * @param {object} [options.headers]
 * @returns {Promise<{ status: number, ok: boolean, text: string }>}
 */
async function requestFetch(url, options = {}) {
  // 1. Try curl-based fetch first (Cloudflare-friendly TLS fingerprint)
  const curlResult = await curlFetch(url, options);

  // 2. Check if we got a Cloudflare challenge
  const gotChallenge =
    curlResult.status === 403 && isChallengeResponse(curlResult.text);

  if (!gotChallenge) {
    // curl request succeeded or failed for a non-challenge reason — use it
    return curlResult;
  }

  // 3. Got a challenge — try the rendering service if available
  if (!REQUEST_SERVICE_URL) {
    if (!_serviceWarned) {
      console.warn(
        '[requestService] Cloudflare challenge detected but no REQUEST_SERVICE_URL configured. ' +
        'Set REQUEST_SERVICE_URL to enable automatic challenge bypass.',
      );
      _serviceWarned = true;
    }
    return curlResult;
  }

  console.log(`[requestService] Cloudflare challenge on ${url} — retrying via rendering service`);
  const serviceResult = await serviceFetch(url, options);

  // If the service also failed, return the curl result for better error context
  if (!serviceResult.ok && serviceResult.status === 0) {
    console.warn('[requestService] Rendering service fallback also failed; using curl result');
    return curlResult;
  }

  return serviceResult;
}

/**
 * Fetch rendered HTML for a URL.
 * Drop-in replacement for the old browser-based fetchHtml().
 *
 * @param {string} url
 * @param {number} [_timeout] - unused; kept for backward compatibility.
 * @returns {Promise<string>} Full page HTML (may be empty on failure).
 */
async function fetchHtml(url, _timeout) {
  const res = await requestFetch(url, {
    headers: {
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  });

  if (!res.ok) {
    console.warn(`[requestService] fetchHtml warning: ${res.status} on ${url}`);
  }
  return res.text;
}

/**
 * No-op retained for backward compatibility.
 * @returns {Promise<string>} Always empty.
 */
async function getCookieHeader() {
  return '';
}

/**
 * No-op retained for backward compatibility.
 * @returns {Promise<void>}
 */
async function invalidate() {
  return undefined;
}

module.exports = {
  requestFetch,
  fetchHtml,
  getCookieHeader,
  invalidate,
};
