---
version: alpha
name: "Evidence Desk"
description: "A precise used-car review workstation that turns a large Marketplace snapshot into an explainable shortlist."
colors:
  navy: "#071D33"
  navy-raised: "#0D2947"
  primary: "#1557D5"
  cobalt-hover: "#1049B7"
  porcelain: "#F6F8FB"
  paper: "#FFFFFF"
  ink: "#172033"
  muted: "#657086"
  line: "#DCE2EA"
  selection: "#EEF4FF"
  success: "#167354"
  success-soft: "#EAF7F0"
  warning: "#D66A2E"
  warning-soft: "#FFF3E8"
  danger: "#B33F4A"
  focus: "#72A1FF"
typography:
  sans:
    fontFamily: "Instrument Sans Variable, Instrument Sans, system-ui, sans-serif"
    fontSize: "0.9375rem"
    lineHeight: "1.4"
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    lineHeight: "1.45"
rounded:
  DEFAULT: "0.4375rem"
  sm: "0.3125rem"
  md: "0.4375rem"
  lg: "0.625rem"
spacing:
  control-gap: "0.625rem"
  section-gap: "1.25rem"
  page-gutter: "1.125rem"
components:
  button: { }
  input: { }
  table: { }
  inspector: { }
---

# Evidence Desk Design System

## Overview

### Creative North Star

Evidence Desk should feel like a well-kept vehicle history binder beside a diagnostic terminal: every number is traceable, every warning is plain, and the user can move quickly without the interface feeling hurried.

### Product context and register

- **Audience and primary job:** A private used-car buyer and a trusted friend reviewing Marketplace captures to identify which cars deserve deeper inspection, with a clearly separated exploratory space for non-approved German brands.
- **Target market and evidence:** South Florida around Pembroke Pines; city-distance bands and buying rules come from the repository playbook.
- **Locales and language policy:** English (`en-US`) product UI. Listing text is displayed only as structured safe fields; source listing language does not affect scoring.
- **Usage scene:** Repeated desktop review of thousands of rows, with occasional phone checks. Dense comparison matters more than visual browsing.
- **Register:** Product tool.
- **Memorable signature:** The scored evidence rail: a true funnel from all listings to approved, evaluated, and strong matches, paired with an additive score ledger.
- **Restraint:** The table, filters, and evidence copy stay quiet, flat, and familiar.
- **Collection boundary:** The approved-brand evidence funnel remains canonical. German cars use a separate navigation group and rail, and every German inspector carries a plain exploratory warning so its scores cannot be mistaken for approval.
- **Anti-references:** No automotive dealership gloss, photo cards, map dashboards, glass surfaces, decorative gradients, or generic KPI tiles.
- **Token ownership/runtime mapping:** Runtime CSS variables in `src/styles.css` are canonical (Model B). This file mirrors their accepted values and rationale. Shared UI consumes semantic variables rather than raw colors.

## Colors

Midnight navy anchors navigation and communicates a private workbench. Cobalt is reserved for primary actions, focus support, and selected navigation. Porcelain and paper create a low-glare work surface. Pine success and signal orange communicate score confidence and caution with text labels, never color alone. All borders use `line`; keyboard focus uses a visible `focus` ring.

## Typography

Instrument Sans carries navigation, labels, and reading text with compact humanist proportions. IBM Plex Mono is restricted to prices, counts, ranks, dates, and score numbers. Headings use weight rather than a display font so the data remains the personality. Sentence case is the default.

## Layout

At wide desktop sizes, the interface uses a 14.5rem saved-view rail, a fluid table workspace, and a 22.5rem inspector. The decision rail is the first main-content element. The table scrolls horizontally at narrow widths rather than silently losing comparison columns. Below 74rem, the inspector becomes an app-owned overlay; below 48rem, saved views become a horizontal strip and the evidence workspace stays document-scrolling.

## Elevation & Depth

Hierarchy comes from tonal surfaces, dividers, sticky affordances, and selection tint. Static content has no drop shadow. Only transient overlays may use a restrained shadow against an inert backdrop.

## Shapes

Controls and containers use 5–10px radii, never pills except compact status badges. Dividers are one-pixel rules. Icons use rounded strokes with no decorative containers unless the container communicates state.

## Components

### Foundational visual states

Every interactive control defines default, hover, focus-visible, active, selected, and disabled states without changing geometry. Cobalt focus outlines remain visible against white and navy. Local filtering is synchronous, so no decorative skeleton is used; empty and no-results states preserve table geometry and offer a reset.

### Buttons and actions

Primary cobalt buttons are limited to `Search`, `Open on Marketplace`, and the active compare action. Neutral outline and ghost buttons handle filters, close, reset, and secondary actions. Labels use specific verbs. Icon-only controls have accessible names and at least a 36px target.

### Navigation and data display

Saved views and decision-rail stages use native buttons and maintain an explicit selected state. The data grid is a semantic table with button-based sortable headers, pagination, range/total copy, and stable row height. Vehicle names are buttons that select inspector content; the row itself is not a fake click target.

### Forms and overlays

Search uses an app-owned clear button, IME-safe submission, and URL-persisted committed state. Filters use native inputs, checkboxes, and native selects; accepting the platform-owned select popup is an explicit design decision. Dialogs use the native modal dialog element with app-owned content, Escape behavior, focus restoration, and visible close actions.

### Iconography

Phosphor Icons is the canonical family, using regular or bold rounded strokes at 16–22px. Text labels remain beside non-universal actions.

### Motion

Motion is limited to 140–200ms opacity/color/position feedback for panels and selections. Reduced-motion mode removes transforms and shortens fades. Routine sorting and filtering update immediately.

### Content and data visualization

Copy is direct and evidence-led: `Strong match`, `Needs evaluation`, `Price changed`, `Open on Marketplace`. Currency and counts use `en-US` formatting. The score ledger is additive text, not a chart, and every contribution names its source.

German copy uses `German exploratory sweep` and `not an approved-brand recommendation`. It never reuses `Strong match` as a recommendation label because reliability caps and the separate tracker make `Worth a look` the highest recorded exploratory tier in this snapshot. Outside-approved copy uses the same warning register: look-queue only, not a recommendation.

## Do's and Don'ts

- **Do:** Keep the buying funnel and score provenance visible.
- **Do:** Derive rule-sensitive labels from the playbook and structured tracker data.
- **Don't:** Imply live data, automatic seller contact, or verification the files do not contain.
- **Don't:** Replace the comparison table with photo cards or hide important columns without an explicit path to details.
