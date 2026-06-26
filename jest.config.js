'use strict';

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    // External request-runtime adapters are integration-bound (they talk to a
    // browser/external rendering microservice over HTTP) and are exercised
    // manually via the audit script rather than unit tests. The request
    // service client itself is unit-tested via a fetch mock; we keep it
    // excluded from the gate because its real code path requires the live
    // external service. Exclude streamClient too (full streaming chain).
    '!src/lib/requestServiceClient.js',
    '!src/lib/streamClient.js',
    // Legacy files kept for reference only — they are no longer imported.
    '!src/controllers/tv_series.controller.js',
    '!src/routes/tv_series.routes.js',
  ],
  coverageThreshold: {
    global: {
      branches:   65,
      functions:  80,
      lines:      80,
      statements: 80,
    },
  },
  testTimeout: 10_000,
};
