# Equoria Roadmap — August 2026

First formal roadmap for the project. Built directly from two prior documents: `ux-comparison-2026-08.md` (front-end audit vs. 6 competitors) and `competitive-brief-2026-08.md` (feature/positioning audit). This is a Now/Next/Later view, not a dated Gantt chart — right now this is a solo-builder project, so precise dates would be false precision. Treat "Now" as what to build next, "Next" as scoped and queued, "Later" as directional bets.

## Status overview

Updated after a build pass: the landing page (headline, screenshot showcase, signature visual, positioning statement), the Time Capsule "then vs. now" pattern-detection tie-in, and both halves of wearable health sync (Apple Health, fully built earlier; Google Health API for Fitbit/Pixel Watch, built this pass) are done. Two items need action only you can take, not more code: building `ios-companion/` in Xcode, and setting up the Google Cloud project per `docs/google-health-setup.md` — both are one-time, non-code setup steps. The capsule-notification cron job remains unwired (Render dashboard access I don't have).

## Now — done, one item needs your action

| Item | Status |
|---|---|
| **Public landing page** (headline, screenshot showcase, signature visual, positioning statement) | Shipped |
| **Wire up capsule-ready email notifications** | Still not scheduled — needs a Render cron job (`npm run send-capsule-notifications`), same gap as noted below for Google Health sync. |

## Next (scoped, queued)

| Item | Why it matters | Source finding |
|---|---|---|
| **Empty-state polish pass** | Keepsakes and other "nothing here yet" cards are functional but plain relative to the field (Reflectly pairs empty states with illustration/warmer copy). Not yet started. | UX comparison, gap #6 |
| **Trust-signal substitute** | Shipped — the landing page's "What Equoria notices" section uses a concrete, real-shaped Retrospect-style finding instead of a vague claim. | UX comparison, gap #4 |
| **Decide on the AI-chat-companion lane** | Prior brainstorm concluded this is the most crowded, hardest-to-differentiate lane (every competitor has some version). Not urgent, but worth a deliberate "invest / hold / cut" call before more effort goes there by default. Still an open decision, not a build task. | Competitive brief, positioning analysis |

## Later (directional)

| Item | Status / why it's not urgent yet | Source finding |
|---|---|---|
| **Health-correlation depth** | Both halves built: Apple Health (native companion app, `ios-companion/`, needs you to build it in Xcode) and Google Health API (Fitbit/Pixel Watch, OAuth, needs a Google Cloud project — see `docs/google-health-setup.md`). Code is done on both; each needs one setup step only you can do. | Competitive brief, opportunities |
| **Monetization design** | No pricing/paywall UI exists yet. Worth watching FutureMe's post-acquisition backlash as a cautionary tale before designing this — get it right once rather than iterate publicly. | Competitive brief, threats |
| **Broader mobile-first pass** | Current responsive/mobile nav is reasonably solid (bottom tab bar already exists) but hasn't been audited against the same rigor as desktop. | Carried over judgment call, not a named gap in either audit |

## Risks and dependencies

The single biggest risk to this roadmap is scope creep on the landing page itself — it's tempting to keep adding to it (testimonials, animation, a full design system) before shipping a first version. Recommend shipping the plainest version that has a real headline, a real screenshot, and one CTA, then iterating.

The cron job item is the only one with an external dependency (Render dashboard access) that I can't complete myself — it needs to be done manually, ideally in the same sitting as reviewing this roadmap so it doesn't get lost.

## What this roadmap deliberately leaves out

Feature parity chasing (matching every competitor feature-for-feature) is explicitly not on this roadmap — the prior brainstorm and competitive brief concluded that's a trap, not a strategy. Nothing here is "build X because Competitor Y has X"; every item traces to a specific weakness observed on Equoria's own front end.
