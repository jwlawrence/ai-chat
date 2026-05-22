# Storybook for json-render Catalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per user preference, **do NOT run `git commit`** — leave changes unstaged for the user to review at the end of each task.

**Goal:** Add a Storybook 9 install that renders every json-render catalog primitive (16 of them) plus the common compositions and state-driven patterns, so the user can visually audit the rendered output without spinning up the chat app.

**Architecture:** Each story renders a real json-render `Spec` through the same provider tree production uses (`<JSONUIProvider><SpecRenderer><Renderer>`). A shared `SpecStory` helper hides the provider boilerplate so individual story files focus on spec shape. Stories live in a top-level `stories/` directory, one file per primitive plus two cross-cutting files (`Compositions`, `StateBinding`).

**Tech Stack:** Storybook 9 with `@storybook/nextjs` framework, React 19, Next.js 16, Tailwind v4 (via `app/globals.css`), pnpm package manager.

**Working tree contract:**
- Repo root: `/Users/jlawrenc/Development/personal/ai-chat`
- Branch: `main` (clean except an untracked `scripts/inspect-last-turn.ts` — leave it alone)
- Catalog source of truth: `lib/json-render/catalog.ts`
- Registry source of truth: `lib/json-render/registry.tsx` (exports `registry`, `SpecRenderer`, `applyLockToSpec`)
- Path alias: `@/*` → repo root (see `tsconfig.json`)
- Style guide: biome single quotes, trailing commas all, semicolons, 2-space indent, 100-col line width (see `biome.json`)

---

## File Structure (what gets created)

| Path | Purpose |
|---|---|
| `.storybook/main.ts` | Storybook framework + addons + stories glob |
| `.storybook/preview.tsx` | Global decorators, Tailwind import, light/dark toggle |
| `stories/_render-spec-story.tsx` | `SpecStory` helper — wraps a `Spec` in the full provider tree |
| `stories/Button.stories.tsx` | Pilot — proves the harness works |
| `stories/Card.stories.tsx` | Card primitive variants |
| `stories/Heading.stories.tsx` | Heading levels 1–4 |
| `stories/Text.stories.tsx` | Text + muted |
| `stories/Image.stories.tsx` | Image with/without caption |
| `stories/Link.stories.tsx` | Link |
| `stories/List.stories.tsx` | Ordered + unordered |
| `stories/Input.stories.tsx` | Text/email/number/password kinds (inside Form) |
| `stories/Select.stories.tsx` | Select with options (inside Form) |
| `stories/Checkbox.stories.tsx` | Checkbox (inside Form) |
| `stories/Form.stories.tsx` | Form wrapper with a couple of fields |
| `stories/Tabs.stories.tsx` | Tabs uncontrolled + with nested children |
| `stories/Accordion.stories.tsx` | Accordion with nested children |
| `stories/Callout.stories.tsx` | 4 tones × with/without title |
| `stories/Badge.stories.tsx` | 4 tones |
| `stories/Divider.stories.tsx` | Single divider |
| `stories/Compositions.stories.tsx` | Card stack, full Form, annotated-list pattern |
| `stories/StateBinding.stories.tsx` | Tabs.valueStatePath driving Text; locked-card visual |
| `package.json` | New `storybook` / `build-storybook` scripts (added by init) |

`docs/superpowers/plans/` already exists but the user keeps plans flat in `plans/` — this file lives at `plans/storybook.md` to match `plans/json-render-ui.md`.

---

## Task 1: Install Storybook 9 via the official init command

**Files:**
- Modify: `package.json` (init adds scripts + devDeps)
- Create: `.storybook/main.ts`, `.storybook/preview.ts` (init scaffolds these; we overwrite in Tasks 2–3)
- Create: `stories/*` sample stories (init scaffolds; we delete in step 5)

- [ ] **Step 1: Run Storybook init in the repo root**

Run:
```bash
cd /Users/jlawrenc/Development/personal/ai-chat
pnpm dlx storybook@latest init --yes
```

