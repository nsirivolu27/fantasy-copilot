/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits a self-contained server bundle for the Docker image.
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};
export default nextConfig;
