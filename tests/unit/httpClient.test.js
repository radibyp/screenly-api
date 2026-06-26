'use strict';

// Hoisted mocks — the external request service client (requestServiceClient)
// and the streaming chain (streamClient) are integration-bound adapters; we
// stub them so the httpClient orchestration logic can be exercised
// deterministically.
jest.mock('../../src/lib/requestServiceClient', () => ({
  requestFetch:      jest.fn(),
  fetchHtml:         jest.fn(),
  getCookieHeader:   jest.fn(),
  invalidate:        jest.fn(),
}));
jest.mock('../../src/lib/streamClient', () => ({
  getStreamData:        jest.fn(),
  getEpisodeStreamData: jest.fn(),
}));

const httpClient         = require('../../src/lib/httpClient');
const requestServiceClient = require('../../src/lib/requestServiceClient');
const streamClient       = require('../../src/lib/streamClient');
const { BASE_URL }       = require('../../src/config/env');

describe('httpClient', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── get ──────────────────────────────────────────────────────────────────
  describe('get()', () => {
    it('fetches HTML for a path and wraps it in { data }', async () => {
      requestServiceClient.fetchHtml.mockResolvedValue('<html>ok</html>');

      const result = await httpClient.get('/movie');

      expect(requestServiceClient.fetchHtml).toHaveBeenCalledWith(`${BASE_URL}/movie`);
      expect(result).toEqual({ data: '<html>ok</html>' });
    });

    it('normalises a path that does not start with "/"', async () => {
      requestServiceClient.fetchHtml.mockResolvedValue('x');
      await httpClient.get('movie');
      expect(requestServiceClient.fetchHtml).toHaveBeenCalledWith(`${BASE_URL}/movie`);
    });
  });

  // ── getJson ──────────────────────────────────────────────────────────────
  describe('getJson()', () => {
    it('parses and returns JSON on a successful 2xx response', async () => {
      requestServiceClient.requestFetch.mockResolvedValue({
        status: 200, ok: true, text: '{"data":[{"id":1}]}',
      });

      const result = await httpClient.getJson('/api/movies');

      expect(requestServiceClient.requestFetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/movies`,
        expect.objectContaining({ headers: { accept: 'application/json' } }),
      );
      expect(result).toEqual({ data: [{ id: 1 }] });
    });

    it('returns null on a 403 (challenge page)', async () => {
      requestServiceClient.requestFetch.mockResolvedValue({
        status: 403, ok: false, text: '<title>Just a moment...</title>',
      });
      expect(await httpClient.getJson('/api/movies')).toBeNull();
    });

    it('returns null when the response body signals a challenge stage', async () => {
      requestServiceClient.requestFetch.mockResolvedValue({
        status: 200, ok: true, text: '<html>cf-challenge-stage</html>',
      });
      expect(await httpClient.getJson('/api/movies')).toBeNull();
    });

    it('returns null on a non-2xx response that is not a challenge', async () => {
      requestServiceClient.requestFetch.mockResolvedValue({
        status: 500, ok: false, text: 'server error',
      });
      expect(await httpClient.getJson('/api/movies')).toBeNull();
    });

    it('returns null when the body is not valid JSON', async () => {
      requestServiceClient.requestFetch.mockResolvedValue({
        status: 200, ok: true, text: 'not-json',
      });
      expect(await httpClient.getJson('/api/movies')).toBeNull();
    });
  });

  // ── getStreamData / getEpisodeStreamData ─────────────────────────────────
  describe('stream delegation', () => {
    it('delegates getStreamData to streamClient', async () => {
      streamClient.getStreamData.mockResolvedValue({ streamUrl: 'm3u8' });
      const result = await httpClient.getStreamData('slug-1');
      expect(streamClient.getStreamData).toHaveBeenCalledWith('slug-1');
      expect(result).toEqual({ streamUrl: 'm3u8' });
    });

    it('delegates getEpisodeStreamData to streamClient', async () => {
      streamClient.getEpisodeStreamData.mockResolvedValue({ streamUrl: 'm3u8' });
      const result = await httpClient.getEpisodeStreamData('slug', 2, 3);
      expect(streamClient.getEpisodeStreamData).toHaveBeenCalledWith('slug', 2, 3);
      expect(result).toEqual({ streamUrl: 'm3u8' });
    });
  });

  // ── close ────────────────────────────────────────────────────────────────
  describe('close()', () => {
    it('is a no-op that resolves', async () => {
      await expect(httpClient.close()).resolves.toBeUndefined();
    });
  });
});