Expected: init detects Next.js, installs `storybook`, `@storybook/nextjs`, `@storybook/addon-docs`, `@storybook/addon-onboarding`, `eslint-plugin-storybook` (or biome-compatible equivalent — biome doesn't need this), adds `storybook` and `build-storybook` scripts to `package.json`. May take 1–3 minutes.

If init fails with a React 19 / Next 16 peer-dep error, fall back to:
```bash
pnpm dlx storybook@next init --yes
```

If both fail, install manually:
```bash
pnpm add -D storybook@latest @storybook/nextjs@latest @storybook/addon-docs@latest @storybook/addon-themes@latest
```
…then create the `.storybook/main.ts` and `preview.tsx` from scratch (Tasks 2–3 cover the content).

- [ ] **Step 2: Verify Storybook scripts landed in package.json**

Run:
```bash
grep -E '"storybook"|"build-storybook"' package.json
```

Expected output (order may vary):
```
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build",
```

If missing, add them manually:
```json
"storybook": "storybook dev -p 6006",
"build-storybook": "storybook build"
```

- [ ] **Step 3: Verify Storybook boots**

Run:
```bash
pnpm storybook --no-open
```

Wait until the terminal prints `Storybook X.Y.Z for nextjs started` and `Local: http://localhost:6006/`. Then `Ctrl+C` to stop.

Expected: no compilation errors. If you see a Webpack/Vite error referencing `@/` or Tailwind, that's expected at this stage — Tasks 2–3 fix it. The boot itself only needs to reach the "started" message.

If Storybook crashes on boot with React 19 peer conflicts, install `@storybook/nextjs-vite` as an alternative framework and update `.storybook/main.ts` (Task 2) to use `'@storybook/nextjs-vite'` instead.

- [ ] **Step 4: Add `.storybook/` and `storybook-static/` to ignore lists if needed**

Run:
```bash
grep -E 'storybook-static' .gitignore || echo 'storybook-static/' >> .gitignore
```

Verify `.gitignore` now contains `storybook-static/`. (`.storybook/` should be tracked — it holds config.)

- [ ] **Step 5: Delete the scaffolded sample stories**

The init command creates `stories/Button.stories.ts`, `stories/Page.stories.ts`, `stories/Header.stories.ts`, etc. plus matching component files. Remove them — we will write our own Button story in Task 5.

Run:
```bash
ls stories/ 2>/dev/null
```

For every file the init created in `stories/` (likely `Button.stories.ts`, `Button.tsx`, `Header.stories.ts`, `Header.tsx`, `Page.stories.ts`, `Page.tsx`, `button.css`, `header.css`, `page.css`, `assets/`, `Configure.mdx`), delete it:
```bash
rm -rf stories
mkdir stories
```

- [ ] **Step 6: Verify the workspace state**

Run:
```bash
ls .storybook/ stories/ && grep -c 'storybook' package.json
```

Expected: `.storybook/` contains `main.ts` (or `main.js`) and `preview.tsx` (or `preview.ts`); `stories/` is empty; `package.json` matches >= 2 storybook references (the two scripts).

- [ ] **Step 7: Verify (do not commit — user will review)**

Run:
```bash
git status
```

Expected: `package.json`, `pnpm-lock.yaml`, `.storybook/`, `.gitignore` show as modified/untracked. Leave unstaged.

---

## Task 2: Configure `.storybook/main.ts`

**Files:**
- Create or replace: `.storybook/main.ts`

- [ ] **Step 1: Replace `.storybook/main.ts` (or `.storybook/main.js`) with the project-specific config**

Write `.storybook/main.ts`:

```ts
import type { StorybookConfig } from '@storybook/nextjs';
import { resolve } from 'node:path';

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-themes'],
  framework: {
    name: '@storybook/nextjs',
    options: {},
  },
  staticDirs: ['../public'],
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
  },
  // Storybook 9 uses Webpack 5 under @storybook/nextjs. Re-declare the @/ alias
  // (tsconfig paths are not auto-applied to the Storybook bundler).
  webpackFinal: async (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@': resolve(__dirname, '..'),
    };
    return config;
  },
};

export default config;
```

If Task 1 fell back to `@storybook/nextjs-vite`, change the framework import + name to `'@storybook/nextjs-vite'` and replace the `webpackFinal` block with:
```ts
viteFinal: async (config) => {
  config.resolve = config.resolve ?? {};
  config.resolve.alias = {
    ...(config.resolve.alias ?? {}),
    '@': resolve(__dirname, '..'),
  };
  return config;
},
```

- [ ] **Step 2: Delete the old `.storybook/main.js` if it exists**

Run:
```bash
rm -f .storybook/main.js
```

- [ ] **Step 3: Install `@storybook/addon-themes` if init did not**

Run:
```bash
pnpm list @storybook/addon-themes 2>/dev/null | grep -q addon-themes || pnpm add -D @storybook/addon-themes
```

- [ ] **Step 4: Boot Storybook to verify config parses**

Run:
```bash
pnpm storybook --no-open
```

Expected: terminal prints `Storybook ... for nextjs started`. Press `Ctrl+C` to stop.

If the bundler errors on `@/` imports, double-check the `webpackFinal`/`viteFinal` block above.

---

## Task 3: Configure `.storybook/preview.tsx`

**Files:**
- Create or replace: `.storybook/preview.tsx`

- [ ] **Step 1: Write `.storybook/preview.tsx`**

```tsx
import type { Preview } from '@storybook/nextjs';
import { withThemeByClassName } from '@storybook/addon-themes';
import '../app/globals.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'app',
      values: [
        { name: 'app', value: 'var(--background, #ffffff)' },
        { name: 'white', value: '#ffffff' },
        { name: 'black', value: '#000000' },
      ],
    },
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
  },
  decorators: [
    withThemeByClassName({
      themes: { light: '', dark: 'dark' },
      defaultTheme: 'light',
    }),
    // Centered, max-width wrapper so cards do not stretch full-width
    (Story) => (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Story />
      </div>
    ),
  ],
};

export default preview;
```

- [ ] **Step 2: Delete the old `.storybook/preview.ts` if init created one**

Run:
```bash
rm -f .storybook/preview.ts
```

- [ ] **Step 3: Verify globals.css path is correct**

Run:
```bash
ls app/globals.css
```

Expected: file exists. If the file lives elsewhere, update the import in `preview.tsx`.

- [ ] **Step 4: Boot Storybook and verify Tailwind classes resolve**

Run:
```bash
pnpm storybook --no-open
```

Expected: terminal prints `... started`. No errors about missing `globals.css` or unknown Tailwind utilities. Stop with `Ctrl+C`.

---

## Task 4: Create the shared `SpecStory` helper

**Files:**
- Create: `stories/_render-spec-story.tsx`

- [ ] **Step 1: Write the helper**

```tsx
'use client';

import { createStateStore, type Spec } from '@json-render/core';
import { JSONUIProvider, Renderer } from '@json-render/react';
import { useMemo } from 'react';
import { applyLockToSpec, registry, SpecRenderer } from '@/lib/json-render/registry';

/**
 * Default action handlers for stories. Mirror the production action set so
 * model-mode and endpoint-mode buttons do not crash — they just log to the
 * console instead of triggering real backend calls.
 */
const defaultHandlers: Record<string, (params: unknown) => Promise<unknown>> = {
  sendToModel: async (params) => {
    console.log('[story] sendToModel', params);
  },
  submitForm: async (params) => {
    console.log('[story] submitForm', params);
  },
  refreshData: async () => {
    console.log('[story] refreshData');
  },
  fetchWeather: async (params) => {
    console.log('[story] fetchWeather', params);
    const mode = (params as { mode?: string } | undefined)?.mode ?? 'daily';
    return { summary: mode === 'weekly' ? 'Mild week ahead — highs near 70°F.' : 'Sunny, 72°F.', mode };
  },
};

/**
 * Render a json-render `Spec` through the same provider tree production uses.
 *
 * - `locked`: when true, runs `applyLockToSpec` before render so model-mode
 *   buttons and form fields render in their disabled state.
 * - `handlers`: override or extend the default no-op action handlers.
 */
export function SpecStory({
  spec,
  locked = false,
  handlers,
}: {
  spec: Spec;
  locked?: boolean;
  handlers?: Record<string, (params: unknown) => Promise<unknown>>;
}) {
  const store = useMemo(
    () => createStateStore((spec.state as Record<string, unknown> | undefined) ?? {}),
    // biome-ignore lint/correctness/useExhaustiveDependencies: store is intentionally created once per story mount
    [],
  );
  const effectiveSpec = locked ? applyLockToSpec(spec, true) : spec;
  const mergedHandlers = handlers ? { ...defaultHandlers, ...handlers } : defaultHandlers;
  return (
    <JSONUIProvider registry={registry} store={store} handlers={mergedHandlers}>
      <SpecRenderer spec={effectiveSpec} registry={registry}>
        <Renderer spec={effectiveSpec} registry={registry} />
      </SpecRenderer>
    </JSONUIProvider>
  );
}
```

- [ ] **Step 2: Type-check passes**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: zero errors. If the `JSONUIProvider` `handlers` prop has a stricter type than `Record<string, (params: unknown) => Promise<unknown>>`, import the correct type from `@json-render/react` (likely `ActionHandlers` or similar — check `node_modules/@json-render/react/dist/*.d.ts`) and use it instead. Adjust both the `defaultHandlers` const and the prop type.

- [ ] **Step 3: Biome passes**

Run:
```bash
pnpm exec biome check stories/_render-spec-story.tsx
```

Expected: no errors. The `biome-ignore` line above suppresses the only known warning.

---

## Task 5: Pilot — `stories/Button.stories.tsx`

This is the harness shakedown. Verify the helper renders correctly with light/dark toggle and that the `emit('press')` path logs (since the default `sendToModel` handler logs to console).

**Files:**
- Create: `stories/Button.stories.tsx`

- [ ] **Step 1: Write the story**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = {
  title: 'Primitives/Button',
  component: SpecStory,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof SpecStory>;

const buttonSpec = (
  label: string,
  variant: 'primary' | 'secondary' | 'ghost' | 'destructive',
  opts: { disabled?: boolean } = {},
): Spec => ({
  root: 'btn',
  elements: {
    btn: {
      type: 'Button',
      props: { label, variant, disabled: opts.disabled ?? false },
      on: {
        press: {
          action: 'sendToModel',
          params: { label, message: `Pressed ${label}` },
        },
      },
      children: [],
    },
  },
});

export const Primary: Story = { args: { spec: buttonSpec('Continue', 'primary') } };
export const Secondary: Story = { args: { spec: buttonSpec('Cancel', 'secondary') } };
export const Ghost: Story = { args: { spec: buttonSpec('Skip', 'ghost') } };
export const Destructive: Story = { args: { spec: buttonSpec('Delete', 'destructive') } };
export const Disabled: Story = {
  args: { spec: buttonSpec('Submit', 'primary', { disabled: true }) },
};
export const Locked: Story = {
  args: { spec: buttonSpec('Approve', 'primary'), locked: true },
};
```

- [ ] **Step 2: Boot Storybook and visually verify**

Run:
```bash
pnpm storybook
```

Open `http://localhost:6006/`. Navigate to **Primitives → Button**. Confirm:
- All six stories render
- Each variant has a distinct visual style (primary filled, secondary muted, ghost minimal, destructive red)
- Disabled and Locked appear greyed out
- Light/dark toggle in the toolbar flips the theme — text remains legible in both
- Clicking a button logs `[story] sendToModel { label, message }` in the browser console

`Ctrl+C` to stop.

- [ ] **Step 3: Type-check + biome**

Run:
```bash
pnpm exec tsc --noEmit && pnpm exec biome check stories/Button.stories.tsx
```

Expected: zero errors.

---

## Tasks 6–20: One story file per remaining primitive

Each task follows the same shape: write the file, boot Storybook once (or rely on the running dev server), confirm visual, type-check + biome.

**Pattern for every primitive story file:**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = {
  title: 'Primitives/<PrimitiveName>',
  component: SpecStory,
};
export default meta;
type Story = StoryObj<typeof SpecStory>;

// ... per-story `args: { spec: <some Spec> }` exports
```

**Verification (run once at the end of each task):**
```bash
pnpm exec tsc --noEmit && pnpm exec biome check stories/<File>.stories.tsx
```

---

### Task 6: `stories/Card.stories.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Card', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const cardSpec = (overrides: {
  title?: string;
  footer?: string;
  bodyText: string;
}): Spec => ({
  root: 'card',
  elements: {
    card: {
      type: 'Card',
      props: { title: overrides.title, footer: overrides.footer },
      children: ['body'],
    },
    body: { type: 'Text', props: { text: overrides.bodyText }, children: [] },
  },
});

