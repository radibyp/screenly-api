'use strict';

/**
 * IDLIX Stream Client
 *
 * All upstream API calls run via the external request service
 * (requestServiceClient.requestFetch) — a rendering microservice that issues
 * requests with a real browser fingerprint and session. Only the majorplay.net
 * redeem call (step 6) uses a plain Node.js fetch() since it is a separate,
 * unprotected domain.
 *
 * ── Movie Chain ───────────────────────────────────────────────────────────────
 *   1. GET  /api/movies/{slug}                   → content UUID
 *   2. POST /api/views/track                     → analytics (best-effort)
 *   3. GET  /api/watch/play-info/movie/{uuid}    → gateToken + countdown
 *   4. Wait unlockAt − serverNow ms (approx 15 s)
 *   5. POST /api/watch/session/claim             → claim JWT + redeemUrl
 *   6. POST redeemUrl (majorplay.net/api/play)   → stream config + subtitles
 *
 * ── Series/Episode Chain ─────────────────────────────────────────────────────
 *   1a. GET  /api/serieses/{slug}                → series UUID
 *   1b. GET  episode page HTML                   → episode UUID (from DOM)
 *   2.  POST /api/views/track  (contentType:"tv_series", contentId, episodeId)
 *   3.  GET  /api/watch/play-info/episode/{uuid} → gateToken + countdown
 *   4.  Wait unlockAt − serverNow ms
 *   5.  POST /api/watch/session/claim            → claim JWT + redeemUrl
 *   6.  POST majorplay.net/api/play              → stream config + subtitles
 */

const { BASE_URL } = require('../config/env');
const { requestFetch } = require('./requestServiceClient');

const UA = 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36';



// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse JSON from a requestFetch result text. Returns null on failure.
 * @param {{ status: number, ok: boolean, text: string }} result
 * @param {string} [label] - Optional label for logging context.
 * @returns {object|null}
 */
function parseJson(result, label) {
  if (!result.ok || !result.text) {
    if (label && result.status !== 0) {
      console.warn(`[streamClient] ${label}: upstream returned ${result.status}`);
    }
    return null;
  }
  try {
    return JSON.parse(result.text);
  } catch (_) {
    // Log a snippet of the unparseable response for diagnostics
    const snippet = (result.text || '').substring(0, 120);
    console.warn(`[streamClient] ${label || 'parseJson'}: response is not valid JSON — ${snippet}`);
    return null;
  }
}

/**
 * Fallback empty stream result.
 * @returns {object}
 */
function emptyResult() {
  return {
    streamUrl:   null,
    subtitles:   [],
    videoId:     null,
    title:       null,
    durationSec: null,
    maxHeight:   null,
    expiresAt:   null,
  };
}

// ── Step implementations ──────────────────────────────────────────────────────

/**
 * Step 1 (movie): GET /api/movies/{slug} → movie UUID.
 * @param {string} slug
 * @param {string} referer
 * @returns {Promise<string|null>}
 */
async function resolveMovieUuid(slug, referer) {
  const url = `${BASE_URL}/api/movies/${slug}`;
  console.log(`[streamClient] Step 1: GET ${url}`);

  const res  = await requestFetch(url, { headers: { referer } });
  const data = parseJson(res);

  if (!data) {
    console.warn(`[streamClient] Step 1 failed: ${res.status} — ${res.text.substring(0, 120)}`);
    return null;
  }

  const uuid = data?.id || data?.data?.id;
  if (!uuid) {
    console.warn(`[streamClient] Step 1: no UUID in response`);
    return null;
  }

  console.log(`[streamClient] Step 1 ✅ movie UUID: ${uuid}`);
  return uuid;
}

/**
 * Steps 1a + 1b (series):
 *   GET /api/series/{slug}/season/{season} → returns series UUID and season episodes list
 *
 * @param {string} slug
 * @param {number} season
 * @param {number} episode
 * @returns {Promise<{ seriesUuid: string|null, episodeUuid: string|null }>}
 */
