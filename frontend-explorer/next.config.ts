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
      }
    ]
  }
};

export default nextConfig;