export const TitleAndFooter: Story = {
  args: {
    spec: cardSpec({
      title: 'Server status',
      footer: 'Updated 2 minutes ago',
      bodyText: 'All systems nominal.',
    }),
  },
};

export const TitleOnly: Story = {
  args: { spec: cardSpec({ title: 'Just a title', bodyText: 'Body content goes here.' }) },
};

export const FooterOnly: Story = {
  args: { spec: cardSpec({ footer: 'tiny footer', bodyText: 'Body content goes here.' }) },
};

export const Bare: Story = {
  args: { spec: cardSpec({ bodyText: 'A card with no title or footer.' }) },
};
```

- [ ] **Step 2: Visually verify in Storybook (Primitives → Card)**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/Card.stories.tsx`**

---

### Task 7: `stories/Heading.stories.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Heading', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const headingSpec = (level: 1 | 2 | 3 | 4, text: string): Spec => ({
  root: 'h',
  elements: { h: { type: 'Heading', props: { level, text }, children: [] } },
});

export const Level1: Story = { args: { spec: headingSpec(1, 'Level 1 heading') } };
export const Level2: Story = { args: { spec: headingSpec(2, 'Level 2 heading') } };
export const Level3: Story = { args: { spec: headingSpec(3, 'Level 3 heading') } };
export const Level4: Story = { args: { spec: headingSpec(4, 'Level 4 heading') } };

