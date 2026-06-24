'use strict';

// Must be hoisted before any require of the real modules
jest.mock('../../src/lib/httpClient', () => ({
  getJson:       jest.fn(),
  getStreamData: jest.fn(),
  getEpisodeStreamData: jest.fn(),
}));
jest.mock('../../src/lib/cacheService', () => ({
  isHit: jest.fn(),
  get:   jest.fn(),
  set:   jest.fn(),
}));

const request    = require('supertest');
const createApp  = require('../../src/app');
const httpClient = require('../../src/lib/httpClient');
const cache      = require('../../src/lib/cacheService');

describe('Series Routes', () => {
  let app;

  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    jest.clearAllMocks();
    cache.isHit.mockReturnValue(false);
    cache.get.mockReturnValue(null);
  });

  // ── GET /api/series ────────────────────────────────────────────────────────

  describe('GET /api/series', () => {
    it('returns 200 with series browse items', async () => {
      httpClient.getJson.mockResolvedValue({
        data: [
          { title: 'Series 1', slug: 'series-1', contentType: 'series' },
          { title: 'Series 2', slug: 'series-2', contentType: 'series' }
        ]
      });

      const res = await request(app).get('/api/series');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(httpClient.getJson).toHaveBeenCalledWith('/api/series?page=1&limit=36&sort=createdAt');
    });
  });

  // ── GET /api/series/trending ──────────────────────────────────────────────

  describe('GET /api/series/trending', () => {
    it('returns 200 with trending TV series from homepage', async () => {
      httpClient.getJson.mockResolvedValue({
        above: [
          {
            title: 'Trending Now',
            data: [
              { title: 'Trending Movie 1', slug: 'trending-movie-1', contentType: 'movie' },
              { title: 'Trending Series 1', slug: 'trending-series-1', contentType: 'series' },
              { title: 'Trending Series 2', slug: 'trending-series-2', contentType: 'tv_series' }
            ]
          }
        ]
      });

      const res = await request(app).get('/api/series/trending');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(2); // only series
      expect(res.body.data[0].title).toBe('Trending Series 1');
      expect(httpClient.getJson).toHaveBeenCalledWith('/api/homepage');
    });
  });

  // ── GET /api/series/:slug ─────────────────────────────────────────────────

  describe('GET /api/series/:slug', () => {
    it('returns 200 with rich series detail', async () => {
      httpClient.getJson.mockResolvedValue({
        title: 'Test Series',
        slug: 'test-series-2024',
        firstAirDate: '2024-05-01',
        numberOfSeasons: 1,
        genres: [{ name: 'Drama' }]
      });

      const res = await request(app).get('/api/series/test-series-2024');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        title: 'Test Series',
        year: 2024,
        type: 'series'
      });
      expect(httpClient.getJson).toHaveBeenCalledWith('/api/series/test-series-2024');
    });

    it('returns 400 for invalid slug', async () => {
      const res = await request(app).get('/api/series/invalid@slug');
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent series', async () => {
      httpClient.getJson.mockResolvedValue(null);
      const res = await request(app).get('/api/series/not-found-series');
      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/series/:slug/stream ──────────────────────────────────────────

  describe('GET /api/series/:slug/stream', () => {
    it('returns stream URL when extraction succeeds', async () => {
      httpClient.getStreamData.mockResolvedValue({
        streamUrl:   'https://cdn.example.com/ep.m3u8',
        subtitles:   [{ lang: 'id', label: 'Indonesian', url: 'https://cdn.example.com/id.vtt' }],
        videoId:     'xyz789',
        title:       'Test Series S01E01',
        durationSec: 2700,
        maxHeight:   1080,
        expiresAt:   9999999999,
      });

      const res = await request(app).get('/api/series/some-series-2024/stream');

      expect(res.status).toBe(200);
      expect(res.body.data.streamUrl).toBe('https://cdn.example.com/ep.m3u8');
      expect(Array.isArray(res.body.data.subtitles)).toBe(true);
    });

    it('returns 404 when stream URL cannot be extracted', async () => {
      httpClient.getStreamData.mockResolvedValue({
        streamUrl: null, subtitles: [], videoId: null,
        title: null, durationSec: null, maxHeight: null, expiresAt: null,
      });

      const res = await request(app).get('/api/series/some-series-2024/stream');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ── GET /api/series/:slug/season/:season/episode/:episode/stream ──────────

  describe('GET /api/series/:slug/season/:season/episode/:episode/stream', () => {
    it('returns episode stream URL when extraction succeeds', async () => {
      httpClient.getEpisodeStreamData.mockResolvedValue({
        streamUrl:   'https://cdn.example.com/s1e2.m3u8',
        subtitles:   [],
        videoId:     'ep123',
        title:       'Episode Title',
        durationSec: 3000,
        maxHeight:   720,
        expiresAt:   9999999999,
      });

      const res = await request(app).get('/api/series/some-series-2024/season/1/episode/2/stream');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        slug: 'some-series-2024',
        season: 1,
        episode: 2,
        streamUrl: 'https://cdn.example.com/s1e2.m3u8'
      });
      expect(httpClient.getEpisodeStreamData).toHaveBeenCalledWith('some-series-2024', 1, 2);
    });

    it('returns 400 for invalid season/episode parameters', async () => {
      const res = await request(app).get('/api/series/some-series-2024/season/abc/episode/2/stream');
      expect(res.status).toBe(400);
      expect(httpClient.getEpisodeStreamData).not.toHaveBeenCalled();
    });
  });
});
