---
name: AI Chat
description: A quiet neutral chat shell built so model-generated interactive cards carry all the visual weight.
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.145 0 0)"
  primary: "oklch(0.65 0.196 252)"
  primary-foreground: "oklch(0.145 0 0)"
  primary-text: "oklch(0.52 0.154 252)"
  secondary: "oklch(0.97 0 0)"
  secondary-foreground: "oklch(0.205 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.556 0 0)"
  accent: "oklch(0.97 0 0)"
  accent-foreground: "oklch(0.205 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  border: "oklch(0.922 0 0)"
  input: "oklch(0.8 0 0)"
  ring: "oklch(0.65 0.196 252)"
  sidebar: "oklch(0.985 0 0)"
  sidebar-border: "oklch(0.922 0 0)"
  chart-1: "oklch(0.646 0.222 41.116)"
  chart-2: "oklch(0.6 0.118 184.704)"
  chart-3: "oklch(0.398 0.07 227.392)"
  chart-4: "oklch(0.828 0.189 84.429)"
  chart-5: "oklch(0.769 0.188 70.08)"
typography:
  display:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: "2rem"
  title:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: "1.375"
  body:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
  mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    letterSpacing: "0.3em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  "2xl": "18px"
  "3xl": "22px"
  "4xl": "26px"
spacing:
  "1": "4px"
  "1.5": "6px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
components:
  button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline-hover:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.muted}"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "16px 0"
  chip-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "16px"
  badge-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.4xl}"
    padding: "2px 8px"
    height: "20px"
  message-bubble-user:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
---

# Design System: AI Chat

## Overview

**Creative North Star: "The Quiet Stage"**

The interface is unlit stagecraft. Every chrome decision — the zero-chroma neutrals, the
hairline rings, the 32px controls, the single accent used sparingly — exists to keep the eye
off the frame and on the one thing that just appeared under the light: a card the model
composed a moment ago. When a generated card fades and rises into the transcript, it should
be the only event on screen.

The consequence is an inversion of the usual chat aesthetic. The shell does not compete; it
does not brand itself in gradients or glass; it does not announce that an AI lives here. It
is a well-built, compact, unremarkable room, and the remarkable thing is what gets rendered
into it. Density is tight throughout — controls stand 32px tall, body copy sits at 14px, the
sidebar is a fixed 288px column — because a stage that wastes space steals attention from
the performance.

The voice is warm and approachable, but never playful. Warmth comes from plain-spoken copy,
generous breathing room around the content column, and motion that has a pulse — not from
oversized radii, mascots, bouncy easing, or emoji-led empty states. The corner-radius ceiling
(10px base, 26px only for pills) and `power2.out` easing are the limit of softness in this
system.

**Key Characteristics:**

- One chromatic accent — Signal Blue — on an otherwise neutral field
- Flat chrome, hairline rings; depth reserved as a signal for generated content
- Compact 32px control height with tactile feedback (3px focus ring, 1px active nudge)
- A single centered 768px column for reading and input, at every breakpoint
- Geist Sans and Geist Mono, no third family
- One deliberate motion moment: the generated-card entrance, reduced-motion gated

## Colors

A near-monochrome field with exactly one chromatic voice: every neutral is chroma 0, so the
single blue is the only hue the interface ever raises.

### Primary

- **Signal Blue** (`--primary`, `--ring`): the one accent, identical in light and dark so the
  brand note never shifts between themes. It marks the one thing that matters on a given
  screen: the default button fill, the focus ring, and the usage-meter fill. Its rarity is
  what makes it legible.
- **Signal Blue's label** (`--primary-foreground`): near-black ink, not white. Signal Blue is
  a *bright* blue; a near-white label on it measures 3.13:1, under AA for 14px text, while
  `oklch(0.145 0 0)` measures 6.06:1. The dark label is the correct pairing for a fill this
  light, and it is the same value in both themes because the fill is.
- **Signal Blue as text** (`--primary-text`): the one role that varies by theme. The fill
  value is too light to read as text on a white page (3.27:1), so links and inline accents
  use a deeper blue in light mode (`oklch(0.52 0.154 252)`, 5.54:1) and a lifted one in dark
  (`oklch(0.7 0.162 252)`, 6.16:1 on card). Same hue, same identity, legible on both grounds.

### Neutral

