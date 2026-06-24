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

describe('Catalog Routes', () => {
  let app;

  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    jest.clearAllMocks();
    cache.isHit.mockReturnValue(false);
    cache.get.mockReturnValue(null);
  });

  describe('GET /api/genre', () => {
    it('returns the genre index list with envelope', async () => {
      httpClient.getJson.mockResolvedValue({
        data: [{ name: 'Drama', slug: 'drama' }, { name: 'Action', slug: 'action' }]
      });

      const res = await request(app).get('/api/genre');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0]).toMatchObject({
        title: 'Drama',
        slug: 'drama'
      });
      expect(httpClient.getJson).toHaveBeenCalledWith('/api/genres');
    });
  });

  describe('GET /api/country', () => {
    it('returns the country index list with envelope', async () => {
      httpClient.getJson.mockResolvedValue({
        data: [{ name: 'China', code: 'CN' }]
      });

      const res = await request(app).get('/api/country');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0]).toMatchObject({
        title: 'China',
        code: 'CN'
      });
      expect(httpClient.getJson).toHaveBeenCalledWith('/api/browse/countries');
    });
  });

  describe('GET /api/country/:country', () => {
    it('returns filtered media for a country page', async () => {
      httpClient.getJson.mockImplementation(async (url) => {
        if (url.includes('/api/series')) {
          return { data: [{ title: 'Country Series 1', slug: 'country-series-1', contentType: 'series' }] };
        }
        return { data: [{ title: 'Country Movie 1', slug: 'country-movie-1', contentType: 'movie' }] };
      });

      const res = await request(app).get('/api/country/CN?type=series');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe('series');
      expect(httpClient.getJson).toHaveBeenCalledWith('/api/series?country=CN&page=1&limit=36&sort=createdAt');
    });

    it('returns 404 for a paged request beyond page 1 when no results', async () => {
      httpClient.getJson.mockResolvedValue({ data: [] });

      const res = await request(app).get('/api/country/CN/2');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/year', () => {
    it('returns the year index list with envelope', async () => {
      httpClient.getJson.mockResolvedValue({
        data: ['2026', '2025']
      });

      const res = await request(app).get('/api/year');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0]).toMatchObject({
        title: '2026',
        year: 2026
      });
      expect(httpClient.getJson).toHaveBeenCalledWith('/api/browse/years');
    });
  });

  describe('GET /api/year/:year', () => {
    it('returns media for a year page', async () => {
      httpClient.getJson.mockResolvedValue({
        data: [
          { title: 'Year Movie 1', slug: 'year-movie-1', contentType: 'movie' }
        ]
      });

      const res = await request(app).get('/api/year/2026?type=movie');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe('movie');
      expect(httpClient.getJson).toHaveBeenCalledWith('/api/movies?year=2026&page=1&limit=36&sort=createdAt');
    });
  });

  describe('GET /api/network', () => {
    it('returns the network index list with envelope', async () => {
      const res = await request(app).get('/api/network');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0]).toMatchObject({
        title: 'Netflix',
        network: 'netflix'
      });
      expect(httpClient.getJson).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/network/:network', () => {
    it('returns media for a network page', async () => {
      httpClient.getJson.mockResolvedValue({
        data: [
          { title: 'Network Movie 1', slug: 'network-movie-1', contentType: 'movie' }
        ]
      });

      const res = await request(app).get('/api/network/hbo');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(httpClient.getJson).toHaveBeenCalledWith('/api/movies?network=hbo&page=1&limit=36&sort=createdAt');
    });
  });

  describe('GET /api/search', () => {
    it('returns search results with query metadata', async () => {
      httpClient.getJson.mockResolvedValue({
        results: [
          { title: 'Batman Movie', slug: 'batman-movie', contentType: 'movie' }
        ]
      });

      const res = await request(app).get('/api/search?q=batman');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.query).toBe('batman');
      expect(httpClient.getJson).toHaveBeenCalledWith('/api/search?q=batman');
    });

    it('returns 400 when query is too short', async () => {
      const res = await request(app).get('/api/search?q=a');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when query is missing', async () => {
      const res = await request(app).get('/api/search');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/leaderboard', () => {
    it('returns leaderboard with metadata', async () => {
      httpClient.getJson.mockResolvedValue({
        month: 'June 2026',
        updatedAt: '2026-06-24',
        topMovies: [{ title: 'Top Movie', slug: 'top-movie', contentType: 'movie' }],
        topSeries: []
      });

      const res = await request(app).get('/api/leaderboard');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data).toBe('object');
      expect(Array.isArray(res.body.data.topMovies)).toBe(true);
      expect(res.body.data.topMovies[0].title).toBe('Top Movie');
    });
  });

  describe('GET /api/home', () => {
    it('returns homepage items', async () => {
      httpClient.getJson.mockResolvedValue({
        above: [
          {
            title: 'Trending Now',
            data: [{ title: 'Trending Movie 1', slug: 'trending-movie-1', contentType: 'movie' }]
          }
        ]
      });

      const res = await request(app).get('/api/home');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0].title).toBe('Trending Movie 1');
    });
  });
});
