import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || (
      process.env.NODE_ENV === 'production'
        ? 'https://codesync-server-ealz.onrender.com/api'
        : 'http://localhost:3001/api'
    ),
  },
};

export default nextConfig;