export const AllLevels: Story = {
  args: {
    spec: {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['h1', 'h2', 'h3', 'h4'] },
        h1: { type: 'Heading', props: { level: 1, text: 'H1 — major section' }, children: [] },
        h2: { type: 'Heading', props: { level: 2, text: 'H2 — sub-section' }, children: [] },
        h3: { type: 'Heading', props: { level: 3, text: 'H3 — group' }, children: [] },
        h4: { type: 'Heading', props: { level: 4, text: 'H4 — minor' }, children: [] },
      },
    },
  },
};
```

- [ ] **Step 2: Visually verify**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/Heading.stories.tsx`**

---

### Task 8: `stories/Text.stories.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Text', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const textSpec = (text: string, muted = false): Spec => ({
  root: 't',
  elements: { t: { type: 'Text', props: { text, muted }, children: [] } },
});

export const Default: Story = {
  args: { spec: textSpec('A paragraph of regular body text.') },
};
export const Muted: Story = {
  args: { spec: textSpec('A paragraph of muted, secondary text.', true) },
};
export const Long: Story = {
  args: {
    spec: textSpec(
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.',
    ),
  },
};
```

- [ ] **Step 2: Visually verify**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/Text.stories.tsx`**

---

### Task 9: `stories/Image.stories.tsx`

The `Image` primitive enforces HTTPS URLs via Zod. Use real, stable image URLs (picsum.photos serves consistent placeholder photos).

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Image', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const imageSpec = (src: string, alt: string, caption?: string): Spec => ({
  root: 'img',
  elements: { img: { type: 'Image', props: { src, alt, caption }, children: [] } },
});

export const WithCaption: Story = {
  args: {
    spec: imageSpec(
      'https://picsum.photos/seed/storybook-1/1200/675',
      'Mountain landscape at sunset',
      'Fig 1 — Picsum placeholder image, 16:9 aspect.',
    ),
  },
};

export const NoCaption: Story = {
  args: {
    spec: imageSpec('https://picsum.photos/seed/storybook-2/1200/675', 'Forest scene'),
  },
};

export const Portrait: Story = {
  args: {
    spec: imageSpec(
      'https://picsum.photos/seed/storybook-3/600/900',
      'Tall portrait — confirms max-h-72 cap',
      'A portrait image — the `max-h-72` cap (Phase 6 A2) keeps it from blowing up the card.',
    ),
  },
};
```

- [ ] **Step 2: Visually verify all three images load (no broken-image icons) and confirm Portrait is bounded by `max-h-72`**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/Image.stories.tsx`**

---

### Task 10: `stories/Link.stories.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Link', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const linkSpec = (href: string, text: string): Spec => ({
  root: 'l',
  elements: { l: { type: 'Link', props: { href, text }, children: [] } },
});

export const Default: Story = { args: { spec: linkSpec('https://example.com', 'Visit example.com') } };
export const LongText: Story = {
  args: {
    spec: linkSpec(
      'https://example.com/very/long/path/to/some/resource',
      'A link whose text is quite a bit longer than usual',
    ),
  },
};
```

- [ ] **Step 2: Visually verify (link is underlined; opens in a new tab)**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/Link.stories.tsx`**

---

### Task 11: `stories/List.stories.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/List', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const listSpec = (items: string[], ordered = false): Spec => ({
  root: 'l',
  elements: { l: { type: 'List', props: { items, ordered }, children: [] } },
});

export const Unordered: Story = {
  args: { spec: listSpec(['Apples', 'Bananas', 'Cherries', 'Dates']) },
};
export const Ordered: Story = {
  args: { spec: listSpec(['Wake up', 'Brew coffee', 'Read changelog', 'Ship code'], true) },
};
export const SingleItem: Story = {
  args: { spec: listSpec(['Only one item']) },
};
```

- [ ] **Step 2: Visually verify (bullets for unordered, numbers for ordered)**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/List.stories.tsx`**

---

### Task 12: `stories/Input.stories.tsx`

Inputs must be wrapped in a `Form` to bind to state — otherwise they emit a dev-mode warning. Every story below wraps the input in a Form.

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Input', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const inputSpec = (props: {
  name: string;
  label?: string;
  placeholder?: string;
  kind?: 'text' | 'email' | 'number' | 'password';
  seed?: string;
}): Spec => ({
  root: 'form',
  state: props.seed !== undefined ? { demo: { [props.name]: props.seed } } : undefined,
  elements: {
    form: { type: 'Form', props: { name: 'demo' }, children: ['inp'] },
    inp: {
      type: 'Input',
      props: {
        name: props.name,
        label: props.label,
        placeholder: props.placeholder,
        kind: props.kind,
      },
      children: [],
    },
  },
});

export const Text: Story = {
  args: { spec: inputSpec({ name: 'fullName', label: 'Full name', placeholder: 'Jane Doe' }) },
};
export const Email: Story = {
  args: {
    spec: inputSpec({ name: 'email', label: 'Email', placeholder: 'you@example.com', kind: 'email' }),
  },
};
export const Password: Story = {
  args: { spec: inputSpec({ name: 'password', label: 'Password', kind: 'password' }) },
};
export const Number_: Story = {
  args: { spec: inputSpec({ name: 'age', label: 'Age', kind: 'number', placeholder: '0' }) },
};
export const Seeded: Story = {
  args: {
    spec: inputSpec({ name: 'username', label: 'Username', seed: 'jdoe' }),
  },
};
export const NoLabel: Story = {
  args: { spec: inputSpec({ name: 'query', placeholder: 'Search…' }) },
};
```

- [ ] **Step 2: Visually verify (Seeded shows pre-populated `jdoe`; typing in each input updates the field)**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/Input.stories.tsx`**

