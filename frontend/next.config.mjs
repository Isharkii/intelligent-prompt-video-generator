/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Prevent Next.js 14 from trying to bundle Node built-ins that
    // @anthropic-ai/sdk references. Route Handlers run in the Node.js runtime,
    // never in the browser, so externalising the SDK is safe.
    serverComponentsExternalPackages: ["@anthropic-ai/sdk"],
  },
};

export default nextConfig;
