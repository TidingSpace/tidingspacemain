/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');

const nextConfig = {
  images: {
    // Wildcard on supabase.co rather than hardcoding this specific
    // project's ref — works the same regardless of which Supabase project
    // this ends up pointing at, without needing to update this file if
    // that ever changes.
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co', pathname: '/storage/v1/object/public/**' }
    ]
  }
};

// org/project are real values from your Sentry project's settings — replace
// the placeholders below once you've created one. Source map upload also
// needs a SENTRY_AUTH_TOKEN env var (a separate token from the DSN, created
// under Settings > Auth Tokens in Sentry) to actually work; without it,
// builds still succeed, they just won't have readable stack traces in
// Sentry (minified code instead of your real source).
module.exports = withSentryConfig(nextConfig, {
  org: 'tiding-space-sr',
  project: 'javascript-nextjs',
  // Only print Sentry's own build logs in CI — keeps local dev builds
  // quiet rather than noisy with upload progress on every save.
  silent: !process.env.CI,
  // Doesn't fail the build if source map upload fails (e.g. no auth token
  // configured yet) — monitoring should never be able to block a deploy.
  errorHandler: (err, invokeErr) => { console.warn('[Sentry] source map upload skipped:', err.message); }
});
