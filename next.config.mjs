/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits a self-contained server bundle for the Docker image.
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  // This repository lives beside other Node projects in the workspace; keep
  // Next's output tracing scoped to Fantasy Copilot's own lockfile and files.
  outputFileTracingRoot: process.cwd(),
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};
export default nextConfig;
