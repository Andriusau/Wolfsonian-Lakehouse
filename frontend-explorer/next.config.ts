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
  },
  async headers() {
    return [
      {
        // Allow cross-origin requests for all API routes proxied through Next.js
        source: "/api/v1/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ]
      }
    ]
  }
};

export default nextConfig;
