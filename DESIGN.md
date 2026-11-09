# Design

Light-first, with dark as a deliberate override rather than the default.

## Tokens, not colours

No component names a colour. Everything comes from tokens in `src/app/globals.css`, which are
redefined in three places: `:root` (light), `@media (prefers-color-scheme: dark)` guarded with
`:root:not([data-theme="light"])`, and `:root[data-theme="dark"]` so an explicit choice wins in
both directions.

That structure matters. The previous build was dark-only with ~100 hardcoded utilities, `bg-white/5`, `text-white`, `text-black`, `bg-emerald-500/15`, each of which silently breaks on
a light ground. Tokens make a theme flip a palette change instead of an archaeology project.

| Token | Role |
|---|---|
| `--bg` | Page ground |
| `--panel` / `--panel-2` | Card surface / recessed surface |
| `--hover` | Row and button hover |
| `--border` / `--border-soft` | Structural / internal dividers |
| `--text` / `--muted` / `--faint` | Primary / secondary / tertiary text |
| `--accent` / `--accent-weak` / `--on-accent` | Action colour, its tint, and text that sits on it |

Neutrals carry a slight green bias toward the accent, so they read as chosen rather than
inherited grey.

## Semantic tints

Status colour is a role, not a hue. Six tints, `good`, `warn`, `bad`, `info`, `neutral`,
`accent`, each define background, foreground and border together as `.tint-*` classes. Position
badges use the same mechanism (`.tint-qb` … `.tint-def`).

```tsx
<Badge tone="good">+4.2/wk</Badge>
<Banner tone="warn" title="No projections this week" />
```

A component that needs `text-emerald-300` is a component that will be wrong in one theme.

## Rules

- **Never write a raw colour utility.** No `bg-white/5`, no `text-black`, no
  `bg-emerald-500/15`. Use a token, a `tone`, or a `.tint-*` class.
- **No opacity modifiers on CSS variables.** `border-[var(--accent)]/50` doesn't reliably apply
  in Tailwind. Use a dedicated token instead, that's what `--border-soft` and `--accent-weak`
  are for.
- **`--on-accent` only ever sits on `--accent`.** It's near-white in light mode and near-black in
  dark, so using it anywhere else inverts.
- **Give `body` an explicit background.** A transparent body borrows whatever ground the host
  paints.

## Typography and layout

System font stack, fast, familiar, and no network dependency for a self-hosted app. Numbers use
`tabular-nums` everywhere they line up in columns, which is most places here.

Cards are single-bordered with a small shadow; the accent is spent on primary actions and the
current nav item, not sprinkled. Wide content (tables, the streaming grid) scrolls inside its own
`overflow-x: auto` container so the page body never scrolls sideways.

## Theme toggle

`src/components/ThemeToggle.tsx` stores only an override in `localStorage`; a viewer who never
touches it follows their OS. A small inline script in the layout applies a stored choice before
first paint, so choosing dark doesn't produce a white flash on load. Storage access is wrapped in
try/catch, private windows throw.
