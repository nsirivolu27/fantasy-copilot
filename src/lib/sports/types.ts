/** Everything sport-specific the app needs, behind one shape. */
export interface SportModule {
  id: string;
  label: string;
  /** Display order for positions in rosters and tables. */
  positionOrder: string[];
  /** Human label for a roster slot code, e.g. "DEF" -> "D/ST". */
  slotLabel(code: string): string;
  /** Human label for a scoring key, e.g. "rec" -> "Reception". */
  scoringLabel(key: string): string;
  /** Tailwind classes for a position badge. */
  positionColor(position?: string | null): string;
}