async function resolveSeriesAndEpisodeUuids(slug, season, episode) {
  const referer = `${BASE_URL}/series/${slug}/season/${season}/episode/${episode}`;
  const apiUrl  = `${BASE_URL}/api/series/${slug}/season/${season}`;

  console.log(`[streamClient] Step 1a/1b: GET ${apiUrl}`);

  const res = await requestFetch(apiUrl, {
    headers: {
      'accept': 'application/json',
      referer
    }
  });

  const data = parseJson(res);
  if (!data || !data.series || !data.season) {
    console.warn(`[streamClient] Step 1a/1b failed to get season data`);
    return { seriesUuid: null, episodeUuid: null };
  }

  const seriesUuid  = data.series.id || null;
  const episodeObj  = (data.season.episodes || []).find(e => e.episodeNumber === Number(episode));
  const episodeUuid = episodeObj ? episodeObj.id : null;

  if (seriesUuid) {
    console.log(`[streamClient] Step 1a ✅ series UUID: ${seriesUuid}`);
  } else {
    console.warn(`[streamClient] Step 1a: could not resolve series UUID`);
  }

  if (episodeUuid) {
    console.log(`[streamClient] Step 1b ✅ episode UUID: ${episodeUuid}`);
  } else {
    console.warn(`[streamClient] Step 1b: could not find episode ${episode} in season ${season}`);
  }

  return { seriesUuid, episodeUuid };
}

/**
 * Step 2: POST /api/views/track (analytics — failures silently ignored).
 * @param {string}      contentType - "movie" | "tv_series"
 * @param {string}      contentId
 * @param {string}      referer
 * @param {string|null} [episodeId]
 */
async function trackView(contentType, contentId, referer, episodeId = null) {
  const url = `${BASE_URL}/api/views/track`;
  try {
    const body = JSON.stringify({ contentType, contentId, ...(episodeId ? { episodeId } : {}) });
    const res  = await requestFetch(url, {
      method:  'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'origin':       BASE_URL,
        referer,
      },
    });
    console.log(`[streamClient] Step 2 (views/track): ${res.status}`);
  } catch (err) {
    console.warn(`[streamClient] Step 2 error (ignored): ${err.message}`);
  }
}

/**
 * Step 3: GET /api/watch/play-info/{type}/{uuid}.
 * @param {string} playInfoType - "movie" | "episode"
 * @param {string} uuid
 * @param {string} referer
 * @returns {Promise<object|null>}
 */
async function getPlayInfo(playInfoType, uuid, referer) {
  const url = `${BASE_URL}/api/watch/play-info/${playInfoType}/${uuid}`;
  console.log(`[streamClient] Step 3: GET ${url}`);

  const res  = await requestFetch(url, { headers: { referer } });
  const data = parseJson(res);

  if (!data) {
    console.warn(`[streamClient] Step 3 failed: ${res.status}`);
    return null;
  }

  console.log(`[streamClient] Step 3 ✅ kind=${data.kind}, tier=${data.viewerTier}`);
  return data;
}

/**
 * Step 5: POST /api/watch/session/claim.
 * @param {string} gateToken
 * @param {string} referer
 * @returns {Promise<object|null>}
 */
async function claimSession(gateToken, referer) {
  const url = `${BASE_URL}/api/watch/session/claim`;
  console.log(`[streamClient] Step 5: POST ${url}`);

  const res  = await requestFetch(url, {
    method:  'POST',
    body:    JSON.stringify({ gateToken }),
    headers: {
      'content-type': 'application/json',
      'origin':       BASE_URL,
      referer,
    },
  });
  const data = parseJson(res);

  if (!data || !data.claim || !data.redeemUrl) {
    console.warn(`[streamClient] Step 5 failed: ${res.status} — ${(res.text || '').substring(0, 120)}`);
    return null;
  }

  console.log(`[streamClient] Step 5 ✅ kind=${data.kind}, redeemUrl=${data.redeemUrl}`);
  return data;
}

/**
 * Step 6: POST to majorplay.net/api/play (plain Node.js fetch).
 * This is a separate domain with no rendering requirement, so it does not need
 * to go through the external request service. content-type MUST be "text/plain"
 * to skip CORS preflight.
 *
 * @param {string} redeemUrl
 * @param {string} claim
 * @returns {Promise<object|null>}
 */
