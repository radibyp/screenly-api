'use strict';

const { mapApiItem, mapApiDetail } = require('../../src/lib/scraper');
const { BASE_URL } = require('../../src/config/env');

describe('scraper.js - mapApiItem', () => {
  it('returns null if item is null or undefined', () => {
    expect(mapApiItem(null)).toBeNull();
    expect(mapApiItem(undefined)).toBeNull();
  });

  it('returns null if item has no slug', () => {
    const raw = { title: 'No Slug' };
    expect(mapApiItem(raw)).toBeNull();
  });

  it('correctly maps a basic movie item', () => {
    const raw = {
      title: 'Test Movie',
      originalTitle: 'Original Test Movie',
      slug: 'test-movie-2026',
      contentType: 'movie',
      releaseDate: '2026-05-24',
      voteAverage: 8.5,
      quality: 'HD',
      posterPath: '/path-to-poster.jpg',
      backdropPath: '/path-to-backdrop.jpg'
    };

    const result = mapApiItem(raw);
    expect(result).toEqual({
      title: 'Test Movie',
      originalTitle: 'Original Test Movie',
      year: 2026,
      type: 'movie',
      quality: 'HD',
      rating: 8.5,
      season: null,
      poster: 'https://image.tmdb.org/t/p/w300/path-to-poster.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w1280/path-to-backdrop.jpg',
      slug: 'test-movie-2026',
      link: {
        endpoint: 'movie/test-movie-2026',
        url: `${BASE_URL}/movie/test-movie-2026`,
        thumbnail: 'https://image.tmdb.org/t/p/w300/path-to-poster.jpg'
      }
    });
  });

  it('correctly maps nested item.content structure', () => {
    const raw = {
      contentType: 'series',
      content: {
        title: 'Nested Series',
        slug: 'nested-series-2026',
        firstAirDate: '2026-10-10',
        voteAverage: '7.8',
        posterPath: '/nested-poster.jpg'
      }
    };

    const result = mapApiItem(raw);
    expect(result).toMatchObject({
      title: 'Nested Series',
      year: 2026,
      type: 'series',
      rating: 7.8,
      poster: 'https://image.tmdb.org/t/p/w300/nested-poster.jpg',
      slug: 'nested-series-2026',
      link: {
        endpoint: 'series/nested-series-2026'
      }
    });
  });

  it('falls back to contentType tv_series as a series', () => {
    const raw = {
      title: 'TV Series',
      slug: 'tv-series-slug',
      contentType: 'tv_series'
    };
    const result = mapApiItem(raw);
    expect(result.type).toBe('series');
    expect(result.link.endpoint).toBe('series/tv-series-slug');
  });

  it('handles missing year, rating, quality, and images gracefully', () => {
    const raw = {
      title: 'Minimal Movie',
      slug: 'minimal-movie'
    };
    const result = mapApiItem(raw);
    expect(result).toEqual({
      title: 'Minimal Movie',
      originalTitle: 'Minimal Movie',
      year: null,
      type: 'movie',
      quality: null,
      rating: null,
      season: null,
      poster: null,
      backdrop: null,
      slug: 'minimal-movie',
      link: {
        endpoint: 'movie/minimal-movie',
        url: `${BASE_URL}/movie/minimal-movie`,
        thumbnail: null
      }
    });
  });
});

describe('scraper.js - mapApiDetail', () => {
  it('returns empty object if item is falsy', () => {
    expect(mapApiDetail(null)).toEqual({});
    expect(mapApiDetail(undefined)).toEqual({});
  });

  it('correctly maps a movie detail', () => {
    const raw = {
      title: 'Movie Detail Title',
      slug: 'movie-detail-2026',
      releaseDate: '2026-01-01',
      runtime: '120',
      overview: 'Movie overview description.',
      posterPath: '/poster.jpg',
      backdropPath: '/backdrop.jpg',
      genres: [{ name: 'Action' }, { name: 'Drama' }],
      country: 'United States',
      originalLanguage: 'en',
      director: 'Director Name',
      cast: [
        { name: 'Actor 1', character: 'Character 1', profilePath: '/actor1.jpg' },
        { name: 'Actor 2', character: 'Character 2', profilePath: null }
      ],
      trailerUrl: 'https://youtube.com/watch?v=123',
      keywords: [{ name: 'superhero' }, { name: 'sequel' }]
    };

    const result = mapApiDetail(raw);
    expect(result).toEqual({
      title: 'Movie Detail Title',
      year: 2026,
      type: 'movie',
      runtime: 'PT120M',
      runtimeMinutes: 120,
      overview: 'Movie overview description.',
      poster: 'https://image.tmdb.org/t/p/w300/poster.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
      genres: ['Action', 'Drama'],
      country: 'United States',
      countryCode: null,
      language: 'en',
      director: { name: 'Director Name', url: null },
      cast: [
        { name: 'Actor 1', character: 'Character 1', image: 'https://image.tmdb.org/t/p/w185/actor1.jpg' },
        { name: 'Actor 2', character: 'Character 2', image: null }
      ],
      trailer: 'https://youtube.com/watch?v=123',
      watchUrl: `${BASE_URL}/movie/movie-detail-2026?play=1`,
      streamUrl: null,
      keywords: ['superhero', 'sequel'],
      recommendations: [],
      seasons: null
    });
  });

  it('correctly maps a series detail with seasons and episodes', () => {
    const raw = {
      title: 'Series Detail Title',
      slug: 'series-detail-2026',
      firstAirDate: '2026-02-02',
      numberOfSeasons: 2,
      genres: [{ name: 'Sci-Fi' }],
      seasons: [
        {
          name: 'Season 1',
          seasonNumber: 1,
          episodeCount: 1,
          episodes: [
            {
              episodeNumber: 1,
              title: 'Episode 1 Title',
              overview: 'Episode 1 Overview'
            }
          ]
        }
      ]
    };

    const result = mapApiDetail(raw);
    expect(result).toMatchObject({
      title: 'Series Detail Title',
      year: 2026,
      type: 'series',
      genres: ['Sci-Fi'],
      watchUrl: `${BASE_URL}/series/series-detail-2026?play=1`,
      seasons: [
        {
          name: 'Season 1',
          seasonNumber: 1,
          episodeCount: 1,
          episodes: [
            {
              episodeNumber: 1,
              title: 'Episode 1 Title',
              overview: 'Episode 1 Overview'
            }
          ]
        }
      ]
    });
  });
});
