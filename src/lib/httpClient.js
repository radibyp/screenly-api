'use strict';

/**
 * Lightweight HTTP client for the IDLIX scraper.
 *
 * All z2.idlixku.com requests go through the browser session
 * (cookieHarvester) to ensure the correct Cloudflare TLS fingerprint.
 *
 * Public API:
 *   get(path)                      → Promise<{ data: html }>
 *   getJson(path)                  → Promise<Object|null>
 *   getStreamData(slug)            → Promise<StreamResult>
 *   getEpisodeStreamData(s,se,ep)  → Promise<StreamResult>
 *   close()                        → Promise<void>
 */

const { BASE_URL } = require('../config/env');
const { fetchHtml, browserFetch, getCookieHeader, invalidate } = require('./cfBypass/cookieHarvester');
const { getStreamData, getEpisodeStreamData } = require('./streamClient');

// ── Public API ──────────────────────────────────────────────────────────────────

const httpClient = {
  /**
   * GET a path on the upstream IDLIX site.
   * Navigates via the browser (correct TLS fingerprint + CF cookies).
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
   * Fetch a JSON API endpoint via the browser session.
   *
   * @param {string} path - Path relative to BASE_URL.
   * @returns {Promise<Object|null>}
   */
  async getJson(path) {
    const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    console.log(`[httpClient:getJson] Fetching URL: ${url}`);
    
    const res = await browserFetch(url, {
      headers: { accept: 'application/json' },
    });
    
    console.log(`[httpClient:getJson] HTTP Status: ${res.status}`);
    console.log(`[httpClient:getJson] Raw Response (first 1000 chars):\n${(res.text || '').substring(0, 1000)}`);
    
    if (res.status === 403 || res.text.includes('<title>Just a moment...</title>') || res.text.includes('cf-challenge-stage') || res.text.includes('__cf_chl_opt')) {
      console.error(`[httpClient:getJson] Validation Error: Detected Cloudflare or anti-bot protection page.`);
      return null;
    }

    if (!res.ok) return null;
    
    try { 
      return JSON.parse(res.text); 
    } catch (err) { 
      console.error(`[httpClient:getJson] Error parsing JSON. Response may not be valid JSON.`);
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
   * The browser session is managed by cookieHarvester (closed on process exit).
   */
  async close() {},
};

module.exports = httpClient;