- **Paper** (`--background`, `--card`, pure white in light): the stage floor. Card and page
  share a value in light mode, so cards separate by ring rather than by fill.
- **Ink** (`--foreground`, near-black): body and heading text, and the source of every
  translucent hairline (`ring-foreground/10`).
- **Whisper** (`--muted`, `--secondary`, `--accent`, all `oklch(0.97 0 0)`): the one step off
  the page — hover fills, the user's message bubble, icon plates, the meter track. Three
  tokens deliberately share a value; they are semantic aliases, not three greys.
- **Half-tone** (`--muted-foreground`): secondary copy, chip blurbs, captions, timestamps.
- **Hairline** (`--border`): every decorative boundary in the system.
- **Field edge** (`--input`): form-control boundaries only, and one step darker than the
  decorative hairline (`oklch(0.8 0 0)` vs `0.922`). At the hairline value an input edge is
  1.26:1 against a white page and reads as absent; this lifts it to 1.87:1 while staying a
  hairline rather than a rule. Reaching the full 3:1 non-text minimum would need ~`0.67`,
  which abandons the hairline language system-wide — a deliberate, recorded exception, taken
  because the fill, label, and focus ring carry the control's state alongside its edge.
- **Dark-mode note:** dark is a layered grey, not black — sidebar `0.18`, background `0.205`,
  card `0.24` — and borders switch to alpha-white (`oklch(1 0 0 / 7%)` for `--border`, `10%`
  for `--input`) so hairlines stay even against every layer.

### Tertiary

- **Alarm** (`--destructive`): destructive menu items, invalid fields, and the usage meter
  once it crosses 90% of the daily cap. Lightened in dark mode (`oklch(0.68 0.18 22.216)`).
- **Data ramp** (`--chart-1` … `--chart-5`): the five-step series palette for the `Chart`
  primitive, consumed as bare `var(--chart-N)` references. The ramp is re-authored entirely
  for dark mode rather than lightness-shifted.
- **Trend pair** (emerald `-600`/`-400`, rose `-600`/`-400`): the up/down indicators on KPI
  deltas, flat trends falling back to Half-tone. These are *semantic content colors inside
  generated cards*, not brand or chrome, and are the one sanctioned exception to the One
  Signal Rule. Do not promote them into the shell, and do not "correct" them to Signal Blue.

### Named Rules

**The One Signal Rule.** Signal Blue is the only chromatic color permitted in the chrome. If
a second hue seems necessary, the answer is a neutral at a different lightness or the
existing destructive token — not a new accent. `--primary-text` is the same hue at a
different lightness, not a second accent.

**The Fill-Or-Text Rule.** Signal Blue as a *fill* is `--primary` and carries a dark label.
Signal Blue as *text* is `--primary-text`. Using `--primary` as a text color is the one way
to reintroduce the contrast failure this system was corrected for.

**The Chart Palette Is Not The Brand Rule.** `--chart-1` … `--chart-5` are data-series colors
and appear only inside charts. They never fill a button, a badge, a border, or a background.

**The Neutrals Are Aliases Rule.** `--muted`, `--secondary`, and `--accent` intentionally
resolve to one value. Change them together or change the semantics, never one in isolation.

**Committed direction (not yet implemented):** the neutral ramp is to move slightly warm — a
small amount of chroma at a warm hue, low enough that surfaces read as paper rather than
screen, and low enough not to disturb the Signal Blue relationship. The values above are the
current chroma-0 truth; treat the warm shift as approved work waiting to be done, not as a
description of what ships today.

## Typography

**Display Font:** Geist Sans (with `ui-sans-serif`, `system-ui`)
**Body Font:** Geist Sans — the same face; `--font-heading` is an explicit alias of
`--font-sans`
**Label/Mono Font:** Geist Mono (with `ui-monospace`, `SFMono-Regular`)

**Character:** A single geometric-grotesque voice doing all the work, differentiated by
weight and size rather than by contrast between families. The pairing is neutral by design:
it reports rather than performs, which is what lets the generated card's own hierarchy read
clearly on top of it.

### Hierarchy

- **Display** (600, 1.875rem / 30px, `tracking-tight`): the empty-state headline only — the
  first sentence a cold visitor reads.
- **Headline** (700, 1.5rem / 24px): `Heading level 1` inside generated cards. The largest
  type the model can emit.