---

### Task 13: `stories/Select.stories.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Select', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const selectSpec = (
  options: Array<{ value: string; label: string }>,
  opts: { label?: string; seed?: string } = {},
): Spec => ({
  root: 'form',
  state: opts.seed !== undefined ? { demo: { choice: opts.seed } } : undefined,
  elements: {
    form: { type: 'Form', props: { name: 'demo' }, children: ['sel'] },
    sel: {
      type: 'Select',
      props: { name: 'choice', label: opts.label, options },
      children: [],
    },
  },
});

export const ShortList: Story = {
  args: {
    spec: selectSpec(
      [
        { value: 'red', label: 'Red' },
        { value: 'green', label: 'Green' },
        { value: 'blue', label: 'Blue' },
      ],
      { label: 'Favorite color' },
    ),
  },
};

export const Seeded: Story = {
  args: {
    spec: selectSpec(
      [
        { value: 'daily', label: 'Today' },
        { value: 'weekly', label: '7-Day' },
      ],
      { label: 'Forecast view', seed: 'weekly' },
    ),
  },
};

export const LongList: Story = {
  args: {
    spec: selectSpec(
      Array.from({ length: 12 }, (_, i) => ({
        value: `m${i + 1}`,
        label: new Date(2026, i, 1).toLocaleString('en', { month: 'long' }),
      })),
      { label: 'Month' },
    ),
  },
};
```

- [ ] **Step 2: Visually verify (Seeded opens with "7-Day" selected; selecting an option updates state)**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/Select.stories.tsx`**

---

### Task 14: `stories/Checkbox.stories.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Checkbox', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const checkboxSpec = (label: string, seed?: boolean): Spec => ({
  root: 'form',
  state: seed !== undefined ? { demo: { agree: seed } } : undefined,
  elements: {
    form: { type: 'Form', props: { name: 'demo' }, children: ['cb'] },
    cb: { type: 'Checkbox', props: { name: 'agree', label }, children: [] },
  },
});

export const Unchecked: Story = { args: { spec: checkboxSpec('Subscribe to updates') } };
export const SeededChecked: Story = {
  args: { spec: checkboxSpec('I agree to the terms', true) },
};
export const LongLabel: Story = {
  args: {
    spec: checkboxSpec(
      'I have read and agree to the full set of terms of service and the privacy policy referenced therein',
    ),
  },
};
```

- [ ] **Step 2: Visually verify (Switch UI; clicking toggles)**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/Checkbox.stories.tsx`**

---

### Task 15: `stories/Form.stories.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Form', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const minimalForm: Spec = {
  root: 'form',
  state: { demo: { name: '' } },
  elements: {
    form: { type: 'Form', props: { name: 'demo' }, children: ['name-input'] },
    'name-input': {
      type: 'Input',
      props: { name: 'name', label: 'Name', placeholder: 'Your name' },
      children: [],
    },
  },
};

const formWithSubmit: Spec = {
  root: 'card',
  state: { demo: { name: '' } },
  elements: {
    card: { type: 'Card', props: { title: 'Quick form' }, children: ['form'] },
    form: { type: 'Form', props: { name: 'demo' }, children: ['name-input', 'submit-btn'] },
    'name-input': {
      type: 'Input',
      props: { name: 'name', label: 'Name', placeholder: 'Your name' },
      children: [],
    },
    'submit-btn': {
      type: 'Button',
      props: { label: 'Submit', variant: 'primary' },
      on: { press: { action: 'submitForm', params: { formName: 'demo' } } },
      children: [],
    },
  },
};

export const SingleField: Story = { args: { spec: minimalForm } };
export const WithSubmitButton: Story = { args: { spec: formWithSubmit } };
```

- [ ] **Step 2: Visually verify (typing in the input updates state; pressing Submit logs `[story] submitForm { formName: 'demo' }` in the browser console)**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/Form.stories.tsx`**

---

### Task 16: `stories/Tabs.stories.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Tabs', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const twoTabSpec: Spec = {
  root: 'tabs',
  elements: {
    tabs: {
      type: 'Tabs',
      props: {
        tabs: [
          { id: 'overview', label: 'Overview', children: ['ov-text'] },
          { id: 'details', label: 'Details', children: ['det-text'] },
        ],
      },
      children: [],
    },
    'ov-text': {
      type: 'Text',
      props: { text: 'Overview content goes here.' },
      children: [],
    },
    'det-text': { type: 'Text', props: { text: 'Detailed content goes here.' }, children: [] },
  },
};

const threeTabSpec: Spec = {
  root: 'tabs',
  elements: {
    tabs: {
      type: 'Tabs',
      props: {
        tabs: [
          { id: 'a', label: 'Alpha', children: ['a-text'] },
          { id: 'b', label: 'Beta', children: ['b-text'] },
          { id: 'g', label: 'Gamma', children: ['g-text'] },
        ],
      },
      children: [],
    },
    'a-text': { type: 'Text', props: { text: 'Alpha section.' }, children: [] },
    'b-text': { type: 'Text', props: { text: 'Beta section.' }, children: [] },
    'g-text': { type: 'Text', props: { text: 'Gamma section.' }, children: [] },
  },
};

export const TwoTabs: Story = { args: { spec: twoTabSpec } };
export const ThreeTabs: Story = { args: { spec: threeTabSpec } };
```

(Controlled `valueStatePath` story lives in `StateBinding.stories.tsx`, Task 22.)

- [ ] **Step 2: Visually verify (clicking tabs swaps content)**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/Tabs.stories.tsx`**

---

