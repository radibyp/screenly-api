'use strict';

// Mock child_process.execFile used by requestServiceClient for curl calls.
// Each test configures the mock to simulate curl's stdout output.
// Variable must be prefixed with `mock` for Jest's hoisting rules.
const mockExecFile = jest.fn();
jest.mock('child_process', () => ({
  execFile: mockExecFile,
}));

jest.mock('../../src/config/env', () => ({
  REQUEST_SERVICE_URL: 'http://localhost:8191',
  REQUEST_SERVICE_TIMEOUT_MS: 60_000,
}));

const { requestFetch, fetchHtml, getCookieHeader, invalidate } =
  require('../../src/lib/requestServiceClient');

/**
 * Helper: simulate a successful curl response.
 * curl's output ends with \n__CURL_STATUS__<code> thanks to the -w flag.
 */
function mockCurlSuccess(body, statusCode = 200) {
  mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
    cb(null, `${body}\n__CURL_STATUS__${statusCode}`, '');
  });
}


/**
 * Helper: simulate a curl execution failure (e.g., network unreachable).
 */
function mockCurlError(message = 'curl: (6) Could not resolve host') {
  mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
    cb(new Error(message), '', message);
  });
}

/**
 * Helper: simulate a Cloudflare challenge page from curl.
 */
function mockCurlChallenge() {
  const challengeHtml = '<html><head><title>Just a moment...</title></head>' +
    '<body>cf-challenge-stage __cf_chl_opt</body></html>';
  mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
    cb(null, `${challengeHtml}\n__CURL_STATUS__403`, '');
  });
}

describe('requestServiceClient', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  // ── requestFetch ─────────────────────────────────────────────────────────
  describe('requestFetch()', () => {
    it('calls curl with correct arguments and returns parsed result', async () => {
      mockCurlSuccess('{"data":"hello"}');

      const result = await requestFetch('https://target.example/page', {
        headers: { accept: 'application/json' },
      });

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      const [cmd, args] = mockExecFile.mock.calls[0];
      expect(cmd).toBe('curl');
      expect(args).toContain('https://target.example/page');
      expect(args).toContain('-s');       // silent mode
      expect(args).toContain('-L');       // follow redirects
      expect(args).toContain('--compressed');
      expect(result).toEqual({ status: 200, ok: true, text: '{"data":"hello"}' });
    });

    it('forwards method and body via curl flags', async () => {
      mockCurlSuccess('created', 201);

      await requestFetch('https://target.example/x', {
        method: 'POST',
        body: '{"a":1}',
      });

      const args = mockExecFile.mock.calls[0][1];
      expect(args).toContain('-X');
      const methodIndex = args.indexOf('-X');
      expect(args[methodIndex + 1]).toBe('POST');
      expect(args).toContain('-d');
      const bodyIndex = args.indexOf('-d');
      expect(args[bodyIndex + 1]).toBe('{"a":1}');
    });

    it('returns a failure result when the upstream returns non-2xx', async () => {
      mockCurlSuccess('bad gateway', 502);

      const result = await requestFetch('https://target.example/x');

      expect(result.ok).toBe(false);
      expect(result.status).toBe(502);
      expect(result.text).toBe('bad gateway');
    });

    it('returns a failure result when curl execution fails', async () => {
      mockCurlError('curl: (6) Could not resolve host');

      const result = await requestFetch('https://target.example/x');

      expect(result.ok).toBe(false);
      expect(result.status).toBe(0);
      expect(result.text).toMatch(/Could not resolve host|curl/);
    });

    it('returns a failure result when curl is killed (timeout)', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
        const err = new Error('killed');
        err.killed = true;
        cb(err, '', '');
      });

      const result = await requestFetch('https://target.example/x');

      expect(result.ok).toBe(false);
      expect(result.status).toBe(0);
      expect(result.text).toMatch(/timed out/);
    });

    it('detects Cloudflare challenge and attempts rendering service fallback', async () => {
      // First call (curl) returns a challenge page
      let callCount = 0;
      mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
        const challengeHtml = '<html><head><title>Just a moment...</title></head>' +
          '<body>cf-challenge-stage</body></html>';
        cb(null, `${challengeHtml}\n__CURL_STATUS__403`, '');
      });

      // Mock global fetch for the rendering service fallback
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error('service unavailable'));

      const result = await requestFetch('https://target.example/x');

      // Should have tried curl first, then the rendering service
      expect(mockExecFile).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Since the service also failed, we get the curl result back
      expect(result.status).toBe(403);
      expect(result.ok).toBe(false);

      global.fetch = originalFetch;
    });
  });

  // ── fetchHtml ────────────────────────────────────────────────────────────
  describe('fetchHtml()', () => {
    it('returns the rendered HTML text', async () => {
      mockCurlSuccess('<html>page</html>');

      const html = await fetchHtml('https://target.example/page');

      expect(html).toBe('<html>page</html>');
    });

    it('returns the text even on a non-ok response', async () => {
      mockCurlSuccess('oops', 500);

      const html = await fetchHtml('https://target.example/page');

      expect(html).toBe('oops');
    });
  });

  // ── backward-compat no-ops ───────────────────────────────────────────────
  describe('backward-compat surface', () => {
    it('getCookieHeader() resolves to an empty string', async () => {
      await expect(getCookieHeader()).resolves.toBe('');
    });

    it('invalidate() resolves to undefined', async () => {
      await expect(invalidate()).resolves.toBeUndefined();
    });
  });
});
