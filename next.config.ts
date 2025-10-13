import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  sw: "sw.js",
  reloadOnOnline: true,
  cacheStartUrl: false, // start-url 캐싱 비활성화 (async 함수 문제 방지)
  dynamicStartUrl: false, // 동적 start-url 비활성화
  workboxOptions: {
    disableDevLogs: true,
    // 런타임 캐싱 플러그인을 수동으로 설정하여 async 함수 사용 방지
    runtimeCaching: [
      {
        // 루트 경로 캐싱 (start-url 대체)
        urlPattern: /^\/$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'start-url',
          expiration: {
            maxEntries: 1,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-webfonts',
          expiration: {
            maxEntries: 4,
            maxAgeSeconds: 365 * 24 * 60 * 60, // 365 days
          },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'google-fonts-stylesheets',
          expiration: {
            maxEntries: 4,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
        },
      },
      {
        urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-font-assets',
          expiration: {
            maxEntries: 4,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
        },
      },
      {
        urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-image-assets',
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
        },
      },
      {
        urlPattern: /\/_next\/static.+\.js$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'next-static-js-assets',
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: /\/_next\/image\?url=.+$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'next-image',
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: /\.(?:js)$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-js-assets',
          expiration: {
            maxEntries: 48,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: /\.(?:css|less)$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-style-assets',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: /\/_next\/data\/.+\/.+\.json$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'next-data',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: /\.(?:json|xml|csv)$/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'static-data-assets',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: ({ sameOrigin, url }) => {
          if (!sameOrigin) return false;
          const pathname = url.pathname;
          if (pathname.startsWith('/api/auth/callback')) return false;
          return pathname.startsWith('/api/');
        },
        handler: 'NetworkFirst',
        options: {
          cacheName: 'apis',
          networkTimeoutSeconds: 10,
          expiration: {
            maxEntries: 16,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: ({ request, url, sameOrigin }) => {
          if (request.headers.get('RSC') !== '1') return false;
          if (request.headers.get('Next-Router-Prefetch') !== '1') return false;
          if (!sameOrigin) return false;
          return !url.pathname.startsWith('/api/');
        },
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages-rsc-prefetch',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: ({ request, url, sameOrigin }) => {
          if (request.headers.get('RSC') !== '1') return false;
          if (!sameOrigin) return false;
          return !url.pathname.startsWith('/api/');
        },
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages-rsc',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: ({ url, sameOrigin }) => {
          if (!sameOrigin) return false;
          return !url.pathname.startsWith('/api/');
        },
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: ({ sameOrigin }) => !sameOrigin,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'cross-origin',
          networkTimeoutSeconds: 10,
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 60 * 60, // 1 hour
          },
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Local Supabase development
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '54321',
        pathname: '/storage/v1/object/public/**',
      },
      // Production Supabase (wildcard for all projects)
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // Specific production Supabase project
      {
        protocol: 'https',
        hostname: 'jcyzvrvyeapvcaycarnm.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },
  // Enable React strict mode for better development experience
  reactStrictMode: true,
};

export default withPWA(nextConfig);
