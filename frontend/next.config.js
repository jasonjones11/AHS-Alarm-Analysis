/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['leaflet', 'react-leaflet'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      leaflet: 'leaflet/dist/leaflet.js',
    };
    return config;
  },
};

module.exports = nextConfig;