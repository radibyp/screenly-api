'use strict';

require('dotenv').config();
const request = require('supertest');
const createApp = require('../src/app');
const { invalidate } = require('../src/lib/cfBypass/cookieHarvester');

const app = createApp();

async function runAudit() {
  console.log('Starting End-to-End API Audit...');
  
  const results = [];
  let movieSlug = 'salmokji-whispering-water-2026';
  let seriesSlug = 'teach-you-a-lesson-2026';

  async function auditEndpoint(name, url, expectedStatus = 200) {
    console.log(`[Audit] Testing ${name} (${url})...`);
    const start = Date.now();
    try {
      const res = await request(app).get(url);
      const duration = Date.now() - start;
      
      const success = res.status === expectedStatus && res.body.success === true;
      const dataSize = res.body.data ? (Array.isArray(res.body.data) ? res.body.data.length : 'Object') : 0;
      
      let errorInfo = '';
      if (!success) {
        errorInfo = `Status: ${res.status} (expected ${expectedStatus}), Message: ${res.body.message || 'unknown'}`;
      }

      results.push({
        name,
        url,
        status: res.status,
        expectedStatus,
        duration,
        success,
        dataSize,
        body: res.body,
        error: errorInfo
      });

      console.log(`  -> Status: ${res.status}, Time: ${duration}ms, Items: ${dataSize}, Success: ${success}`);
      return res.body;
    } catch (err) {
      const duration = Date.now() - start;
      results.push({
        name,
        url,
        status: 500,
        expectedStatus,
        duration,
        success: false,
        dataSize: 0,
        error: err.message
      });
      console.error(`  -> Failed: ${err.message}`);
      return null;
    }
  }

  // 1. Basic status check
  await auditEndpoint('Health Check', '/api/');

  // 2. Featured
  const featuredData = await auditEndpoint('Featured Content', '/api/featured');
  if (featuredData && Array.isArray(featuredData.data)) {
    const movie = featuredData.data.find(item => item.type === 'movie');
    const series = featuredData.data.find(item => item.type === 'series');
    if (movie && movie.slug) movieSlug = movie.slug;
    if (series && series.slug) seriesSlug = series.slug;
  }

  // 3. Cinema XXI
  await auditEndpoint('Cinema XXI (Recent Movies)', '/api/cinemaxxi');

  // 4. Flat Homepage
  await auditEndpoint('Flat Homepage', '/api/home');

  // 5. Sections Homepage
  await auditEndpoint('Sections Homepage', '/api/home/sections');

  // 6. Movie Browse
  await auditEndpoint('Movie Browse', '/api/movie');

  // 7. Movie Trending
  await auditEndpoint('Movie Trending', '/api/movie/trending');

  // 8. Movie Trending Page 1
  await auditEndpoint('Movie Trending Page 1', '/api/movie/trending/1');

  // 9. Movie Trending Page 2
  await auditEndpoint('Movie Trending Page 2', '/api/movie/trending/2');

  // 10. Movie Detail (using discovered movieSlug)
  await auditEndpoint(`Movie Detail (${movieSlug})`, `/api/movie/${movieSlug}`);

  // 11. Movie Stream (using discovered movieSlug)
  await auditEndpoint(`Movie Stream (${movieSlug})`, `/api/movie/${movieSlug}/stream`);

  // 12. Series Browse
  await auditEndpoint('Series Browse', '/api/series');

  // 13. Series Trending
  await auditEndpoint('Series Trending', '/api/series/trending');

  // 14. Series Detail (using discovered seriesSlug)
  await auditEndpoint(`Series Detail (${seriesSlug})`, `/api/series/${seriesSlug}`);

  // 15. Series Stream (using discovered seriesSlug)
  await auditEndpoint(`Series Stream (${seriesSlug})`, `/api/series/${seriesSlug}/stream`);

  // 16. Series Episode Stream (using discovered seriesSlug)
  await auditEndpoint(`Series Episode Stream (${seriesSlug})`, `/api/series/${seriesSlug}/season/1/episode/1/stream`);

  // 17. Search Endpoint
  await auditEndpoint('Search', '/api/search?q=avatar');

  // 18. Leaderboard
  await auditEndpoint('Leaderboard', '/api/leaderboard');

  // 19. Categories Indexes
  await auditEndpoint('Genre Index', '/api/genre');
  await auditEndpoint('Country Index', '/api/country');
  await auditEndpoint('Year Index', '/api/year');
  await auditEndpoint('Network Index', '/api/network');

  // 20. Categories Browse
  await auditEndpoint('Genre Browse', '/api/genre/action');
  await auditEndpoint('Country Browse', '/api/country/US');
  await auditEndpoint('Year Browse', '/api/year/2024');
  await auditEndpoint('Network Browse', '/api/network/netflix');

  // Write final report
  console.log('\n=================== AUDIT RESULTS ===================');
  console.log('| Endpoint | Status | Time | Success | Data Count/Info | Error |');
  console.log('|---|---|---|---|---|---|');
  results.forEach(r => {
    console.log(`| ${r.name} (${r.url}) | ${r.status} | ${r.duration}ms | ${r.success ? '✅' : '❌'} | ${r.dataSize} | ${r.error || '-'} |`);
  });
  console.log('=====================================================');

  await invalidate();
  process.exit(0);
}

runAudit();
