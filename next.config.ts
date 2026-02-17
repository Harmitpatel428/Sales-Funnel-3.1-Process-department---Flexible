import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Electron with embedded Node.js server
  // This bundles all dependencies into a standalone folder
  output: 'standalone',
  // Disable trailing slash - it causes 308 redirects on API POST requests
  // which breaks authentication and other API calls
  trailingSlash: false,

  // External packages that need native bindings (not bundled by webpack)
  serverExternalPackages: ['better-sqlite3', '@prisma/adapter-better-sqlite3'],

  // Performance optimizations
  experimental: {
    optimizePackageImports: ['framer-motion', 'lucide-react', 'recharts', 'dompurify', 'gsap'],
    webpackBuildWorker: true,
  },

  // Image optimization
  images: {
    unoptimized: true,
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60,
  },

  // Compression and optimization
  compress: true,
  poweredByHeader: false,

  // Bundle optimization
  webpack: (config, { isServer, dev }) => {
    if (!isServer) {
      // Optimize for production builds
      if (!dev) {
        config.optimization.splitChunks = {
          chunks: 'all',
          minSize: 20000,
          maxSize: 244000,
          cacheGroups: {
            // Separate framer-motion chunk
            framerMotion: {
              test: /[\\/]node_modules[\\/]framer-motion[\\/]/,
              name: 'framer-motion',
              chunks: 'all',
              priority: 26,
            },
            // Separate gsap chunk
            gsap: {
              test: /[\\/]node_modules[\\/]gsap[\\/]/,
              name: 'gsap',
              chunks: 'all',
              priority: 25,
            },
            // Keep React/Next.js together
            reactVendor: {
              test: /[\\/]node_modules[\\/](react|react-dom|next)[\\/]/,
              name: 'react-vendor',
              chunks: 'all',
              priority: 20,
            },
            // General vendor chunk for other libraries
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              priority: 10,
            },
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              enforce: true,
              priority: 5,
            },
          },
        };

        // Enable tree-shaking
        config.optimization.usedExports = true;
      }

      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },


};

export default process.env.ANALYZE === 'true'
  ? require('@next/bundle-analyzer').default({ enabled: true })(nextConfig)
  : nextConfig;
