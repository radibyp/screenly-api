# API Endpoint Audit, Test & Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit, test, and fix all API endpoints of the IDLIX Express Scraper API to resolve the "Untitled Content" / "No Image Available" issues, identify any broken or suboptimal endpoints, fix the Cloudflare check false-positive, align tests with the `getJson` client implementation, and verify everything end-to-end.

**Architecture:** 
1. Fix the false positive `cf-` validation logic in `httpClient.js` and `cookieHarvester.js` which blocks any JSON containing UUIDs matching the hex regex pattern containing `cf-`.
2. Generate mock/fixture HTML files (such as `site/movie_detail.html`) so that unit tests (`scraper.test.js` and others) can pass without relying on live site scraping.
3. Update integration test files (`movie.test.js`, `series.test.js`, `catalog.test.js`, `genre.test.js`) to properly mock `httpClient.getJson` instead of `httpClient.get`, aligning the tests with the actual code behavior.
4. Individually test each endpoint using a verification script against the running server.

**Tech Stack:** Express, Puppeteer Extra, Jest, Supertest, JavaScript

---

### Task 1: Fix false-positive Cloudflare check in httpClient and cookieHarvester

**Files:**
- Modify: `src/lib/httpClient.js:43-68`
- Modify: `src/lib/cfBypass/cookieHarvester.js:190-205`

- [ ] **Step 1: Inspect httpClient.js and identify the check**
  Review the `includes('cf-')` check on line 55 of `src/lib/httpClient.js` and line 191 of `src/lib/cfBypass/cookieHarvester.js`.

- [ ] **Step 2: Replace the check with a more specific check**
  Change `text.includes('cf-')` to check for `cf-challenge` or `__cf_chl_opt` instead, preventing UUIDs containing `cf-` from triggering validation errors.
  
  In `src/lib/httpClient.js`:
  ```javascript
  if (res.status === 403 || res.text.includes('<title>Just a moment...</title>') || res.text.includes('cf-challenge-stage') || res.text.includes('__cf_chl_opt')) {
    console.error(`[httpClient:getJson] Validation Error: Detected Cloudflare or anti-bot protection page.`);
    return null;
  }
  ```

  In `src/lib/cfBypass/cookieHarvester.js`:
  ```javascript
  if (result.status === 403 || (result.ok === false && (result.text.includes('cf-challenge-stage') || result.text.includes('__cf_chl_opt')))) {
  ```

- [ ] **Step 3: Run the scratch script `tests/scratch_query_live.js` to verify it passes**
  Run: `node tests/scratch_query_live.js`
  Expected: Successful fetching and parsing of `/api/homepage` from the live site.

- [ ] **Step 4: Commit changes**
  ```bash
  git add src/lib/httpClient.js src/lib/cfBypass/cookieHarvester.js
  git commit -m "fix: resolve false-positive Cloudflare detection on UUIDs with cf-"
  ```

---

### Task 2: Create missing `site/movie_detail.html` test fixture

**Files:**
- Create: `site/movie_detail.html`

- [ ] **Step 1: Fetch details from a live movie**
  Create a temporary script or run a curl/puppeteer capture to fetch the HTML content of a movie detail page from the upstream IDLIX site (e.g. `https://z2.idlixku.com/movie/per-aspera-ad-astra-2026`) and save it to `site/movie_detail.html`.
  Or, construct a minimal mock file containing the elements expected by `scraper.test.js`.
  Wait, let's fetch a real detail page HTML or generate it to ensure absolute correctness. We can use a quick Puppeteer script to scrape the HTML page and save it.

- [ ] **Step 2: Save to `site/movie_detail.html`**
  Write the content to `/home/pratama/projects/screnly/IDLIX-API/site/movie_detail.html`.

- [ ] **Step 3: Run unit tests to verify `tests/unit/scraper.test.js` passes**
  Run: `npx jest tests/unit/scraper.test.js`
  Expected: PASS

- [ ] **Step 4: Commit**
  ```bash
  git add site/movie_detail.html
  git commit -m "test: add movie detail HTML fixture"
  ```

---

### Task 3: Align Integration Tests with `getJson` implementation

**Files:**
- Modify: `tests/integration/movie.test.js`
- Modify: `tests/integration/series.test.js`
- Modify: `tests/integration/catalog.test.js`
- Modify: `tests/integration/genre.test.js`

- [ ] **Step 1: Mock `getJson` in all integration test files**
  Update the mock of `httpClient` in each of these test files to include `getJson: jest.fn()`.
  
  Example:
  ```javascript
  jest.mock('../../src/lib/httpClient', () => ({
    get:           jest.fn(),
    getJson:       jest.fn(),
    getStreamData: jest.fn(),
    getEpisodeStreamData: jest.fn(),
  }));
  ```

- [ ] **Step 2: Adapt test expectations to call `getJson` instead of `get`**
  For tests verifying movies/series endpoints, mock `httpClient.getJson` instead of `httpClient.get`.
  Because the real controller/service calls `getJson` and expects JSON responses (not raw HTML like the old scraping implementation), we must supply mocked JSON envelopes matching the real API shape!
  Let's extract the expected structure from the service mappings.
  For example, `getBrowse` in `series.service.js` expects:
  ```json
  {
    "data": [
      {
        "contentType": "tv_series",
        "slug": "house-of-the-dragon-2022",
        "title": "House of the Dragon"
      }
    ]
  }
  ```
  We will adjust the mocks in the integration tests to resolve to these mock JSON structures, ensuring all routes are properly unit/integration tested.

- [ ] **Step 3: Run all Jest tests**
  Run: `npm test`
  Expected: All tests pass.

- [ ] **Step 4: Commit**
  ```bash
  git add tests/integration/
  git commit -m "test: align integration tests with getJson API Refactor"
  ```

---

### Task 4: Systematically Test Every Route End-to-End and Verify

- [ ] **Step 1: Start the API server**
  Run: `PORT=3001 npm start`
  Expected: Server starts on port 3001.

- [ ] **Step 2: Create a verification script to query all endpoints**
  Create a test script `tests/verify_endpoints.js` that triggers each endpoint on localhost:3001 using `fetch`, verifies the response status code, timing, and parses the response envelope.

- [ ] **Step 3: Audit all endpoints, record metrics, and confirm fixes**
  Run the verification script and log the results into the audit tables.
