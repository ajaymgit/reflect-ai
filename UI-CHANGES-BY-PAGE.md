# UI Changes By Page

Concrete, per-page checklist that breaks the phased plan (`UI-UX-REDESIGN-PLAN.md`) down into individual items. Pages already at the app's new visual bar (Dashboard, Write/History, Retrospect, Health) only get small consistency items; Chat, Settings, and Auth get the bulk of the work since they're the pages that fell behind.

## Chat (`ChatPage.jsx`)

- **Add**: entrance animation for the whole page (message thread + sidebar) on load, matching Dashboard/Retrospect's stagger pattern instead of the current hard cut.
- **Add**: a Keepsake toggle to the "Quick journal" sidebar composer, matching Write's — right now saving from Chat produces a plain entry with no way to flag it as a Keepsake.
- **Add**: autosave-to-draft for the quick-journal textarea (same `localStorage` pattern Write uses), so switching away mid-thought doesn't lose it.
- **Add**: the same live mood-suggestion chip Write has ("This reads as X — use it?") on the quick-journal composer.
- **Add**: a short "what this touched on" summary line shown after a few exchanges, built from the `focus`/`evidence` fields the API already returns per turn — currently that data only appears inside a collapsed "Why this response" details drawer.
- **Add**: a visible "New chat" / reset action — there's currently no way to clear the thread and start fresh without leaving the page.
- **Change**: collapse the four stacked control rows (chat mode, persona, memory toggle + response-style slider) into one compact row or a single popover, so a new message isn't preceded by that much chrome.
- **Change**: the emotional-timeline strip's empty state ("No entries yet.") to match the tone/styling of empty states elsewhere (Write's On This Day, Dashboard's Recent Entries).

## Settings (`SettingsPage.jsx`)

- **Add**: an icon to every section header (Appearance, Account, Reminders, Security, Integrations, Data) — currently only a plain kicker label.
- **Change**: single-column stacked sections into a two-column grid on desktop (e.g. Appearance + Account left, Security + Reminders + Data right), matching the card-grid pattern already used for Dashboard's Health/Retrospect preview row.
- **Change**: the Theme mode `<select>` and the two hue sliders into one visually unified "Appearance" card instead of two separate boxes that currently sit side by side but look unrelated.
- **Add**: a short live preview swatch (small card mockup) next to the hue sliders so the effect of dragging them is visible without leaving the page.
- **Change**: 2FA/Security section — currently the largest, busiest block on the page (setup, backup codes, disable, logout-everywhere all in one card); split "Two-factor authentication" and "Log out everywhere" into visually separate cards so the section doesn't read as one wall of text.

## Auth — Login / Register / Forgot / Reset Password

- **Add**: a first-run onboarding sequence (3–4 screens) shown once immediately after registration, demonstrating — not describing — mood-aware writing, Keepsakes, Time Capsules, and streaks/Retrospect before landing on Dashboard.
- **Add**: the same `living-bg` mood-wash background Dashboard/Journal use to the auth card layout, so the very first screen feels like the same product.
- **Add**: a subtle entrance animation on the auth card (currently a static hard-render).
- **Change**: the left-side marketing panel (currently one static paragraph) to briefly name the actual differentiated features (Keepsakes, Time Capsules) rather than generic copy ("a calm journaling workspace...").
- **Change**: Forgot/Reset Password pages — confirm they visually match Login's card treatment once Login is refreshed (not yet audited in detail; likely near-identical structure).

## Dashboard (`DashboardPage.jsx`)

- **Add**: a one-time celebratory toast/modal when `journalingStreak` crosses 7, 30, or 100 days, reusing the existing streak-glow CSS tiers.
- **Add**: a `prefers-reduced-motion` branch to the `containerVariants`/`itemVariants` framer-motion definitions (currently only the CSS-level animations check for this).
- **Add**: a first-time contextual tip the first time someone opens the Keepsakes globe, briefly explaining what it is (ties into the Phase 3 onboarding work, but can also stand alone as a tooltip for existing users).
- No structural changes needed otherwise — this page is at the target bar.

## Write / Journal History (`JournalPage.jsx`, tabs for Write + History)

- **Add**: a first-time dismissible tip near the Keepsake toggle and the Time Capsule clock icon the first time the composer is opened, explaining both in one line each — right now a new user has to guess what either control does.
- **Change**: once Chat's quick-journal sidebar is upgraded to share Keepsake/autosave/mood-suggestion (see Chat section above), extract the composer's shared bits into one component both pages import, so the two don't drift apart again later.
- No other structural changes needed — On This Day, Theme Cloud, Time Capsule, and the Write/History tab merge are all recent and current.

## Retrospect (`RetrospectPage.jsx`)

- **Add**: a `prefers-reduced-motion` branch wherever this page's animations are defined (heatmap reveal, card entrances).
- **Add**: a small "See your full year" teaser card linking to Year in Review, mirroring the reciprocal link Dashboard already has toward Retrospect — right now the connection only goes one direction (Year in Review links back to Retrospect; Retrospect doesn't link forward).
- No other structural changes needed.

## Health (`HealthPage.jsx`)

- **Add**: the same framer-motion entrance/stagger pattern Dashboard and Retrospect use — currently this page renders with a hard cut, the one visual inconsistency left among the four heavily-redesigned pages.
- **Add**: a `prefers-reduced-motion` branch once that motion is added.
- No other structural changes needed — the gauge, mood-overlay chart, gradient trend areas, and correlation scatter are all solid.

## Year in Review (`YearInReviewPage.jsx`)

- **Add**: a "Share" action that renders the summary as a downloadable image card (Spotify-Wrapped-style), since this page is explicitly designed as an occasional celebratory moment — currently there's no way to save or share it anywhere.
- **Add**: an entrance animation for the story cards (currently static), consistent with its "occasional, celebratory" framing.
- No other structural changes needed.

## Navigation — `AppShell.jsx` / `MorePage.jsx`

- **Add**: a small streak indicator (e.g. a flame icon or dot) on the Journal nav item when there's an active streak, so momentum is visible without opening Dashboard.
- No other structural changes needed — the grouped desktop sidebar and condensed mobile bar are both solid, and the Journal History merge earlier this session already simplified the Journal group down to one entry.

## Cross-cutting / design system

- **Add**: a shared `FirstTimeTip` component (small dismissible callout, persisted via `localStorage`) — reusable across Dashboard's Keepsakes globe, Write's Keepsake/Time Capsule controls, and the onboarding sequence, instead of building one-off tooltip logic per page.
- **Add**: a shared streak-milestone celebration component, triggered from Dashboard (and reusable if streak data ever surfaces elsewhere).
- **Add**: a contrast check pass on the mood-tinted `.glass`/`.ui-card` combinations, particularly `mood-sad`'s purple wash — spot-check actual contrast ratios against WCAG AA rather than eyeballing it.
- **Change**: audit every `motion.div`/`variants` usage app-wide for a `prefers-reduced-motion` branch, since only the plain-CSS animations (`page-transition`, `.skeleton`, streak glow) currently check for it.