- **Title** (500–600, 1rem–1.25rem / 16–20px, `leading-snug`): card titles and
  `Heading level 2–4`. Card titles use `--font-heading` at 500.
- **Body** (400, 0.875rem / 14px, 1.25rem line-height): everything else — messages, card
  text, list items, form labels at 500. This is the system's default size.
- **Label** (400, 0.75rem / 12px): chip blurbs, captions, meter readouts, helper and error
  text. Numeric readouts add `tabular-nums` so the meter does not jitter as it counts.
- **Mono** (400, 0.75rem, `letter-spacing: 0.3em`, uppercase): reserved for the eyebrow on
  the crawler-facing root page. The one place the system uses a monospaced voice as texture.

### Named Rules

**The Two-Face Rule.** Geist Sans and Geist Mono. No third family, no serif, no display face.
Hierarchy is carried by weight, size, and tracking.

**The Small-Body Rule.** Body copy is 14px. 16px and above belong to card titles and headings
only; dropping body to 12px is reserved for the label tier, never for prose.

## Layout

The shell is a full-viewport (`h-dvh`) two-column flex: a fixed 288px (`w-72`) sidebar and a
fluid main column. Below the `md` breakpoint (768px) the sidebar leaves the flow entirely and
returns as a left-side sheet behind a ghost icon button pinned at the top-left.

Inside the main column, everything that a person reads or types is centered in a **768px
(`max-w-3xl`) measure** with 16px side padding: the conversation transcript, the composer,
the error bubble, the anonymous chip deck. The conversation scrolls; the composer is a fixed
footer separated by a top hairline over a 95%-opacity background so content passing beneath
stays faintly visible.

Density is uniform and tight. The spacing rhythm runs on Tailwind's 4px base and in practice
uses 4 / 6 / 8 / 12 / 16 / 24 / 32px. Cards pad 16px, compact cards 12px, the composer strip
16px horizontal and 12px vertical. Assistant messages run the full measure; user messages cap
at 95% width and align right.

The chip deck is a 2×2 grid at `sm` and above. Its compact variant — used in the anonymous
bottom bar where it stands in for the composer — stays 2-up on mobile but shrinks padding and
icon size and hides the blurb line, so four cards never swallow a phone screen.

### Named Rules

**The Single Measure Rule.** Every reading and input surface centers on the same 768px
column. A new surface that introduces a second content width breaks the shell's spine.

## Elevation & Depth

**Flat chrome, lifted content.** The shell has no shadow vocabulary at all: surfaces sit flat
and separate through tonal layering and hairlines. In dark mode the layering is explicit —
sidebar `0.18` sits under background `0.205`, which sits under card `0.24` — so depth reads as
a sequence of tones rather than as cast light. In light mode, page and card share pure white
and are told apart entirely by a 1px translucent ring.

Elevation is held in reserve as a *meaning*, not a decoration: lift signals that something was
produced by the model. The chip cards — the anonymous visitor's launch pad, and the closest
thing to a generated card in the chrome — are the only elements that currently raise a shadow,
and only on hover.

### Shadow Vocabulary

- **Card ring** (`box-shadow: 0 0 0 1px oklch(0.145 0 0 / 0.1)` via `ring-1
  ring-foreground/10`): the default boundary for every card surface. A ring, not a border, so
  it does not participate in layout.
