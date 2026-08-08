# DESIGN_SYSTEM.md

## Purpose

The visual and interaction standard for Salikha Studio OS: tokens, components, states, mobile behavior, and accessibility. The application is a work tool: clean, modern, minimal, professional. Eye candy is reserved for data that matters.

## Scope

- CSS custom properties and usage rules.
- Components: buttons, inputs, dropdowns, forms, tables, cards, badges, alerts, modals, tabs, charts, states.
- Sidebar, header, breadcrumbs, navigation.
- Mobile, accessibility, keyboard behavior, responsive breakpoints.

## Overview

The interface follows the approved direction: white and light-gray surfaces, crimson as the primary accent, status colors with meaning. No excessive gradients, glassmorphism, neon, heavy animation, or clutter. All tokens are defined once as CSS custom properties and referenced by name.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Color Tokens](#2-color-tokens)
3. [Typography](#3-typography)
4. [Spacing System](#4-spacing-system)
5. [Layout and Widths](#5-layout-and-widths)
6. [Sidebar](#6-sidebar)
7. [Top Header](#7-top-header)
8. [Breadcrumbs](#8-breadcrumbs)
9. [Buttons](#9-buttons)
10. [Inputs and Dropdowns](#10-inputs-and-dropdowns)
11. [Forms](#11-forms)
12. [Tables](#12-tables)
13. [Cards](#13-cards)
14. [Status Badges](#14-status-badges)
15. [Alerts](#15-alerts)
16. [Modals and Confirmation Dialogs](#16-modals-and-confirmation-dialogs)
17. [Tabs](#17-tabs)
18. [Charts](#18-charts)
19. [Empty States](#19-empty-states)
20. [Loading States and Skeleton Loaders](#20-loading-states-and-skeleton-loaders)
21. [Error States](#21-error-states)
22. [Interaction Rules](#22-interaction-rules)
23. [Mobile Behavior](#23-mobile-behavior)
24. [Responsive Breakpoints](#24-responsive-breakpoints)
25. [Keyboard Navigation](#25-keyboard-navigation)
26. [Accessibility](#26-accessibility)
27. [Cross-References](#27-cross-references)

---

## 1. Design Principles

1. **Information over decoration.** No decorative gradients, glass, or bounce.
2. **Hierarchy via space and weight**, not borders and color noise.
3. **Money is sacred.** Currency figures use tabular numerals and are the emphasized element on financial screens.
4. **Statuses speak with words.** Badge + label + color; never color alone.
5. **Every data screen has loading, empty, and error states.**
6. **Keyboard and touch first** for power workflows (deployment, payment entry).
7. **One accent per region.** Crimson marks the primary action and key figures.

## 2. Color Tokens

Approved base palette:

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#B4232C` | Primary buttons, active nav, key figures |
| `--color-primary-hover` | `#9B1C24` | Primary hover |
| `--color-primary-soft` | `#FBEAEB` | Selected rows, icon tint backgrounds |
| `--color-page-bg` | `#F7F8FA` | Page background |
| `--color-surface` | `#FFFFFF` | Cards, sidebar, header |
| `--color-border` | `#E5E7EB` | Borders, dividers |
| `--color-text` | `#1F2937` | Primary text |
| `--color-text-secondary` | `#6B7280` | Labels, secondary text |
| `--color-text-muted` | `#9CA3AF` | Hints, placeholders |
| `--color-success` | `#15803D` | Paid, reconciled, in stock |
| `--color-warning` | `#D97706` | Due, low stock, pending |
| `--color-info` | `#2563EB` | Informational, in progress |
| `--color-danger` | `#DC2626` | Errors, cancelled, destructive |

Soft tints for badges/alerts: `--color-success-soft`, `--color-warning-soft`, `--color-info-soft`, `--color-danger-soft`.

Usage rules:
- Status colors on badges, dots, alerts, and small accents only — never large surfaces.
- Danger only for destructive actions and actual errors.
- Muted text is never used for actionable content.

## 3. Typography

- Font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. No external font downloads (performance).
- Scale:
  | Token | Size | Weight | Use |
  |---|---|---|---|
  | `--text-display` | 22px | 600 | Page titles |
  | `--text-heading` | 18px | 600 | Section and card titles |
  | `--text-body` | 14px | 400 | Body, table cells |
  | `--text-small` | 13px | 400 | Meta, hints |
  | `--text-caption` | 12px | 400 | Badges, timestamps, group labels |
- Line height 1.5; group labels uppercase with `0.05em` letter spacing.
- **Money**: `font-variant-numeric: tabular-nums`, weight 600-700 in figures.

## 4. Spacing System

4px base: `--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-5: 24px`, `--space-6: 32px`, `--space-8: 48px`.

- App padding: 24px desktop, 16px mobile.
- Card padding: 24px. Table row padding: 12px vertical.
- Consistent 16px gutters within grids.

## 5. Layout and Widths

- Sidebar: 240px fixed desktop.
- Content: max-width 1280px, centered.
- Header: 60px sticky.
- Grids: `repeat(auto-fit, minmax(200px, 1fr))` for KPIs; `minmax(300px, 1fr)` for dashboard panels.

## 6. Sidebar

- White surface, right border, sticky full height.
- Brand block: crimson square mark with "SS", app name.
- Navigation groups (uppercase captions):
  - **Overview**: Dashboard, Calendar
  - **Business**: Leads, Clients, Bookings
  - **Operations**: Production, Deployments, Inventory, Equipment
  - **Finance**: Cashflow, Payments, Expenses, Reports
  - **Management**: Packages, Purchasing, Partners, Crew, Files
  - **System**: Settings
- Item: line icon + label, 8-12px padding, `--radius-sm`.
- Active: white pill, crimson text, 3px crimson left bar, weight 600.
- Hover: light-gray background, text darkens.
- Footer: connection status dot + label, app version.
- Mobile: off-canvas drawer (see Mobile Behavior).

## 7. Top Header

- White, bottom border, 60px.
- Left: hamburger (mobile only), page title, one-line description.
- Right: search box (placeholder in Sprint 0), notification icon, profile button with initials.
- Sticky with z-index below modals.

## 8. Breadcrumbs

- Pattern: `Section › Page` under the title (Sprint 0 shows only title + description; breadcrumbs arrive with nested pages).
- Muted gray text, active page in primary text.

## 9. Buttons

| Variant | Style | Use |
|---|---|---|
| Primary | Crimson bg, white text | One main action per view |
| Secondary | White bg, border | Supporting actions |
| Ghost | Transparent, secondary text | Row actions, toolbar |
| Danger | Red bg, white text | Destructive (with confirm) |
| Icon | 36x36, ghost | Icon-only actions |

- Height 36px desktop, 44px touch targets on mobile.
- Radius `--radius-sm` (6px).
- States: hover (darker), active (darker still), disabled (45% opacity, not-allowed), focus-visible ring.
- Labels are verb + object ("Confirm booking"); icon-only requires `aria-label`.

## 10. Inputs and Dropdowns

- Inputs: 36px height, 1px border, `--radius-sm`, focus ring 2px primary + soft shadow.
- Search input: icon inside, left padding 34px.
- Selects use the native control with the same token styling.
- Disabled: light-gray background, muted text.
- Money inputs: right-aligned, tabular numerals, no symbol inside.

## 11. Forms

- Label above field (`--text-small`, weight 600), required marked `*`.
- One field per row by default; two columns on wide screens for related fields.
- Inline error text below field in danger.
- Grouped in a card with Save/Cancel footer; Save is primary.
- Read-only views never use input controls.

## 12. Tables

- Header row: light-gray background, uppercase caption text, secondary color.
- Rows: min 44px, hover light-gray.
- Alignment: text left, money right (tabular), actions right.
- Zebra optional; sticky first column optional.
- Pagination 25/50/100 for predictability.
- Row action menu via ghost icon button.

## 13. Cards

- White, 1px border, `--radius-md` (8px), shadow `--shadow-sm`.
- Header row: title + right-aligned actions.
- KPI cards: label (small, secondary), value (26px, 700, tabular), meta line with sample badge in Sprint 0.

## 14. Status Badges

- Pill, `--radius-full`, 2px 8px padding, uppercase caption.
- Tones: success/warning/info/danger/neutral/sample.
- Always text; optional dot.
- Semantic mapping guide: paid/verified/reconciled/in-stock = success; due/pending/low-stock = warning; in-progress/info = info; cancelled/error/void = danger; draft/archived = neutral.

## 15. Alerts

- Four tones matching status colors; soft background, 1px border, icon + text.
- `role="alert"` for errors, `role="status"` otherwise.
- Appear at top of content (banner) or as toasts.

## 16. Modals and Confirmation Dialogs

- Overlay rgba(31,41,55,0.45); modal white, `--radius-lg` (12px), shadow `--shadow-lg`, max-width 560px, max-height 85vh.
- Header: title + close icon. Footer: Cancel (ghost) + primary (or danger) confirm.
- Focus trapped inside; Escape closes; click outside closes non-critical modals.
- **Blocking confirmations** for irreversible flows (verify payment, reconcile deployment): no close until explicit choice.
- Mobile: near full-screen sheet.

## 17. Tabs

- Underline style: text label, 2px bottom border in primary for active tab.
- Used for detail views (booking: Overview / Services / Payments / Profit).
- Keyboard: arrow keys move between tabs (tablist pattern).

## 18. Charts

- Backend-computed data only (see `docs/REPORT_DEFINITIONS.md`); client renders from numbers.
- Line and bar only in v1.0; max 5 series; primary + status palette + grayscale.
- Money axes in compact notation; tooltips show full values.
- Empty data shows the empty state, never a blank chart.
- Sprint 0: placeholder panels labeled "Sample - no data".

## 19. Empty States

- Icon (muted), title, one-line hint, optional CTA.
- Example: "No bookings yet - Booking management arrives in Sprint 3."
- Filter empties offer "Clear filters".

## 20. Loading States and Skeleton Loaders

- First load: skeleton shimmer blocks matching the layout.
- Actions: button spinner + disabled; toasts on completion.
- Never block the whole screen for one field save.
- `prefers-reduced-motion` disables all animation.

## 21. Error States

- Inline: danger text under field, danger border.
- Page/action: toast top-right + optional banner; retry available.
- Backend structured errors render `message`; `error.code` in a details line.
- Connection failure: banner "Could not reach the server" + offline status chip.

## 22. Interaction Rules

- Hover states: background lighten/darken only, no transforms.
- Focus-visible rings on every interactive element.
- No bounce/elastic animations; transitions max 150-200ms.
- Click targets >= 36px desktop, >= 44px mobile.
- No emojis as interface icons; inline SVG line icons only.

## 23. Mobile Behavior

- Sidebar becomes a drawer: slides in over a scrim; Escape or scrim click closes.
- Tables become horizontally scrollable or stacked cards (stacked for deployment forms).
- Primary actions in sticky bottom bar for money flows.
- Search hidden on phones in Sprint 0.
- Deployment form is designed mobile-first (large checkboxes, sign-off areas).

## 24. Responsive Breakpoints

| Breakpoint | Behavior |
|---|---|
| >= 1024px | Fixed sidebar, full header |
| 640-1023px | Drawer sidebar, search hidden |
| < 640px | Single column, compact header, full-width modals |

## 25. Keyboard Navigation

- Tab order follows visual order; skip link to main content.
- Enter/Space activate buttons; arrow keys for tabs and menus.
- Escape closes drawer, modals, and popovers.
- Global search `/` (future), `Alt+1..9` top sections (future).

## 26. Accessibility

- Semantic landmarks: `header`, `nav`, `main`, `aside`.
- One `h1` per view; section headings progress logically.
- ARIA: `aria-expanded` on drawer button, `aria-modal` + labelled modals, `aria-live` on toasts and connection status.
- Contrast: body text >= 4.5:1; large text >= 3:1; badge tints pair with bold labels.
- Color is never the sole signal.
- Reduced motion respected globally.

## 27. Cross-References

- Module behavior: `docs/PRODUCT_REQUIREMENTS.md`
- Money display rules: `docs/FINANCIAL_RULES.md`
- Screen flows: `docs/BUSINESS_WORKFLOWS.md`
- Chart data contracts: `docs/REPORT_DEFINITIONS.md`
- Implementation of tokens: `src/styles.html`