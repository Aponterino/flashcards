# Responsive Strategy

This project uses a hybrid responsive approach:

- `@media` for app-level layout changes (global shell/navigation behavior).
- `@container` for component-level adaptation based on available space.

## Why this split

Viewport width alone was not enough because many components render inside variable-width parents (drawer state, stacked sections, cards inside cards). Container queries prevent overflow in those cases.

## App-level viewport rules

These stay in `app/globals.css` under `@media (max-width: 1080px)` and `@media (max-width: 720px)`:

- Mobile drawer/hamburger navigation shell
- Main page shell and content padding adjustments
- A few global typography/spacing tweaks for very small screens

## Container query map

All container rules are in `app/globals.css` and keyed by named containers.

- `deck-grid`
  - Deck card internal layout shifts when the grid itself is narrow.

- `study-analytics`
  - Progress card stacks to one column at tighter widths.
  - Insights section (goal + calendar) collapses to a single column.

- `study-dashboard`
  - Top "today" strip transitions from 3 -> 2 -> 1 columns by container width.

- `study-actions`
  - Study action cards switch from 2 columns to 1.

- `study-page`
  - Study mode flashcard area, controls, and button wrapping tighten in narrow containers.

- `study-calendar`
  - Calendar header controls stack and calendar cells compact as the calendar card narrows.

- `study-forecast`
  - Forecast grid transitions from 7 -> 4 -> 2 columns.

- `card-list`
  - Card rows switch to wrapped action rows and full-width controls.

- `deck-menu`
  - Deck settings button grids collapse to one column in narrow menu popovers.

- `version-item`
  - Version header/actions and version card rows stack in narrow version cards.

## Implementation notes

- Prefer adding `container-type: inline-size` to reusable wrappers over adding new viewport breakpoints.
- Keep component query rules close to existing container query section for discoverability.
- Avoid duplicating the same behavior in both `@media` and `@container` unless intentionally providing a fallback.
- Preserve existing accessibility behavior when changing navigation patterns (drawer close on route change, overlay, Escape key).

## Quick validation checklist

1. Check `Home`, `Decks`, `Deck Detail`, `Study Mode`, `Versions`, `Deleted Decks`, `Settings` at small and medium widths.
2. Verify no horizontal scroll on major pages.
3. Verify mobile nav drawer opens/closes, overlay click closes, and Escape closes.
4. Run:
   - `npm run lint`
   - `npm run build`