### Task 17: `stories/Accordion.stories.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Accordion', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const accordionSpec: Spec = {
  root: 'acc',
  elements: {
    acc: {
      type: 'Accordion',
      props: {
        items: [
          { id: 'shipping', label: 'Shipping', children: ['ship-text'] },
          { id: 'returns', label: 'Returns', children: ['ret-text'] },
          { id: 'faq', label: 'FAQ', children: ['faq-text'] },
        ],
      },
      children: [],
    },
    'ship-text': {
      type: 'Text',
      props: { text: 'We ship Monday through Friday. Orders placed after 3pm ship the next day.' },
      children: [],
    },
    'ret-text': {
      type: 'Text',
      props: { text: 'Free returns within 30 days. Items must be unused with tags attached.' },
      children: [],
    },
    'faq-text': {
      type: 'Text',
      props: { text: 'Common questions and answers.' },
      children: [],
    },
  },
};

export const ThreeSections: Story = { args: { spec: accordionSpec } };
```

- [ ] **Step 2: Visually verify (clicking a section header expands/collapses)**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/Accordion.stories.tsx`**

---

### Task 18: `stories/Callout.stories.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Callout', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const calloutSpec = (
  tone: 'info' | 'success' | 'warning' | 'danger',
  text: string,
  title?: string,
): Spec => ({
  root: 'c',
  elements: { c: { type: 'Callout', props: { tone, title, text }, children: [] } },
});

export const Info: Story = {
  args: { spec: calloutSpec('info', 'Heads up — this is informational.', 'FYI') },
};
export const Success: Story = {
  args: { spec: calloutSpec('success', 'Deployed successfully.', 'Done') },
};
export const Warning: Story = {
  args: { spec: calloutSpec('warning', 'You are about to overwrite existing data.', 'Careful') },
};
export const Danger: Story = {
  args: { spec: calloutSpec('danger', 'This action cannot be undone.', 'Stop') },
};

export const InfoNoTitle: Story = {
  args: { spec: calloutSpec('info', 'A callout without a title.') },
};

export const AllTones: Story = {
  args: {
    spec: {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['i', 's', 'w', 'd'] },
        i: { type: 'Callout', props: { tone: 'info', title: 'Info', text: 'Informational.' }, children: [] },
        s: { type: 'Callout', props: { tone: 'success', title: 'Success', text: 'It worked.' }, children: [] },
        w: { type: 'Callout', props: { tone: 'warning', title: 'Warning', text: 'Heads up.' }, children: [] },
        d: { type: 'Callout', props: { tone: 'danger', title: 'Danger', text: 'Cannot undo.' }, children: [] },
      },
    },
  },
};
```

- [ ] **Step 2: Visually verify (each tone has its own icon and color treatment)**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/Callout.stories.tsx`**

---

### Task 19: `stories/Badge.stories.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Badge', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const badgeSpec = (label: string, tone?: 'default' | 'success' | 'warning' | 'danger'): Spec => ({
  root: 'b',
  elements: { b: { type: 'Badge', props: { label, tone }, children: [] } },
});

export const Default: Story = { args: { spec: badgeSpec('Default') } };
export const Success: Story = { args: { spec: badgeSpec('Done', 'success') } };
export const Warning: Story = { args: { spec: badgeSpec('Pending', 'warning') } };
export const Danger: Story = { args: { spec: badgeSpec('Failed', 'danger') } };

export const AllTones: Story = {
  args: {
    spec: {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['b1', 'b2', 'b3', 'b4'] },
        b1: { type: 'Badge', props: { label: 'Default', tone: 'default' }, children: [] },
        b2: { type: 'Badge', props: { label: 'Success', tone: 'success' }, children: [] },
        b3: { type: 'Badge', props: { label: 'Warning', tone: 'warning' }, children: [] },
        b4: { type: 'Badge', props: { label: 'Danger', tone: 'danger' }, children: [] },
      },
    },
  },
};
```

- [ ] **Step 2: Visually verify (4 distinct tone treatments)**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/Badge.stories.tsx`**

---

### Task 20: `stories/Divider.stories.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Divider', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

export const Solo: Story = {
  args: { spec: { root: 'd', elements: { d: { type: 'Divider', props: {}, children: [] } } } },
};

export const BetweenText: Story = {
  args: {
    spec: {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['t1', 'div', 't2'] },
        t1: { type: 'Text', props: { text: 'Section one.' }, children: [] },
        div: { type: 'Divider', props: {}, children: [] },
        t2: { type: 'Text', props: { text: 'Section two.' }, children: [] },
      },
    },
  },
};
```

- [ ] **Step 2: Visually verify (horizontal rule between the two text blocks)**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/Divider.stories.tsx`**

---

## Task 21: `stories/Compositions.stories.tsx`

Capture the multi-element layouts the model commonly emits.

