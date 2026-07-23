import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/images/:path*',
        destination: 'http://images-server:80/images/:path*'
      },
      {
        source: '/audio/:path*',
        destination: 'http://images-server:80/audio/:path*'
      },
      {
        source: '/api/v1/:path*',
        destination: 'http://api-server:8000/api/v1/:path*'
      },
      {
        source: '/docs',
        destination: 'http://api-server:8000/docs'
      },
      {
        source: '/openapi.json',
        destination: 'http://api-server:8000/openapi.json'
      }
    ]
  }
};

export default nextConfig;
