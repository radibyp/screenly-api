'use strict';

// Must be hoisted before any require of the real modules
jest.mock('../../src/lib/httpClient', () => ({
  getJson: jest.fn(),
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

describe('Genre Routes', () => {
  let app;

  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    jest.clearAllMocks();
    cache.isHit.mockReturnValue(false);
    cache.get.mockReturnValue(null);
  });

  // ── GET /api/genre/movie/:genre ───────────────────────────────────────────

  describe('GET /api/genre/movie/:genre', () => {
    it('returns 200 with movies for a valid genre (no page)', async () => {
      httpClient.getJson.mockResolvedValue({
        data: [{ title: 'Action Movie 1', slug: 'action-movie-1', contentType: 'movie' }]
      });

      const res = await request(app).get('/api/genre/movie/action');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Action Movie 1');
      expect(httpClient.getJson).toHaveBeenCalledWith('/api/movies?genre=action&page=1&limit=36&sort=createdAt');
    });

    it('returns 200 with movies for page 1', async () => {
      httpClient.getJson.mockResolvedValue({
        data: [{ title: 'Action Movie 1', slug: 'action-movie-1', contentType: 'movie' }]
      });

      const res = await request(app).get('/api/genre/movie/action/1');

      expect(res.status).toBe(200);
      expect(httpClient.getJson).toHaveBeenCalledWith('/api/movies?genre=action&page=1&limit=36&sort=createdAt');
    });

    it('returns 404 for page 2 when no results', async () => {
      httpClient.getJson.mockResolvedValue({ data: [] });

      const res = await request(app).get('/api/genre/movie/action/2');

      expect(res.status).toBe(404);
    });

    it('uses cache when the entry is fresh', async () => {
      const cached = [{ title: 'Cached Movie', link: {} }];
      cache.isHit.mockReturnValue(true);
      cache.get.mockReturnValue(cached);

      const res = await request(app).get('/api/genre/movie/action');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(cached);
      expect(httpClient.getJson).not.toHaveBeenCalled();
    });

    it('returns 400 for a non-numeric page', async () => {
      const res = await request(app).get('/api/genre/movie/action/abc');
      expect(res.status).toBe(400);
      expect(httpClient.getJson).not.toHaveBeenCalled();
    });

    it('returns 400 for a genre containing special characters', async () => {
      const res = await request(app).get('/api/genre/movie/action<xss>');
      expect(res.status).toBe(400);
    });

    it('returns 500 on network error', async () => {
      httpClient.getJson.mockRejectedValue(new Error('timeout'));

      const res = await request(app).get('/api/genre/movie/action');

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ success: false });
    });
  });

  // ── GET /api/genre/series/:genre ─────────────────────────────────────────

  describe('GET /api/genre/series/:genre', () => {
    it('returns 200 with TV series for a valid genre', async () => {
      httpClient.getJson.mockResolvedValue({
        data: [{ title: 'Action Series 1', slug: 'action-series-1', contentType: 'series' }]
      });

      const res = await request(app).get('/api/genre/series/action');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Action Series 1');
      expect(httpClient.getJson).toHaveBeenCalledWith('/api/series?genre=action&page=1&limit=36&sort=createdAt');
    });

    it('returns 200 with series for page 1', async () => {
      httpClient.getJson.mockResolvedValue({
        data: [{ title: 'Action Series 1', slug: 'action-series-1', contentType: 'series' }]
      });

      const res = await request(app).get('/api/genre/series/action/1');

      expect(res.status).toBe(200);
      expect(httpClient.getJson).toHaveBeenCalledWith('/api/series?genre=action&page=1&limit=36&sort=createdAt');
    });

    it('returns 404 for page 3 when no results', async () => {
      httpClient.getJson.mockResolvedValue({ data: [] });

      const res = await request(app).get('/api/genre/series/action/3');

      expect(res.status).toBe(404);
    });

    it('returns 400 for a non-numeric page', async () => {
      const res = await request(app).get('/api/genre/series/action/xyz');
      expect(res.status).toBe(400);
    });

    it('returns 200 or 500 for a hyphen-only genre "-"', async () => {
      httpClient.getJson.mockResolvedValue({
        data: [{ title: 'Hyphen Series', slug: 'hyphen-series', contentType: 'series' }]
      });
      const res = await request(app).get('/api/genre/series/-');
      expect([200, 500]).toContain(res.status);
    });

    it('returns 500 on network error', async () => {
      httpClient.getJson.mockRejectedValue(new Error('timeout'));

      const res = await request(app).get('/api/genre/series/drama');

      expect(res.status).toBe(500);
    });
  });

  // ── 404 catch-all ─────────────────────────────────────────────────────────

  describe('Unknown routes', () => {
    it('returns 404 JSON for an unrecognised path', async () => {
      const res = await request(app).get('/api/genre/unknown-type/action/extra');
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ success: false });
    });
  });
});
