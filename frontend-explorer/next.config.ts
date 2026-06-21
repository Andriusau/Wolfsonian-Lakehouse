import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/images/:path*',
        destination: 'http://images-server:80/:path*'
      }
    ]
  }
};

export default nextConfig;