**Files:**
- Create: `stories/Compositions.stories.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Compositions', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

// 1. Card stack — heading + text + badge row + divider + callout
const cardStack: Spec = {
  root: 'card',
  elements: {
    card: {
      type: 'Card',
      props: { title: 'Release 2.4.0' },
      children: ['heading', 'summary', 'badge', 'div', 'callout'],
    },
    heading: {
      type: 'Heading',
      props: { level: 3, text: 'Highlights' },
      children: [],
    },
    summary: {
      type: 'Text',
      props: { text: 'Three improvements landed in this release.' },
      children: [],
    },
    badge: { type: 'Badge', props: { label: 'Stable', tone: 'success' }, children: [] },
    div: { type: 'Divider', props: {}, children: [] },
    callout: {
      type: 'Callout',
      props: {
        tone: 'info',
        title: 'Heads up',
        text: 'Run pnpm install to pick up the new lockfile.',
      },
      children: [],
    },
  },
};

// 2. Full contact form — matches catalog prompt example
const fullForm: Spec = {
  root: 'contact-card',
  state: { contact: { email: '', topic: 'general', subscribe: false } },
  elements: {
    'contact-card': {
      type: 'Card',
      props: { title: 'Contact us' },
      children: ['contact-form'],
    },
    'contact-form': {
      type: 'Form',
      props: { name: 'contact' },
      children: ['email-input', 'topic-select', 'subscribe-check', 'submit-btn'],
    },
    'email-input': {
      type: 'Input',
      props: { name: 'email', label: 'Email', kind: 'email', placeholder: 'you@example.com' },
      children: [],
    },
    'topic-select': {
      type: 'Select',
      props: {
        name: 'topic',
        label: 'Topic',
        options: [
          { value: 'general', label: 'General' },
          { value: 'support', label: 'Support' },
          { value: 'billing', label: 'Billing' },
        ],
      },
      children: [],
    },
    'subscribe-check': {
      type: 'Checkbox',
      props: { name: 'subscribe', label: 'Subscribe to updates' },
      children: [],
    },
    'submit-btn': {
      type: 'Button',
      props: { label: 'Send', variant: 'primary' },
      on: {
        press: {
          action: 'submitForm',
          params: { formName: 'contact', label: 'Submitted contact form' },
        },
      },
      children: [],
    },
  },
};

// 3. Annotated list — flat Text + Badge rows (matches catalog prompt pattern)
const annotatedList: Spec = {
  root: 'status-card',
  elements: {
    'status-card': {
      type: 'Card',
      props: { title: 'Task status' },
      children: ['row-1', 'badge-1', 'row-2', 'badge-2', 'row-3', 'badge-3'],
    },
    'row-1': { type: 'Text', props: { text: 'Deploy pipeline' }, children: [] },
    'badge-1': { type: 'Badge', props: { label: 'Done', tone: 'success' }, children: [] },
    'row-2': { type: 'Text', props: { text: 'Integration tests' }, children: [] },
    'badge-2': { type: 'Badge', props: { label: 'Running', tone: 'warning' }, children: [] },
    'row-3': { type: 'Text', props: { text: 'Staging deploy' }, children: [] },
    'badge-3': { type: 'Badge', props: { label: 'Pending', tone: 'default' }, children: [] },
  },
};

// 4. Approval card — Approve / Reject model-mode pair
const approvalCard: Spec = {
  root: 'review-card',
  elements: {
    'review-card': {
      type: 'Card',
      props: { title: 'Review required' },
      children: ['summary-text', 'approve-btn', 'reject-btn'],
    },
    'summary-text': {
      type: 'Text',
      props: { text: 'The user submitted a change request awaiting approval.' },
      children: [],
    },
    'approve-btn': {
      type: 'Button',
      props: { label: 'Approve', variant: 'primary' },
      on: {
        press: {
          action: 'sendToModel',
          params: { label: 'Approve', message: 'User approved the request.' },
        },
      },
      children: [],
    },
    'reject-btn': {
      type: 'Button',
      props: { label: 'Reject', variant: 'destructive' },
      on: {
        press: {
          action: 'sendToModel',
          params: { label: 'Reject', message: 'User rejected the request.' },
        },
      },
      children: [],
    },
  },
};

export const CardStack: Story = { args: { spec: cardStack } };
export const FullContactForm: Story = { args: { spec: fullForm } };
export const AnnotatedList: Story = { args: { spec: annotatedList } };
export const ApprovalCard: Story = { args: { spec: approvalCard } };
```

- [ ] **Step 2: Visually verify each composition (Compositions section in sidebar)**
- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/Compositions.stories.tsx`**

---

## Task 22: `stories/StateBinding.stories.tsx`

Demonstrate the controlled-store paths: Tabs.`valueStatePath` driving a sibling Text via `{ $state }`, the `applyLockToSpec` visual, and the local-only `setState` toggle pattern.

**Files:**
- Create: `stories/StateBinding.stories.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs';
import type { Spec } from '@json-render/core';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'StateBinding', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

// Tabs.valueStatePath drives a sibling Text — clicking a tab updates the text
const tabsDriveText: Spec = {
  root: 'card',
  state: { mode: 'daily' },
  elements: {
    card: {
      type: 'Card',
      props: { title: 'Tabs control sibling text' },
      children: ['tabs', 'echo'],
    },
    tabs: {
      type: 'Tabs',
      props: {
        valueStatePath: '/mode',
        tabs: [
          { id: 'daily', label: 'Today', children: [] },
          { id: 'weekly', label: '7-Day', children: [] },
        ],
      },
      children: [],
    },
    echo: { type: 'Text', props: { text: { $state: '/mode' } }, children: [] },
  },
};

// setState toggle — single button flips /open via $cond
const setStateToggle: Spec = {
  root: 'card',
  state: { open: false },
  elements: {
    card: {
      type: 'Card',
      props: { title: 'setState toggle' },
      children: ['toggle-btn', 'detail-text'],
    },
    'toggle-btn': {
      type: 'Button',
      props: { label: 'Toggle details' },
      on: {
        press: {
          action: 'setState',
          params: {
            statePath: '/open',
            value: { $cond: { $state: '/open' }, $then: false, $else: true },
          },
        },
      },
      children: [],
    },
    'detail-text': {
      type: 'Text',
      props: { text: 'Here are the details, revealed by the toggle.' },
      visible: { $state: '/open' },
      children: [],
    },
  },
};

// Locked card — submit button + form, rendered with applyLockToSpec
const lockedFormSpec: Spec = {
  root: 'card',
  state: { signup: { email: 'jane@example.com' } },
  elements: {
    card: {
      type: 'Card',
      props: { title: 'Locked state — post-submit' },
      children: ['form'],
    },
    form: { type: 'Form', props: { name: 'signup' }, children: ['email-input', 'submit-btn'] },
    'email-input': {
      type: 'Input',
      props: { name: 'email', label: 'Email', kind: 'email' },
      children: [],
    },
    'submit-btn': {
      type: 'Button',
      props: { label: 'Submit', variant: 'primary' },
      on: { press: { action: 'submitForm', params: { formName: 'signup' } } },
      children: [],
    },
  },
};