- **Chip hover lift** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)`): the single hover shadow
  in the system, paired with a border shift to `foreground/20` and an `accent/40` fill.
- **Focus ring** (`box-shadow: 0 0 0 3px var(--ring) / 50%` via `focus-visible:ring-3
  ring-ring/50`, plus `border-ring`): a 3px bloom in Signal Blue at half opacity. Deliberately
  thicker than the platform default — at this control size, a 1px focus outline disappears.

### Named Rules

**The Flat-Chrome Rule.** Chrome is flat at rest. If a chrome element needs separation, it
gets a hairline ring or a tonal step — never a drop shadow.

**The Lift-Means-Generated Rule.** Elevation is a signal reserved for model-produced content
and the surfaces that stand in for it. Do not spend it on navigation, toolbars, or dialogs.

## Shapes

Corners derive from a single base — `--radius: 0.625rem` (10px) — scaled by fixed multipliers
into a seven-step ramp (6 / 8 / 10 / 14 / 18 / 22 / 26px). Nothing in the system hard-codes a
radius outside that ramp.

In practice three steps do nearly all the work: **10px** for controls (buttons, inputs,
dropdowns, the user's message bubble), **14px** for surfaces (cards, chip cards, attachment
thumbnails), and **26px** for pills (badges, the press-receipt chip, the usage-meter track,
avatar and icon plates that read as circles at their size). Small button variants clamp
against the ramp (`rounded-[min(var(--radius-md),12px)]`) so a 24px control never looks
over-rounded.

Borders are uniformly 1px and low-contrast. The form language is rectangular and calm: no
clipping, no angles, no decorative silhouettes.

### Named Rules

**The Ramp-Only Rule.** Every corner value comes from the `--radius` ramp. A hard-coded
`border-radius` is a defect, not a variation.

**The Pill Is For Metadata Rule.** Fully rounded shapes mark small, non-interactive status
objects — badges, receipts, meters. Actions are 10px; surfaces are 14px.

## Components

### Buttons

Compact and responsive to touch: small, dense, and immediate, with real feedback so tight
controls read as deliberate rather than cramped.

- **Shape:** control radius (10px), 1px transparent border reserved so focus can color it
  without shifting layout.
- **Sizes:** default 32px tall (`h-8`, 10px horizontal padding); `sm` 28px; `xs` 24px;
  `lg` 36px; icon variants are square at the same heights. 16px Lucide icons (12–14px in the
  smaller sizes).
- **Default:** Signal Blue fill, near-black label (`--primary-foreground`), 14px medium.
- **Outline:** transparent-to-page fill with a hairline border; hovers to the Whisper grey. In
  dark mode it takes a faint `input/30` fill so it stays visible against the layered greys.
- **Ghost:** no fill until hover, then Whisper. The workhorse for icon actions.
- **Destructive:** a 10% destructive tint with destructive-colored text — never a solid red
  fill. Danger is stated, not shouted.
- **Hover / Focus / Active:** `transition-all`; focus-visible raises the 3px Signal Blue bloom
  and colors the border; `active:translate-y-px` presses the button down one pixel. Disabled
  drops to 50% opacity and kills pointer events.

### Chips

Two distinct objects share the word:

- **Chip cards** (the starter deck): left-aligned card buttons with an icon plate, a 14px
  medium label, and a 12px muted blurb. Surface radius (14px), card fill, hairline border.
  Hover shifts the border to `foreground/20`, fills with `accent/40`, raises the one hover
  shadow in the system, and flips the icon plate from muted to `foreground/5`. Disabled
  suppresses all hover response so a streaming turn cannot look interactive.
- **Badges / receipts:** pill-shaped 20px tags at 12px medium. The catalog maps four semantic
  tones onto four variants — `default` → Signal Blue fill with the dark label, `success` →
  Whisper, `warning` → outline, `danger` → destructive tint.

### Cards / Containers

- **Corner Style:** surface radius (14px), with first and last child images clipped to match.
- **Background:** card fill; generated cards use `bg-card/80` so the page tone shows through
  very slightly.
- **Shadow Strategy:** none. A 1px `foreground/10` ring (see Elevation).
- **Border:** the ring is the border. Footers add a top hairline and a `muted/50` fill.
- **Internal Padding:** 16px horizontal, 16px vertical, 16px gap between sections; the `sm`
  size drops to 12px. Content sections use flex-column gaps rather than margin stacks so
  entrance animation can target children directly.

### Inputs / Fields

- **Style:** 32px tall, control radius (10px), transparent fill over a 1px hairline. 16px text
  on mobile stepping down to 14px at `md` — the standard guard against iOS zoom-on-focus.
- **Focus:** border shifts to Signal Blue and the 3px ring blooms; color-only transition, no
  size change.
- **Error:** `aria-invalid` drives a destructive border plus a destructive-tinted ring; helper
  text renders at 12px in the destructive color beneath the field.
- **Disabled:** 50% opacity, a faint `input/50` fill, and `cursor-not-allowed`.
- **Composer textarea:** the same language at full width inside a bordered shell, with the
  tool row (attach, model, usage meter) and submit button in a footer strip beneath it.

### Navigation

The sidebar is a 288px column: a 40px header pairing the wordmark with the theme toggle, a
full-width outline "New chat" button inset 8px, a scrolling session list, and a pinned account
section at the bottom. Session rows are 8px-radius, 14px, and reveal their action menu only on
hover or when the menu is open; the active row takes the `accent` fill with
`accent-foreground` text. Rename happens inline — the row's text swaps for a 28px input that
commits on Enter or blur. On mobile the whole column moves into a left sheet, identical in
content, opened from a ghost icon button floated over the transcript.

### Generated Card (signature)

The system's reason for existing. A model-emitted spec renders inside `AnimatedCardShell`,
which runs a one-shot GSAP entrance on mount: the container fades from 0 and rises 12px over
0.4s on `power2.out`, then the card's content children cascade from 8px with a 0.35s stagger
spread and an 80ms lead-in. It uses `gsap.from()` deliberately, so the resting DOM state is
the visible one — if JavaScript never runs, the card still shows. The whole animation sits
inside a `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` gate.

That cascade is the *only* entrance a card runs. Charts explicitly switch off Recharts'
own draw-on animation (`isAnimationActive={false}` on every series): it would be a second
entrance competing inside the first, it is not reduced-motion gated, and a frame-zero line
renders as an empty plot wherever `requestAnimationFrame` is throttled — background tabs,
print, screenshot tooling.

Inside, the card is a flex column with 12px gaps, a hairline border, and an 80%-opacity card
fill. The catalog's own type ramp (24px bold → 20px semibold → 18px semibold → 16px medium)
gives the model four heading steps; body text is 14px, muted body is 14px in Half-tone.

### Usage Meter (signature)

A 4px-tall, 64px-wide pill track in Whisper with a Signal Blue fill that animates its width as
the daily budget is spent, paired with a 12px `tabular-nums` percentage. At 90% consumed the
fill switches to the destructive color. It carries full progressbar semantics
(`role="progressbar"` with min/now/max and a label) and a title explaining the reset time.
This is the only place in the chrome where a constraint is drawn rather than written.

### Press Receipt (signature)

After an interactive card button fires, the transcript records it as a right-aligned pill —
hairline border, card fill, 12px text, a cursor-click icon, and the pressed label in medium
weight. It reads as a system note rather than a message, and it is how an interaction inside
a generated card becomes part of the conversation's history.

## Do's and Don'ts

### Do:

- **Do** keep Signal Blue (`oklch(0.65 0.196 252)`) as the only chromatic color in the chrome,
  and keep the fill identical across light and dark.
- **Do** reach for `--primary-text` whenever blue is type and `--primary` whenever blue is a
  surface, and check any new foreground/background pair against 4.5:1 before shipping it.
- **Do** separate surfaces with a 1px `foreground/10` ring or a tonal step, never a shadow.
- **Do** pull every corner value from the `--radius` ramp (6 / 8 / 10 / 14 / 18 / 22 / 26px):
  10px for controls, 14px for surfaces, 26px for pills.
- **Do** hold controls to 32px with 14px labels, and give every interactive element the 3px
  `ring-ring/50` focus bloom.
- **Do** center every reading and input surface on the 768px column.
- **Do** gate every entrance animation behind `prefers-reduced-motion` and author it with
  `gsap.from()` so the resting DOM state stays visible without JavaScript.
- **Do** carry warmth through plain copy, breathing room, and live motion — and, when the
  approved warm-neutral shift lands, through a low-chroma warm hue applied to the whole
  neutral ramp at once.
- **Do** reserve `--chart-1` … `--chart-5` for data series inside charts.

### Don't:

- **Don't** introduce a second accent hue, a serif, or a third font family.
- **Don't** put a white or near-white label on Signal Blue, and don't set body text in
  `--primary`; both are the 3.1:1 pairings this system was corrected away from.
- **Don't** add drop shadows to chrome — navigation, toolbars, dialogs, or the composer.
- **Don't** exceed the radius ramp or hard-code a `border-radius`; oversized rounding reads as
  the playful register this system rejects.
- **Don't** use bouncy or elastic easing, mascots, or emoji-led empty states.
- **Don't** fill a destructive action with solid red; use the 10% tint with destructive text.
- **Don't** change `--muted`, `--secondary`, or `--accent` in isolation — they are aliases of
  one value.
- **Don't** let chrome out-weigh a generated card. If a new surface competes with the card for
  attention, the surface is wrong.
