# syntax=docker/dockerfile:1

# IDLIX API — Node.js image
# The API process delegates browser-like rendering to an external request
# service; it does not run a browser itself, so the image stays small.

FROM node:20-bookworm-slim

# Production environment
ENV NODE_ENV=production \
    PORT=3000

# Install only production deps cleanly
WORKDIR /app

# Copy lockfile + manifest first for layer caching, then npm ci
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copy application source
COPY src ./src
COPY server.js ./

# Non-root user for runtime
USER node

EXPOSE 3000

CMD ["node", "server.js"]
