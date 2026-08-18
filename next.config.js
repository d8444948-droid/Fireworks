/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // MediaPipe's wasm assets are fetched from a CDN at runtime, so no special
  // webpack config is needed. If you later vendor the wasm files locally,
  // you may need to add headers for cross-origin isolation (COOP/COEP).
};

module.exports = nextConfig;
