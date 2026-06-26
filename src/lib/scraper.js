'use strict';

const { BASE_URL } = require('../config/env');

/**
 * Maps a native JSON API item from IDLIX into our standardized schema.
 * @param {Object} item - The raw JSON item from /api/movies, /api/series or /api/homepage
 * @param {Object} [opts] - Optional context hints.
 * @param {'movie'|'series'} [opts.hintType] - Force the output type when the
 *   upstream JSON lacks a contentType field (e.g. /api/series items).
 * @returns {Object} Standardized media item
 */
function mapApiItem(item, opts) {
  if (!item) return null;

  const source = item.content ? item.content : item;
  const contentType = item.contentType || source.contentType || null;
  const isSeries = contentType === 'series' || contentType === 'tv_series';

  // When the upstream JSON omits contentType (happens on /api/series browse),
  // accept the caller's hint so items aren't all mis-tagged as "movie".
  let type;
  if (isSeries) {
    type = 'series';
  } else if (contentType === 'movie' || contentType === 'film') {
    type = 'movie';
  } else if (opts && opts.hintType) {
    type = opts.hintType;
  } else {
    type = 'movie';
  }

  const slug = source.slug;
  if (!slug) return null;

  const endpoint = `${type === 'series' ? 'series' : 'movie'}/${slug}`;

  let year = null;
  const releaseDate = source.releaseDate || source.firstAirDate;
  if (releaseDate) {
    year = parseInt(String(releaseDate).substring(0, 4), 10) || null;
  }

  const posterUrl = source.posterPath ? `https://image.tmdb.org/t/p/w300${source.posterPath}` : null;
  const backdropUrl = source.backdropPath ? `https://image.tmdb.org/t/p/w1280${source.backdropPath}` : null;

  return {
    title: source.title || '',
    originalTitle: source.originalTitle || source.title || '',
    year,
    type,
    quality: source.quality || null,
    rating: source.voteAverage ? parseFloat(source.voteAverage) : null,
    season: null,
    poster: posterUrl,
    backdrop: backdropUrl,
    slug,
    link: {
      endpoint,
      url: `${BASE_URL}/${endpoint}`,
      thumbnail: posterUrl
    }
  };
}

/**
 * Maps a native JSON API detail item from IDLIX into our standardized schema.
 * @param {Object} item - The raw JSON item from /api/movies/:slug or /api/series/:slug
 * @returns {Object} Standardized detail item
 */
function mapApiDetail(item) {
  if (!item) return {};
  const isSeries = !!item.numberOfSeasons;
  const endpoint = `${isSeries ? 'series' : 'movie'}/${item.slug}`;

  let year = null;
  const dateStr = item.releaseDate || item.firstAirDate;
  if (dateStr) {
    year = parseInt(String(dateStr).substring(0, 4), 10) || null;
  }

  const posterUrl = item.posterPath ? `https://image.tmdb.org/t/p/w300${item.posterPath}` : null;
  const backdropUrl = item.backdropPath ? `https://image.tmdb.org/t/p/w1280${item.backdropPath}` : null;

  let runtime = null;
  let runtimeMinutes = null;
  if (item.runtime) {
    runtimeMinutes = parseInt(item.runtime, 10);
    runtime = `PT${runtimeMinutes}M`;
  }

  return {
    title: item.title || '',
    year,
    type: isSeries ? 'series' : 'movie',
    runtime,
    runtimeMinutes,
    overview: item.overview || null,
    poster: posterUrl,
    backdrop: backdropUrl,
    genres: (item.genres || []).map(g => g.name).filter(Boolean),
    country: item.country || null,
    countryCode: null,
    language: item.originalLanguage || null,
    director: item.director ? { name: item.director, url: null } : null,
    cast: (item.cast || []).map(c => ({
      name: c.name,
      character: c.character,
      image: c.profilePath ? `https://image.tmdb.org/t/p/w185${c.profilePath}` : null
    })),
    trailer: item.trailerUrl || null,
    watchUrl: `${BASE_URL}/${endpoint}?play=1`,
    streamUrl: null, // Fetched separately
    keywords: (item.keywords || []).map(k => k.name).filter(Boolean),
    recommendations: [], // Can be populated if API provides it
    seasons: isSeries ? (item.seasons || []).map(s => ({
      name: s.name,
      seasonNumber: s.seasonNumber,
      episodeCount: s.episodeCount,
      episodes: (s.episodes || []).map(e => ({
        episodeNumber: e.episodeNumber,
        title: e.title,
        overview: e.overview
      }))
    })) : null
  };
}

module.exports = {
  mapApiItem,
  mapApiDetail,
};