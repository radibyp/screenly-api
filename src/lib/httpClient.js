'use strict';

/**
 * Lightweight HTTP client for the IDLIX scraper.
 *
 * All upstream requests are delegated to the external request/rendering
 * service (requestServiceClient) so the API process never runs a browser
 * runtime itself. The service returns rendered HTML / JSON with a real
 * browser fingerprint and session, which the upstream site expects.
 *
 * Public API:
 *   get(path)                      → Promise<{ data: html }>
 *   getJson(path)                  → Promise<Object|null>
 *   getStreamData(slug)            → Promise<StreamResult>
 *   getEpisodeStreamData(s,se,ep)  → Promise<StreamResult>
 *   close()                        → Promise<void>
 */

const { BASE_URL } = require('../config/env');
const { fetchHtml, requestFetch } = require('./requestServiceClient');
const { getStreamData, getEpisodeStreamData } = require('./streamClient');

// ── Public API ──────────────────────────────────────────────────────────────────

const httpClient = {
  /**
   * GET a path on the upstream IDLIX site via the external request service.
   * Compatible with the old API: returns Promise<{ data: string }>.
   *
   * @param {string} path - Path relative to BASE_URL (e.g. "/movie").
   * @returns {Promise<{ data: string }>}
   */
  async get(path) {
    const url  = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const data = await fetchHtml(url);
    return { data };
  },

  /**
   * Fetch a JSON API endpoint via the external request service.
   *
   * @param {string} path - Path relative to BASE_URL.
   * @returns {Promise<Object|null>}
   */
  async getJson(path) {
    const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

    const res = await requestFetch(url, {
      headers: { accept: 'application/json' },
    });

    // The upstream site may return a challenge/interstitial page when it does
    // not recognise the request. Detect those signatures and bail out.
    if (
      res.status === 403 ||
      (res.text || '').includes('<title>Just a moment...</title>') ||
      (res.text || '').includes('cf-challenge-stage') ||
      (res.text || '').includes('__cf_chl_opt')
    ) {
      console.error('[httpClient:getJson] Upstream returned a challenge page; cannot parse JSON.');
      return null;
    }

    if (!res.ok) return null;

    try {
      return JSON.parse(res.text);
    } catch (err) {
      console.error('[httpClient:getJson] Error parsing JSON. Response may not be valid JSON.');
      return null;
    }
  },

  /**
   * Full streaming chain for a movie (returns subtitles + metadata).
   * @param {string} slug
   * @returns {Promise<StreamResult>}
   */
  async getStreamData(slug) {
    return getStreamData(slug);
  },

  /**
   * Full streaming chain for a series episode.
   * @param {string} slug
   * @param {number} season
   * @param {number} episode
   * @returns {Promise<StreamResult>}
   */
  async getEpisodeStreamData(slug, season, episode) {
    return getEpisodeStreamData(slug, season, episode);
  },

  /**
   * No-op — kept for backward compatibility.
   * The request service owns its own lifecycle; there is no local session to close.
   */
  async close() {},
};

module.exports = httpClient;
