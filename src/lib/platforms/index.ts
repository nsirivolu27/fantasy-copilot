import { SleeperAdapter } from "./sleeper/adapter";
import type { PlatformAdapter, PlatformId } from "./types";

/**
 * The only way application code gets an adapter. Nothing outside this folder
 * should import SleeperAdapter (or any other adapter) directly.
 */
export function getAdapter(platform: PlatformId): PlatformAdapter {
  switch (platform) {
    case "sleeper":
      return new SleeperAdapter();
    case "espn":
    case "manual":
      throw new Error(`The "${platform}" adapter arrives in Phase 7.`);
    default: {
      const never: never = platform;
      throw new Error(`Unknown platform: ${String(never)}`);
    }
  }
}

export const SUPPORTED_PLATFORMS: { id: PlatformId; label: string; available: boolean }[] = [
  { id: "sleeper", label: "Sleeper", available: true },
  { id: "espn", label: "ESPN", available: false },
  { id: "manual", label: "Manual / CSV", available: false },
];

export * from "./types";
