'use strict';

jest.mock('../../src/lib/httpClient', () => ({
  getJson: jest.fn(),
}));

const homepageService = require('../../src/services/homepage.service');
const httpClient      = require('../../src/lib/httpClient');
const cache           = require('../../src/lib/cacheService');
const { mapApiItem }  = require('../../src/lib/scraper');

describe('homepage.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cache.clear();
  });

  const homepagePayload = {
    above: [
      {
        title: 'Trending Now',
        data: [
          { title: 'Trending Movie', slug: 'trending-1', contentType: 'movie' },
          { title: 'Trending Series', slug: 'trending-2', contentType: 'series' },
        ],
      },
      {
        title: 'Recently Added Movies',
        data: [{ title: 'Recent', slug: 'recent-1', contentType: 'movie' }],
      },
    ],
    below: [
      { title: 'Network Originals', data: [{ title: 'Net', slug: 'net-1', contentType: 'series' }] },
    ],
  };

  // ── getFeatured ──────────────────────────────────────────────────────────
  describe('getFeatured()', () => {
    it('returns the "featured" (or first) section items', async () => {
      httpClient.getJson.mockResolvedValue(homepagePayload);

      const result = await homepageService.getFeatured();

      expect(httpClient.getJson).toHaveBeenCalledWith('/api/homepage');
      // No "featured" section title → falls back to above[0] (Trending Now)
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ title: 'Trending Movie', type: 'movie' });
    });

    it('throws when getJson returns null (upstream blocked)', async () => {
      httpClient.getJson.mockResolvedValue(null);
      await expect(homepageService.getFeatured()).rejects.toThrow();
    });

    it('returns [] when the "above" section is missing', async () => {
      httpClient.getJson.mockResolvedValue({});
      const result = await homepageService.getFeatured();
      expect(result).toEqual([]);
    });

    it('returns cached items without calling the upstream again', async () => {
      httpClient.getJson.mockResolvedValue(homepagePayload);
      await homepageService.getFeatured();
      httpClient.getJson.mockClear();

      const cached = await homepageService.getFeatured();
      expect(httpClient.getJson).not.toHaveBeenCalled();
      expect(cached).toHaveLength(2);
    });
  });

  // ── getCinemaxxi ─────────────────────────────────────────────────────────
  describe('getCinemaxxi()', () => {
    it('returns the "recently added movies" section items', async () => {
      httpClient.getJson.mockResolvedValue(homepagePayload);
      const result = await homepageService.getCinemaxxi();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ title: 'Recent', type: 'movie' });
    });

    it('returns [] when getJson returns null', async () => {
      httpClient.getJson.mockResolvedValue(null);
      expect(await homepageService.getCinemaxxi()).toEqual([]);
    });

    it('falls back to above[1] when no "recently added movies" title matches', async () => {
      httpClient.getJson.mockResolvedValue({
        above: [
          { title: 'Something Else', data: [{ title: 'A', slug: 'a', contentType: 'movie' }] },
          { title: 'Other', data: [{ title: 'B', slug: 'b', contentType: 'movie' }] },
        ],
      });
      const result = await homepageService.getCinemaxxi();
      expect(result[0].title).toBe('B');
    });
  });

  // ── getHome ──────────────────────────────────────────────────────────────
  describe('getHome()', () => {
    it('flattens all above + below sections into a single array', async () => {
      httpClient.getJson.mockResolvedValue(homepagePayload);
      const result = await homepageService.getHome();
      // 2 (trending) + 1 (recent) + 1 (network) = 4
      expect(result).toHaveLength(4);
    });

    it('returns [] when getJson returns null', async () => {
      httpClient.getJson.mockResolvedValue(null);
      expect(await homepageService.getHome()).toEqual([]);
    });
  });

  // ── getHomeSections ──────────────────────────────────────────────────────
  describe('getHomeSections()', () => {
    it('groups items by section title, skipping untitled sections', async () => {
      httpClient.getJson.mockResolvedValue({
        above: [
          { title: 'Trending Now', data: [{ title: 'T', slug: 't', contentType: 'movie' }] },
          { title: '', data: [{ title: 'NoTitle', slug: 'nt', contentType: 'movie' }] },
        ],
        below: [],
      });

      const result = await homepageService.getHomeSections();

      expect(result['Trending Now']).toHaveLength(1);
      expect(result['Trending Now'][0]).toMatchObject({ slug: 't' });
      // Untitled section is skipped
      expect(Object.keys(result)).toHaveLength(1);
    });

    it('returns {} when getJson returns null', async () => {
      httpClient.getJson.mockResolvedValue(null);
      expect(await homepageService.getHomeSections()).toEqual({});
    });
  });
});
