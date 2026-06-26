# IDLIX API v3

[![License](https://img.shields.io/badge/license-MIT-green)](https://github.com/radityprtama/IDLIX-API/blob/main/LICENSE)

A REST API that scrapes `https://z2.idlixku.com/` and exposes its content data as a clean JSON API. Browser-like rendering is delegated to an **external request/rendering microservice**, so the API process itself runs no browser runtime.

## Features

- **External Rendering Delegation:** Browser-like rendering and fingerprinted requests are handled by a separate request service (`REQUEST_SERVICE_URL`). The API process stays lightweight and runs no browser internally.
- **Rich Stream Metadata:** Extracts internal JSON configurations, including stream URLs, multi-language subtitle tracks, duration, and video IDs.
- **Resilient JSON Scraping:** Maps IDLIX's native JSON APIs (`/api/movies`, `/api/series`, etc.) to objects rather than using brittle HTML parsing, resulting in **O(1) list mapping** and layout resilience.
- **Interactive API Documentation:** Powered by Scalar (OpenAPI 3.0.0), available at `/docs`.
- **Complete Feature Set:** Full detail pages, search endpoints, leaderboard, and all category filters (Movies, TV Series, Genres, Countries, Years, Networks).
- **Consistent Response Envelope:** Standardized `{ success, data, pagination, filters }` output format.
- **In-memory TTL Cache:** Configurable caching for fast responses.

## Installation

### Requirements

- **Node.js 20+** for manual installation
- **Docker + Docker Compose** for the container setup

### Option A — Docker Compose (recommended)

The repository includes a `docker-compose.yml` that runs the external request service and the API together. Because the API image is not yet published to a container registry, clone the repo and build locally:

```bash
git clone https://github.com/radityprtama/IDLIX-API.git
cd IDLIX-API
docker compose up -d --build
```

The API will be available at **http://localhost:3000**.

> **TODO (registry image):** a prebuilt API image is not published yet. Once a `ghcr.io/radityprtama/idlix-api:v3.0.0` image is available, the `api` service in `docker-compose.yml` can switch from `build: .` to `image:` and the clone step can be replaced with downloading `docker-compose.yml` directly:
> ```bash
> curl -O https://raw.githubusercontent.com/radityprtama/IDLIX-API/main/docker-compose.yml
> docker compose up -d
> ```

### Option B — Manual installation

```bash
git clone https://github.com/radityprtama/IDLIX-API.git
cd IDLIX-API
npm install
cp .env.example .env   # then edit .env and set REQUEST_SERVICE_URL
npm start
```

The API listens on `http://localhost:3000` (or the `PORT` in your `.env`).

> The external request service must be running and reachable at `REQUEST_SERVICE_URL` for catalog and stream endpoints to return data.

---

## API Reference

**Base URL:** `http://localhost:3000/api`

All responses follow the envelope:
```json
{
  "success": true,
  "data": [...],
  "pagination": { "currentPage": 1, "totalPages": 5, "hasNext": true },
  "filters": { "type": "movie", "genre": "action" }
}
```

---

### General

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API status |
| GET | `/home` | All homepage content (flat array) |
| GET | `/home/sections` | Homepage content grouped by section |
| GET | `/featured` | Trending Now content |
| GET | `/cinemaxxi` | Recently Added Movies |

---

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/search?q=batman` | Search movies & series |

---

### Leaderboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/leaderboard` | Top ranked content |

---

### Movies

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/movie` | Browse all movies |
| GET | `/movie/trending` | Trending movies |
| GET | `/movie/trending/:page` | Trending movies (page N) |
| GET | `/movie/:slug` | Movie detail — full metadata |
| GET | `/movie/:slug/stream` | Extract stream URL |

**Example detail response:**
```json
{
  "success": true,
  "data": {
    "title": "Per Aspera Ad Astra",
    "year": 2026,
    "type": "movie",
    "runtime": "PT111M",
    "runtimeMinutes": 111,
    "overview": "...",
    "poster": "https://image.tmdb.org/...",
    "backdrop": "https://image.tmdb.org/...",
    "genres": ["Drama", "Adventure", "Science Fiction"],
    "country": "China",
    "countryCode": "CN",
    "language": "Chinese",
    "director": { "name": "Han Yan", "url": "..." },
    "cast": [{ "name": "Dylan Wang", "character": "Xu Tianbiao", "image": "..." }],
    "trailer": "https://www.youtube.com/watch?v=...",
    "watchUrl": "https://z2.idlixku.com/movie/per-aspera-ad-astra-2026?play=1",
    "streamUrl": null,
    "keywords": ["virtual reality", "dream realm"],
    "recommendations": [...]
  }
}
```

---

### TV Series

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/series` | Browse all series |
| GET | `/series/trending` | Trending series |
| GET | `/series/:slug` | Series detail — full metadata |
| GET | `/series/:slug/stream` | Extract first episode stream URL (backward-compat) |
| GET | `/series/:slug/season/:season/episode/:episode/stream` | Extract episode stream URL & subtitles |

---

### Genres

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/genre` | List all genres |
| GET | `/genre/:genre` | Browse by genre (all types) |
| GET | `/genre/:genre?type=movie` | Browse genre — movies only |
| GET | `/genre/:genre?type=series` | Browse genre — series only |
| GET | `/genre/movie/:genre` | Movies in genre |
| GET | `/genre/series/:genre` | Series in genre |

**Available genres:** `action`, `adventure`, `animation`, `anime`, `comedy`, `crime`, `drama`, `drama-korea`, `family`, `fantasy`, `history`, `horror`, `kids`, `mystery`, `science-fiction`, `thriller`, `war`

---

### Countries

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/country` | List all countries |
| GET | `/country/:country` | Browse by country |
| GET | `/country/:country?type=movie` | Filter movies only |
| GET | `/country/:country?type=series` | Filter series only |
| GET | `/country/movie/:country` | Movies in country |
| GET | `/country/series/:country` | Series in country |

---

### Years

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/year` | List all years |
| GET | `/year/:year` | Browse by year (e.g. `/year/2024`) |
| GET | `/year/:year?type=movie` | Filter movies only |
| GET | `/year/:year?type=series` | Filter series only |
| GET | `/year/movie/:year` | Movies in year |
| GET | `/year/series/:year` | Series in year |

---

### Networks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/network` | List all networks |
| GET | `/network/:network` | Browse by network |
| GET | `/network/:network?type=movie` | Filter movies only |
| GET | `/network/:network?type=series` | Filter series only |
| GET | `/network/movie/:network` | Movies in network |
| GET | `/network/series/:network` | Series in network |

---

## Architecture

The API process **no longer runs a browser runtime internally**. All browser-like rendering and request work — rendered HTML, JSON fetched with a real browser fingerprint and session — is delegated to an **external request service** for authorized data sources. The API talks to that service over HTTP (`REQUEST_SERVICE_URL`), keeping the rendering concern isolated in one swappable client module (`src/lib/requestServiceClient.js`).

### Stream URL Extraction

The `/stream` endpoints replicate the internal multi-step IDLIX proxy chain. The extraction sequence:

1. **UUID Resolution:** Calls `/api/movies/{slug}` or `/api/series/{slug}/season/{season}` to retrieve internal Movie/Series/Episode UUIDs.
2. **Analytics Tracking:** Pings `/api/views/track`.
3. **Gate Token Generation:** Requests `/api/watch/play-info/` which returns a `gateToken` and an `unlockAt` timestamp.
4. **Mandatory Delay:** The API honors IDLIX's internal timer (`unlockAt - serverNow`).
5. **Session Claim:** Exchanges the unlocked `gateToken` for a JSON Web Token and a redemption URL.
6. **Final Resolution:** Fires a direct `fetch()` to `majorplay.net` to redeem the token and extract the final `.json` configuration containing `.m3u8` links and `.vtt` subtitles.

**Example movie stream request:**
```bash
curl http://localhost:3000/api/movie/per-aspera-ad-astra-2026/stream
```

**Example series stream request:**
```bash
curl http://localhost:3000/api/series/oasis-2026/season/1/episode/1/stream
```

> **Note:** The very first request after a service restart may take several seconds while the external request service warms up, plus the mandatory API gate delay. Subsequent streams only suffer the mandatory gate delay. Stream configurations are cached in-memory.

---

## Environment Variables

See [`.env.example`](.env.example) for all available configuration options.

| Variable | Default | Description |
|----------|---------|-------------|
| `IDLIX_BASE_URL` | `https://z2.idlixku.com` | Upstream site URL |
| `PORT` | `3000` | API server port |
| `REQUEST_SERVICE_URL` | `http://localhost:8191` | Base URL of the external request/rendering service |
| `REQUEST_SERVICE_TIMEOUT_MS` | `60000` | Per-request timeout (ms) for the external request service |
| `CACHE_TTL_DETAIL` | `2` | Detail page cache (hours) |
| `CACHE_TTL_STREAM` | `0.25` | Stream URL cache (hours = 15min) |
| `CACHE_TTL_SEARCH` | `0.5` | Search cache (hours = 30min) |

---

**Contributions are welcome**
