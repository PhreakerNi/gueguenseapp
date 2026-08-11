/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@gueguense/config",
    "@gueguense/domain",
    "@gueguense/types",
    "@gueguense/ui",
    "@gueguense/schemas",
  ],
};

module.exports = nextConfig;
