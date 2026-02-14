/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable standalone output for Docker
  output: 'standalone',
  // Proxy /api/* to backend. In Docker use API_BACKEND_URL=http://api:8000 so the frontend container can reach the API.
  async rewrites() {
    const backend =
      process.env.API_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backend.replace(/\/$/, '')}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

