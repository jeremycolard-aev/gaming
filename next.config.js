/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/gaming',
  assetPrefix: '/gaming/',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
}

module.exports = nextConfig
