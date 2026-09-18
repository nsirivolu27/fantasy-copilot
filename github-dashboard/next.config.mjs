import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export default {
  output: "export",
  basePath: "/fantasy-copilot",
  trailingSlash: true,
  outputFileTracingRoot: root,
  images: { unoptimized: true },
};
