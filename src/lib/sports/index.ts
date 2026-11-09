import { football } from "./football";
import type { SportModule } from "./types";

/**
 * Sport registry. The engine calls getSportModule(league.sport) and never
 * imports football directly, so adding basketball later is a sibling folder.
 */
const MODULES: Record<string, SportModule> = { football };

export function getSportModule(sport: string): SportModule {
  const mod = MODULES[sport];
  if (!mod) throw new Error(`No sport module registered for "${sport}".`);
  return mod;
}

export type { SportModule } from "./types";
