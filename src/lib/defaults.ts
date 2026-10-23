/**
 * Editable placeholders shown ONLY before a real sync exists.
 * Anything rendered from these must be visibly labelled as a default, * synced data always wins. Nothing here is used in any calculation.
 */
export const PLACEHOLDER_LEAGUE = {
  name: "tech rejects",
  teamCount: 12,
  format: "PPR · 1QB",
  note: "Placeholder only, sync a league to replace this.",
} as const;
