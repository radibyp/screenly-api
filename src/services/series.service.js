'use strict';

const httpClient = require('../lib/httpClient');
const cache      = require('../lib/cacheService');
const { CACHE_TTL } = require('../config/env');
const { mapApiItem, mapApiDetail } = require('../lib/scraper');

/**
 * Fetch and parse the TV series browse page with pagination.
 * @param {number} [page=1]
 * @param {number} [limit=36]
 * @param {string} [sort='createdAt']
 * @returns {Promise<{ items: Array, pagination: Object }>}
 */
async function getBrowse(page = 1, limit = 36, sort = 'createdAt') {
  const key = `series.browse.p${page}.l${limit}.s${sort}`;
  if (cache.isHit(key, CACHE_TTL.page)) return cache.get(key);

  const data = await httpClient.getJson(`/api/series?page=${page}&limit=${limit}&sort=${sort}`);
  const items = (data?.data || []).map(item => mapApiItem(item, { hintType: 'series' })).filter(Boolean);

  const totalPages = data?.last_page || data?.meta?.last_page || 0;
  const currentPage = data?.current_page || data?.meta?.current_page || page;
  const hasNext = totalPages > 0 ? currentPage < totalPages : items.length >= limit;

  const result = {
    items,
    pagination: { currentPage, totalPages, hasNext },
  };

  cache.set(key, result);
  return result;
}

/**
 * Fetch and parse trending TV series from the homepage.
 * @returns {Promise<Array>}
 */
async function getTrending() {
  const key = 'trending.tv';
  if (cache.isHit(key, CACHE_TTL.trending)) return cache.get(key);

  const data = await httpClient.getJson('/api/homepage');
  if (!data || !data.above) return [];

  const section = data.above.find(s => s.title && s.title.toLowerCase().includes('trending')) || data.above[0];
  const items = (section?.data || []).map(item => mapApiItem(item, { hintType: 'series' })).filter(i => i.type === 'series');
  
  cache.set(key, items);
  return items;
}


/**
 * Fetch a series detail page by slug.
 * Returns rich metadata from the native JSON API.
 *
 * @param {string} slug - e.g. "the-last-of-us-2023"
 * @returns {Promise<Object>}
 */
async function getDetail(slug) {
  const key = `series.detail.${slug}`;
  if (cache.isHit(key, CACHE_TTL.detail)) return cache.get(key);

  const data = await httpClient.getJson(`/api/series/${slug}`);
  const detail = mapApiDetail(data);

  if (!detail.title) {
    const err = new Error('Series not found');
    err.status = 404;
    throw err;
  }

  cache.set(key, detail);
  return detail;
}

/**
 * Fetch the stream data for a series episode: URL, subtitles, and metadata.
 *
 * Delegates to httpClient.getStreamData which runs the full API chain.
 * Results are cached with a short TTL since stream URLs expire.
 *
 * @param {string} slug - e.g. "the-last-of-us-2023"
 * @returns {Promise<{
 *   streamUrl:   string | null,
 *   subtitles:   Array<{ lang: string, label: string, url: string }>,
 *   videoId:     string | null,
 *   title:       string | null,
 *   durationSec: number | null,
 *   maxHeight:   number | null,
 *   expiresAt:   number | null,
 * }>}
 */
async function getStreamData(slug) {
  const key = `series.stream.${slug}`;
  if (cache.isHit(key, CACHE_TTL.stream)) return cache.get(key);

  const result = await httpClient.getEpisodeStreamData(slug, 1, 1);
  if (result.streamUrl) cache.set(key, result);
  return result;
}

/**
 * Fetch stream data for a specific series episode.
 *
 * @param {string} slug    - e.g. "oasis-2026"
 * @param {number} season  - Season number (1-based)
 * @param {number} episode - Episode number (1-based)
 * @returns {Promise<{
 *   streamUrl:   string | null,
 *   subtitles:   Array<{ lang: string, label: string, url: string }>,
 *   videoId:     string | null,
 *   title:       string | null,
 *   durationSec: number | null,
 *   maxHeight:   number | null,
 *   expiresAt:   number | null,
 * }>}
 */
async function getEpisodeStreamData(slug, season, episode) {
  const key = `series.stream.${slug}.s${season}e${episode}`;
  if (cache.isHit(key, CACHE_TTL.stream)) return cache.get(key);

  const result = await httpClient.getEpisodeStreamData(slug, Number(season), Number(episode));
  if (result.streamUrl) cache.set(key, result);
  return result;
}

module.exports = {
  getBrowse,
  getTrending,

  getDetail,
  getStreamData,
  getEpisodeStreamData,
};