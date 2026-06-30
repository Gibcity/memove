---
version: alpha
name: memove
description: Polished travel-planning aesthetic — clean surfaces, precise motion, content-first.
colors:
  primary: "#111827"
  secondary: "#6b7280"
  tertiary: "#6366f1"
  neutral: "#f8fafc"
  surface: "#ffffff"
  surfaceDark: "#121215"
  accent: "#6366f1"
  success: "#10b981"
  warning: "#f59e0b"
  danger: "#ef4444"
  moodAmazing: "#E8654A"
  moodGood: "#EF9F27"
  moodNeutral: "#94928C"
  moodTired: "#6B9BD2"
  moodRough: "#9B8EC4"
typography:
  h1:
    fontFamily: Poppins
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  h2:
    fontFamily: Poppins
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.3
  h3:
    fontFamily: Poppins
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.4
  body-md:
    fontFamily: Poppins
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Poppins
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: Geist Sans
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  pill: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
elevation:
  card: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)
  elevated: 0 4px 16px rgba(0,0,0,0.1)
  sidebar: 0 4px 32px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)
motion:
  easeOutQuint: cubic-bezier(0.23, 1, 0.32, 1)
  easeInOutQuint: cubic-bezier(0.77, 0, 0.175, 1)
  easeDrawer: cubic-bezier(0.32, 0.72, 0, 1)
  fast: 150ms
  normal: 220ms
  slow: 320ms
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "#374151"
  button-primary-active:
    backgroundColor: "#1f2937"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "#111827"
    rounded: "10px"
    padding: "8px 14px"
---

## Overview

memove is a travel-planning platform with a polished, content-first design language.
The aesthetic blends Apple-grade precision (Poppins typography, exact motion curves)
with editorial warmth (mood-colored accents, generous whitespace). Every surface
feels calm and purposeful — the content is the interface, not chrome.

Dark mode is first-class. All theme colors resolve through CSS variables that
swap atomically, with a 320ms crossfade on theme switch.

## Colors

- **Primary (#111827):** Near-black ink for text and high-emphasis actions. Resolves to `--text-primary`.
- **Secondary (#6b7280):** Slate gray for secondary text. Resolves to `--text-muted`.
- **Tertiary (#6366f1):** Indigo — the sole chromatic accent for interactive elements (active states, selections, links).
- **Neutral (#f8fafc):** Background surfaces in light mode.
- **Surface Dark (#121215):** Primary background in dark mode — warm-tinted black, not neutral gray.

### Semantic tokens (CSS variables, light → dark)

| Token | Light | Dark |
|-------|-------|------|
| `--bg-primary` | #ffffff | #121215 |
| `--bg-secondary` | #f8fafc | #1a1a1e |
| `--bg-tertiary` | #f1f5f9 | #1c1c21 |
| `--bg-card` | #ffffff | #131316 |
| `--text-primary` | #111827 | #f4f4f5 |
| `--text-secondary` | #374151 | #d4d4d8 |
| `--text-muted` | #6b7280 | #a1a1aa |
| `--text-faint` | #9ca3af | #71717a |
| `--border-primary` | #e5e7eb | #27272a |
| `--accent` | #111827 | #e4e4e7 |

### Mood palette (Journey entries)

Five sentiment colors used in journey/journal entries: Amazing (#E8654A coral),
Good (#EF9F27 amber), Neutral (#94928C warm gray), Tired (#6B9BD2 blue),
Rough (#9B8EC4 lavender).

## Typography

- **Poppins** is the primary typeface — headings, body text, numbers, buttons.
  It carries the brand personality: geometric, friendly, precise.
- **Geist Sans** is the secondary typeface — captions, secondary metadata,
  subtext tiers. Creates a hierarchy: "Geist text · Poppins numbers."
- System fallback: `-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, system-ui`.
- Tabular figures globally on `time`, `.tabular-nums`, and number/date inputs.

## Layout & Spacing

8px base grid. Spacing tokens: `xs=4, sm=8, md=12, lg=16, xl=24`.

Radius scale: `sm=8px` (inputs, buttons), `md=12px` (cards), `lg=16px` (panels),
`xl=20px` (modals). Drawer modals on mobile have no bottom radius (docked feel).

## Elevation & Depth

- **Card:** Subtle — `0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)`.
  Cards float just barely above the surface.
- **Elevated:** `0 4px 16px rgba(0,0,0,0.1)` — for dropdowns, popovers.
- **Sidebar:** `0 4px 32px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)` — glassmorphic
  with backdrop blur (`backdrop-filter: blur(20px) saturate(180%)`).

Map tooltips and atlas overlays use backdrop-filtered glass: `rgba(10,10,20,0.6)`
with blur(20px) + saturate(180%) in dark mode, `rgba(255,255,255,0.75)` in light.

## Motion

All motion uses `ease-out-quint: cubic-bezier(0.23, 1, 0.32, 1)` — a strong deceleration
that feels responsive and physical. This replaces all Tailwind defaults.

- **Press feedback:** Buttons scale to `0.97` on `:active` (80ms). Cards with
  `[data-press]` scale to `0.985`. This tactile response is core to the feel.
- **Enter animations:** Popovers scale from `0.95` at 200ms. Modals from `0.97` at 220ms.
  On mobile, modals slide up as drawers (`translateY(100%)` → `0` at 320ms with `easeDrawer`).
- **Stagger:** List items fade-up with 40ms offset per child (`.trek-stagger > *`).
- **Theme crossfade:** 320ms transition on `background-color`, `color`, `border-color`
  during dark/light switch.
- **Reduced motion:** Honored — animations shorten to 120ms ease-out, skeleton shimmer
  stops, press-scale disabled.

## Components

### Button

High-emphasis buttons use primary background (#111827 light, #e4e4e7 dark) with
white text. Active state scales to 0.97. Focus-visible shows a 2px solid accent ring
with 3px offset.

### Card

White (light) / #131316 (dark) surface with 16px radius and card elevation shadow.
Padding is typically 16px. Cards are the primary content container.

### Input

`.form-input` class: 10px radius, 1px border (primary), 8×14px padding, 13px font size.
Border darkens to `--text-faint` on focus. Transitions border + shadow + background
over 150ms with ease-out-quint.

### Map Marker Cluster

Dark circular markers (#111827) with 2.5px white border and layered shadow.
Scale to 1.1 on hover with shadow expansion.

## Do's and Don'ts

### Do

- Use CSS variable tokens (`var(--text-primary)`, `bg-surface`, `text-content`)
  instead of hardcoded Tailwind color classes.
- Apply the `trek-page-enter` class to new pages for the subtle fade-up on mount.
- Use `trek-stagger` on lists for the cascading entrance.
- Add `[data-press]` to clickable cards/tiles for the gentle press scale.
- Use `ease-out-quint` for all transitions — it's the signature feel.

### Don't

- Don't use Tailwind's default `ease` or `ease-in-out` — they're weak. The CSS
  overrides them, but be explicit.
- Don't hardcode hex colors in components — use the semantic tokens.
- Don't add heavy entrance animations (>320ms) — memove's feel is quick and precise.
- Don't forget `prefers-reduced-motion` — every animation must degrade gracefully.
