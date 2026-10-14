# UX Contract

## Product context

- **Audience:** A private used-car buyer and trusted teammates reviewing a Marketplace snapshot.
- **Primary jobs:** Narrow a large capture to a small, explainable shortlist; compare evidence without mistaking exploratory German cars for recommendations.
- **Target market:** South Florida around Pembroke Pines.
- **Active locale:** English (`en-US`).
- **Accessibility target:** WCAG 2.2 AA.

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Buying criteria, approved brands, score tiers | `../used_car_buying_playbook.md` | Buying playbook | 2026-08-22 |
| Snapshot data boundary, German sweep, safe browser fields | `AGENTS.md` | Product policy | 2026-08-22 |

## Visual contract

- **Project design context:** [`DESIGN.md`](./DESIGN.md)
- **Token ownership model:** Existing runtime CSS is canonical (Model B).
- **Runtime token source:** CSS custom properties in `src/styles.css`.
- **Mapping:** `DESIGN.md` mirrors accepted values; components consume semantic CSS variables and the shared button classes.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Table selection | `ListingsTable` + URL state in `App.jsx` | `src/lib/url-state.js` | one selected listing | browser interaction |
| Select/Listbox | Native `<select>` | `premium-ui.json` | native only | keyboard + browser popup |
| Scrollbar | Global `src/styles.css` | `DESIGN.md` | geometry exceptions only | rendered scroll regions |
| Dialog | `ModalDialog` | `src/components/ModalDialog.jsx` | scoring, compare, analysis guide | keyboard + focus restoration |
| Status feedback | App-level polite live region | `App.jsx` | neutral task feedback | browser interaction |

## Dataset navigation

- **Listing table:** Client-side page controls over the static snapshot; committed search, filters, sort, page, and page size persist in the URL.
- **Selection:** One listing is selected at a time. Filter or view changes select the first remaining listing and clamp the current page.
- **Initial analysis route:** The app opens directly to the listings. An on-demand sidebar guide explains approved brands and score tiers, then routes to `Strong matches` or `Approved brands`.
- **Empty and loading states:** Keep the table frame and show app-owned copy with a reset route when appropriate.

## Flow ledger

| Operation | Trigger | Success outcome | Feedback / focus | Source ref |
|---|---|---|---|---|
| Start analysis | “How to use this” | `Strong matches` or `Approved brands` view | Polite route announcement; dialog returns focus to trigger on close | `AGENTS.md` + buying playbook |
| View scoring rules | “Scoring details” in the analysis guide or “How scoring works” in the inspector | Full scoring dialog | The current guide closes before the scoring dialog opens; close returns focus to a stable app context | buying playbook |
| View listing evidence | Vehicle-name button | Inspector opens for selected listing | Inspector close returns to its local context | `src/components/ListingsTable.jsx` |
| Compare candidates | Inspector action | Up to three selections appear in compare tray | Polite selection announcement | `src/components/Inspector.jsx` |
| Search / filter / sort | Toolbar and filters | Same view; URL state updates | Results update synchronously | `src/lib/url-state.js` |
| Cancel / close dialog | Close button or Escape | Return to prior view | Focus restored to dialog trigger | `src/components/ModalDialog.jsx` |

## Navigation and responsive behavior

- **Document title:** The current search or German view updates the title; the default is `Evidence Desk · Used-car finder`.
- **Sidebar:** Persistent on desktop; at narrow widths it becomes a horizontally scrollable saved-view strip. The “How to use this” entry remains reachable. High risk, high reward holds Long shots, Worth asking, and Outside approved; the last of these is a look-queue, never a recommendation.
- **Table:** Horizontal scrolling preserves row comparison on narrow widths.
- **German sweep:** It is a distinct navigation group, labelled exploratory, and never presents a strong-match recommendation.

## Overlays and feedback

- **Dialog primitive:** Native `<dialog>` through `ModalDialog`; modal close supports Escape, explicit close, focus placement, and focus restoration.
- **Analysis guide:** The guide is informational, opens only on request, and can be closed without changing data or filters. It is always reopenable from the sidebar, and its score summary links to the canonical full scoring dialog.
- **Feedback:** A single polite live region announces local actions; the static snapshot never claims live updates or background synchronization.

## Async and resilience

- Snapshot loading uses cancellation guards so an unmounted view cannot receive a late result.
- There are no server mutations, background jobs, authentication flows, or offline write queues.
- Browser-local compare preferences are wrapped in `try`/`catch`; a storage failure leaves the current-tab experience usable.

## Verification

- **Required static commands:** `npm run build`, `npm run test:sites` (as listed in `premium-ui.json`).
- **Browser coverage:** Direct app opening with no dialog, guide routes, guide reopen/close with keyboard, narrow layout, existing listing selection and compare dialog.
- **Canonical sibling:** Existing scoring and compare dialogs establish the overlay, button, and focus behavior used by the analysis guide.