async function redeemClaim(redeemUrl, claim) {
  console.log(`[streamClient] Step 6: POST ${redeemUrl}`);

  // majorplay.net is a separate domain with no rendering requirement, so a
  // plain Node.js fetch with the correct origin + referer headers suffices.
  const res = await fetch(redeemUrl, {
    method:  'POST',
    headers: {
      'accept':             '*/*',
      'accept-language':    'en-US,en;q=0.9',
      'content-type':       'text/plain',
      'origin':             BASE_URL,
      'referer':            `${BASE_URL}/`,
      'sec-ch-ua':          '"Not/A)Brand";v="99", "Chromium";v="148"',
      'sec-ch-ua-mobile':   '?1',
      'sec-ch-ua-platform': '"Android"',
      'sec-fetch-dest':     'empty',
      'sec-fetch-mode':     'cors',
      'sec-fetch-site':     'cross-site',
      'user-agent':         UA,
    },
    body: JSON.stringify({ claim }),
  });

  if (!res.ok) {
    console.warn(`[streamClient] Step 6 failed: ${res.status}`);
    return null;
  }

  const data = await res.json();
  if (data.code !== 'ok') {
    console.warn(`[streamClient] Step 6 unexpected code: ${data.code}`);
    return null;
  }

  console.log(`[streamClient] Step 6 ✅ ${(data.subtitles || []).length} subtitle(s)`);
  return data;
}

/**
 * Shared tail: steps 3–6.
 * @param {string} playInfoType
 * @param {string} playInfoUuid
 * @param {string} referer
 * @param {string} label
 * @returns {Promise<object>}
 */
async function runStreamTail(playInfoType, playInfoUuid, referer, label) {
  // Step 3
  const playInfo = await getPlayInfo(playInfoType, playInfoUuid, referer);
  if (!playInfo) return emptyResult();

  if (playInfo.kind !== 'gate') {
    console.warn(`[streamClient] Unexpected play-info kind: "${playInfo.kind}"`);
    return emptyResult();
  }

  // Step 4: wait for countdown
  const countdownMs = playInfo.unlockAt - playInfo.serverNow;
  const waitMs = Math.min(Math.max(0, countdownMs + 500), 20000);
  if (waitMs > 0) {
    console.log(`[streamClient] Step 4: waiting ${waitMs}ms...`);
    await new Promise(r => setTimeout(r, waitMs));
  }

  // Step 5
  const claimData = await claimSession(playInfo.gateToken, referer);
  if (!claimData) return emptyResult();

  // Step 6 (plain Node.js fetch — majorplay.net needs no rendering service)
  const playData = await redeemClaim(claimData.redeemUrl, claimData.claim);
  if (!playData) return emptyResult();

  const subtitles = (playData.subtitles || []).map(s => ({
    lang:  s.lang,
    label: s.label,
    url:   s.path,
  }));

  console.log(`[streamClient] ✅ Stream ready — ${label}`);

  return {
    streamUrl:   playData.url || null,
    subtitles,
    videoId:     playData.videoId     || claimData.videoId     || null,
    title:       claimData.title      || null,
    durationSec: claimData.durationSec || null,
    maxHeight:   playData.maxHeight   || claimData.maxHeight   || null,
    expiresAt:   playData.expiresAt   || null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Full streaming chain for a MOVIE.
 * @param {string} slug
 * @returns {Promise<StreamResult>}
 */
async function getStreamData(slug) {
  const referer = `${BASE_URL}/movie/${slug}`;

  const uuid = await resolveMovieUuid(slug, referer);
  if (!uuid) return emptyResult();

  await trackView('movie', uuid, referer);

  return runStreamTail('movie', uuid, referer, `movie/${slug}`);
}

/**
 * Full streaming chain for a SERIES EPISODE.
 * @param {string} slug
 * @param {number} season
 * @param {number} episode
 * @returns {Promise<StreamResult>}
 */
async function getEpisodeStreamData(slug, season, episode) {
  const referer = `${BASE_URL}/series/${slug}/season/${season}/episode/${episode}`;

  const { seriesUuid, episodeUuid } = await resolveSeriesAndEpisodeUuids(slug, season, episode);

  if (!episodeUuid) {
    console.error(`[streamClient] Cannot proceed without episode UUID`);
    return emptyResult();
  }

  await trackView('tv_series', seriesUuid || episodeUuid, referer, episodeUuid);

  return runStreamTail('episode', episodeUuid, referer,
    `series/${slug}/s${season}e${episode}`);
}

module.exports = { getStreamData, getEpisodeStreamData };
