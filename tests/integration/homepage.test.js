'use strict';

const request    = require('supertest');
const createApp  = require('../../src/app');
const homepageService = require('../../src/services/homepage.service');
const { success, error } = require('../../src/lib/responseHelper');

// Stub the homepage service so we control controller outcomes without touching
// the upstream network.
jest.spyOn(homepageService, 'getFeatured').mockImplementation(() => {});
jest.spyOn(homepageService, 'getCinemaxxi').mockImplementation(() => {});
jest.spyOn(homepageService, 'getHome').mockImplementation(() => {});
jest.spyOn(homepageService, 'getHomeSections').mockImplementation(() => {});

describe('Homepage Routes', () => {
  let app;

  beforeAll(() => { app = createApp(); });

  beforeEach(() => jest.clearAllMocks());

  describe('GET /api/', () => {
    it('returns the v3 status envelope', async () => {
      const res = await request(app).get('/api/');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, repo: 'radityprtama' });
    });
  });

  describe('GET /api/featured', () => {
    it('returns 200 with featured items', async () => {
      const items = [{ title: 'Featured Movie', slug: 'featured-1' }];
      homepageService.getFeatured.mockResolvedValue(items);

      const res = await request(app).get('/api/featured');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(items);
    });

    it('returns 500 when the service throws', async () => {
      homepageService.getFeatured.mockRejectedValue(new Error('upstream blocked'));

      const res = await request(app).get('/api/featured');

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ success: false });
    });
  });

  describe('GET /api/cinemaxxi', () => {
    it('returns 200 with recently added movies', async () => {
      const items = [{ title: 'Recent Movie', slug: 'recent-1' }];
      homepageService.getCinemaxxi.mockResolvedValue(items);

      const res = await request(app).get('/api/cinemaxxi');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(items);
    });

    it('returns 500 on service error', async () => {
      homepageService.getCinemaxxi.mockRejectedValue(new Error('boom'));
      const res = await request(app).get('/api/cinemaxxi');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/home', () => {
    it('returns 200 with the flat homepage array', async () => {
      const items = [{ title: 'Home Movie', slug: 'home-1' }];
      homepageService.getHome.mockResolvedValue(items);

      const res = await request(app).get('/api/home');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(items);
    });

    it('returns 500 on service error', async () => {
      homepageService.getHome.mockRejectedValue(new Error('boom'));
      const res = await request(app).get('/api/home');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/home/sections', () => {
    it('returns 200 with homepage content grouped by section', async () => {
      const sections = { 'Trending Now': [{ title: 'x', slug: 'x' }] };
      homepageService.getHomeSections.mockResolvedValue(sections);

      const res = await request(app).get('/api/home/sections');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(sections);
    });

    it('returns 500 on service error', async () => {
      homepageService.getHomeSections.mockRejectedValue(new Error('boom'));
      const res = await request(app).get('/api/home/sections');
      expect(res.status).toBe(500);
    });
  });

  // ── responseHelper branches not covered elsewhere ────────────────────────
  describe('responseHelper', () => {
    it('error() sends a failure envelope with a custom status', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
      error(res, 'not found', 404);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'not found' });
    });

    it('success() includes pagination/filters/meta when provided', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
      success(res, [1], { pagination: { page: 1 }, filters: { type: 'movie' }, meta: { n: 1 }, status: 201 });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [1],
        pagination: { page: 1 },
        filters: { type: 'movie' },
        meta: { n: 1 },
      });
    });
  });
});