// Weather card — endpoint-mode fetchWeather + tabs + reactive text
// (Default handler returns canned summary text so the visual flow works.)
const weatherCard: Spec = {
  root: 'weather-card',
  state: { mode: 'daily', loading: false, weather: { summary: 'Press refresh to load.' } },
  elements: {
    'weather-card': {
      type: 'Card',
      props: { title: 'Weather' },
      children: ['mode-tabs', 'refresh-btn', 'loading-text', 'weather-text'],
    },
    'mode-tabs': {
      type: 'Tabs',
      props: {
        valueStatePath: '/mode',
        tabs: [
          { id: 'daily', label: 'Today', children: [] },
          { id: 'weekly', label: '7-Day', children: [] },
        ],
      },
      children: [],
    },
    'refresh-btn': {
      type: 'Button',
      props: { label: 'Refresh', variant: 'secondary' },
      on: {
        press: {
          action: 'fetchWeather',
          params: {
            mode: { $state: '/mode' },
            _writeResponseTo: '/weather',
            _setPendingAt: '/loading',
          },
        },
      },
      children: [],
    },
    'loading-text': {
      type: 'Text',
      props: { text: 'Loading…', muted: true },
      visible: { $state: '/loading' },
      children: [],
    },
    'weather-text': {
      type: 'Text',
      props: { text: { $state: '/weather/summary' } },
      children: [],
    },
  },
};

export const TabsDriveText: Story = { args: { spec: tabsDriveText } };
export const SetStateToggle: Story = { args: { spec: setStateToggle } };
export const LockedForm: Story = { args: { spec: lockedFormSpec, locked: true } };
export const UnlockedForSidebySide: Story = { args: { spec: lockedFormSpec, locked: false } };
export const WeatherEndpoint: Story = { args: { spec: weatherCard } };
```

- [ ] **Step 2: Visually verify**

In Storybook UI, navigate to **StateBinding**:

- **TabsDriveText** — clicking "7-Day" updates the text from "daily" to "weekly".
- **SetStateToggle** — pressing the button shows/hides the detail text on alternating presses.
- **LockedForm** — input is greyed out, Submit button is greyed out (compare with UnlockedForSidebySide).
- **UnlockedForSidebySide** — same spec, no lock — should be interactive.
- **WeatherEndpoint** — clicking Refresh causes the bottom text to update (canned response from the default `fetchWeather` handler in `_render-spec-story.tsx`). Switching the tab and refreshing changes the response based on `mode`.

- [ ] **Step 3: `pnpm exec tsc --noEmit && pnpm exec biome check stories/StateBinding.stories.tsx`**

---

## Task 23: Final verification

**Files:** none modified — verification only.

- [ ] **Step 1: Type-check the whole repo**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Lint the whole repo**

Run:
```bash
pnpm exec biome check .
```

Expected: zero errors. If biome flags `stories/_render-spec-story.tsx` or any story file, fix it inline (most likely: single-quote, trailing-comma, or import-order issues).

- [ ] **Step 3: Run the existing vitest suite — make sure nothing broke**

Run:
```bash
pnpm test
```

Expected: 297 tests passing across 14 files (the existing suite — Storybook does not add tests).

- [ ] **Step 4: Boot Storybook and walk every story**

Run:
```bash
pnpm storybook
```

Open `http://localhost:6006/`. Click through:

- **Primitives** — Button, Card, Heading, Text, Image, Link, List, Input, Select, Checkbox, Form, Tabs, Accordion, Callout, Badge, Divider (16 sections)
- **Compositions** — CardStack, FullContactForm, AnnotatedList, ApprovalCard
- **StateBinding** — TabsDriveText, SetStateToggle, LockedForm, UnlockedForSidebySide, WeatherEndpoint

For each: confirm the story renders without console errors, the visual matches expectations, and the light/dark toggle works.

`Ctrl+C` to stop.

- [ ] **Step 5: Verify storybook builds for production**

Run:
```bash
pnpm build-storybook
```

Expected: build completes with no errors. Output goes to `storybook-static/`.

- [ ] **Step 6: Final `git status`**

Run:
```bash
git status
```

Expected modifications/additions:
- `package.json` (storybook scripts + devDeps)
- `pnpm-lock.yaml` (new deps)
- `.gitignore` (storybook-static)
- `.storybook/main.ts`, `.storybook/preview.tsx` (new)
- `stories/_render-spec-story.tsx` (new)
- `stories/*.stories.tsx` (19 story files: 16 primitives + 2 cross-cutting + nothing else from this plan)

Leave everything **unstaged** for the user to review.

---

## Self-Review Notes

- **Spec coverage:** every primitive in `lib/json-render/catalog.ts` has a dedicated story file (16). The four user-requested patterns (isolated demos, compositions, state-driven, annotated list) all have at least one story.
- **Placeholder scan:** every code block contains complete, runnable code. No "TBD" / "TODO" / "similar to" references.
- **Type consistency:** `SpecStory` props (`spec`, `locked`, `handlers`) are used identically across all story files. The catalog prop union types (`'primary' | 'secondary' | 'ghost' | 'destructive'` etc.) match the catalog definition exactly.
- **Risk areas to watch during execution:**
  - Storybook 9 + React 19 + Next 16 peer-dep alignment. Task 1 includes two fallbacks (`@next` tag, then manual install + `@storybook/nextjs-vite` framework swap).
  - `@/` path alias resolution differs between SB's bundler and tsconfig — Task 2's `webpackFinal` / `viteFinal` block re-declares it.
  - `JSONUIProvider` `handlers` prop type may be stricter than `Record<string, (params: unknown) => Promise<unknown>>` — Task 4 step 2 says to fix the helper type from the real `.d.ts` if so.

---

## Execution Handoff

**Plan complete and saved to `plans/storybook.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Especially good fit here because Tasks 6–20 (the 15 primitive story files) are independent and can be parallelized 3–5 at a time.
2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

**Which approach?**
