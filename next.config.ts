import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  // Without this Turbopack walks up to the home directory looking for a lock
  // file and refuses to trace, because that would include everything there.
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
  reactStrictMode: true,
  poweredByHeader: false,
  // PGlite ships WebAssembly and must not be bundled; `pg` loads optional
  // native helpers the bundler should not try to follow either.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/**' }]
      : [],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self), payment=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
