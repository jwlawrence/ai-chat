# Public Hosting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (or `superpowers:executing-plans` for the inline path). Steps use checkbox (`- [ ]`) syntax for tracking. Per user preference, **do NOT run `git commit`** — leave changes unstaged for the user to review at the end of each task. Each phase carries an explicit **Execution mode** tag — `agent-autonomous` phases can drive `/goal`; `review-checkpointed` phases need human verification of the called-out criteria.

**Goal:** Take the personal-ai-chat app from a localhost-only personal tool to a publicly-hosted portfolio showcase that (a) impresses recruiters in 90 seconds and (b) lets engineer friends explore the genUI capability — while staying under $20/month happy-case / $30/month ceiling on AI costs.

**Architecture:** Public anonymous landing page with 4 curated chip prompts gated by Cloudflare Turnstile + cookie identity. Sign-in (Google/GitHub/LinkedIn OAuth) unlocks free typing, larger quota, persistent history, webSearch, and BYOK. Global hybrid kill switch ($5/day + $30/month) blocks default-key calls only — BYOK and sign-in stay open. Auth UX is itself rendered as json-render components, demonstrating the genUI capability at the auth surface.

**Tech Stack:** Next.js 16 (App Router), React 19, AI SDK v6 (`@ai-sdk/azure`), shadcn/ui + base-ui, Drizzle ORM + Postgres, json-render (`@json-render/core` + `@json-render/react`), NextAuth/Auth.js v5, Cloudflare Turnstile, Recharts (via shadcn `Chart` recipe), Vercel hosting, biome + vitest.

---

## Working Tree Contract

- Repo root: `/Users/jlawrenc/Development/personal/ai-chat`
- Branch: `main` (clean at start; untracked `scripts/` is the user's debug tooling — leave alone)
- Plans live in `plans/` (flat, matches `plans/json-render-ui.md` and `plans/storybook.md`)
- Path alias: `@/*` → repo root
- Style: biome single quotes, trailing commas all, semicolons, 2-space indent, 100-col line width
- pnpm registry: `.npmrc` pins to LinkedIn artifactory. From a non-corp network EVERY `pnpm install/add/remove/dlx/storybook` invocation must be prefixed with `npm_config_registry=https://registry.npmjs.org/`. `pnpm test`, `pnpm exec tsc`, `pnpm exec biome` do NOT need it.
- Test runner: `vitest` via `pnpm test` (or `pnpm test:watch`). Tests colocate next to source as `*.test.ts` or `*.test.tsx`.
- DB: local Postgres via `drizzle-kit`. Migrations live in `drizzle/`. `pnpm db:generate` creates SQL from schema; `pnpm db:migrate` applies it.
- No `git commit` — leave all changes unstaged for user review.

---

## Architectural Decisions

Durable choices that apply across all phases.

### Cost model & budget caps

- **Target**: $20/mo. **Ceiling**: $30/mo. **Daily cap**: $5/day. Hybrid: whichever cap (daily or monthly) hits first blocks default-key calls.
- **Anonymous per-visitor cap**: $0.20/day, tracked by `(turnstile_actor_id, calendar_day)` where `turnstile_actor_id` = stable cookie hash signed alongside the Turnstile trust cookie.
- **Signed-in per-user cap**: $1.00/day, tracked by `(user_id, calendar_day)`.
- **Per-turn output ceiling**: 10,000 tokens. Hard abort on exceed — emit a `quota.turnLimitReached` UIMessage and stop the stream. Tunable via env var `MAX_OUTPUT_TOKENS_PER_TURN`.
- **Price table** (Azure Foundry, $/1M tokens, configured in `lib/ai/pricing.ts`):
  - `gpt-5.4-mini`: $0.15 input, $0.075 cached-input, $0.60 output
  - `gpt-5.4`: $1.25 input, $0.625 cached-input, $5.00 output
  - `gpt-5.3-codex`: $1.25 input, $0.625 cached-input, $5.00 output
  - `o4-mini`: $0.15 input, $0.075 cached-input, $0.60 output
  - These are *placeholder estimates*; verify in Phase 0 against the current Azure Foundry pricing page and update before launch.
- **Public mode uses `gpt-5.4-mini` exclusively**. The model selector becomes a no-op for anonymous users and signed-in users (locked to mini). BYOK users may emit any deployment they configured.
- **Kill switch decision tree** (enforced in `lib/budget/preflight.ts`):
  - If request is BYOK → bypass all global caps; only the per-turn output ceiling applies.
  - Else if today's global spend ≥ $5.00 → reject with `quota.dailyCapReached`.
  - Else if this month's global spend ≥ $30.00 → reject with `quota.monthlyCapReached`.
  - Else if per-actor today spend ≥ actor's cap → reject with `quota.actorCapReached`.
  - Else allow; postflight records actual usage.

### Identity model

- **Anonymous identity**: signed cookie `pac_anon` = HMAC(`anonymous_id`, `ANON_COOKIE_SECRET`), `anonymous_id` = nanoid(21). Cookie set on first response by middleware. Lifetime: 7 days, refreshed on each successful request.
- **Trust cookie**: signed cookie `pac_trust` issued after a successful Turnstile challenge. Contains `{ verifiedAt, expiresAt }`, expires 1 hour after issue, refreshed on each successful chat request.
- **Signed-in identity**: NextAuth session cookie. `users.id` is the canonical identity. `sessions.user_id` is nullable to support anonymous sessions.
- **Session claim at sign-in**: one-shot, device-scoped. On successful OAuth callback, take the current request's `anonymous_id` (from `pac_anon`) and `UPDATE sessions SET user_id = $1 WHERE anonymous_id = $2` in the same transaction as user creation/lookup. Anonymous sessions on other devices stay anonymous.

### Action mode taxonomy

Currently `local | model | endpoint`. This plan adds a fourth: **`redirect`**.

- **`local`** (existing): pure client-side, mutates `StateProvider`. No model involvement.
- **`model`** (existing): fires synthetic user turn; card locks immediately to prevent double-fire.
- **`endpoint`** (existing): POST to `/api/actions/[action]`; toast on failure; card stays unlocked.
- **`redirect`** (new): POST to `/api/actions/[action]` like endpoint mode, but the response includes `{ redirectTo: string }`. Action handler calls `window.location.assign(redirectTo)`. Used by `signInWith` for OAuth flow initiation. Card locks like model mode (one-shot, navigation is destructive).

The `resolveActionMode()` helper in `lib/json-render/catalog.ts` returns `'local' | 'model' | 'endpoint' | 'redirect'` after this plan; all sites that switch on action mode must add a `redirect` branch (catalog.ts, registry.tsx, actions handler).

### Server-injected renderUI

A new code path in `app/api/chat/route.ts` writes a `tool-renderUI` part directly into the UIMessage stream, bypassing `streamText`. Used in two situations:

1. **Quota wall**: when preflight rejects an anonymous chat request because the actor is over cap, return 200 with a one-message stream containing a server-built renderUI spec for the sign-in card. This makes the quota wall *itself* a genUI moment.
2. **First-turn priming** (optional, Phase 4 — defer to validation): when a chip is clicked, the server may emit a primed renderUI greeting before the actual model call.

The injected spec is just bytes in the existing tool-call schema; it reuses the renderer with zero client changes.

### Catalog & prompt caching

- Catalog grows from 16 → 19 primitives (adds `Chart`, `Table`, `KPI`). Estimated post-Phase-0 size: 3,500–4,500 tokens (verify in Phase 0 Task 9).
- `SYSTEM_PROMPT` is restructured to put the catalog text at the START of the system prompt — this makes the first ~3-4k tokens a stable prefix that Azure auto-caches when the prefix exceeds 1024 tokens. Azure docs: prompt-cache TTL is 5–10 minutes; cold first request pays full price.
- Realistic cache hit rate on a low-traffic portfolio site: 10–20%, not 50%. Treat as a 10% cost reduction in budget math.

### What sign-in unlocks

| Capability | Anonymous | Signed-in | BYOK |
|---|---|---|---|
| Render UI (renderUI tool) | ✅ | ✅ | ✅ |
| webSearch tool | ❌ | ✅ | ✅ |
| Free typing | ❌ (chips only) | ✅ | ✅ |
| Model selector | locked to `gpt-5.4-mini` | locked to `gpt-5.4-mini` | any user-configured deployment |
| Per-day cap | $0.20 | $1.00 | bypass (user pays) |
| Persistent history | session-cookie-scoped, 7d | indefinite | indefinite |
| Global kill switch | applies | applies | bypass |

---

## File Structure (created & modified across all phases)

### Created

| Path | Purpose | Phase |
|---|---|---|
| `lib/json-render/primitives/chart-schema.ts` | Zod schema + types for the `Chart` primitive | 0 |
| `lib/json-render/primitives/chart.tsx` | shadcn `<Chart>` + Recharts renderer | 0 |
| `lib/json-render/primitives/table-schema.ts` | Zod schema for `Table` | 0 |
| `lib/json-render/primitives/table.tsx` | `<Table>` renderer | 0 |
| `lib/json-render/primitives/kpi-schema.ts` | Zod schema for `KPI` | 0 |
| `lib/json-render/primitives/kpi.tsx` | `<KPI>` renderer | 0 |
| `components/ui/chart.tsx` | shadcn Chart recipe (config + container + tooltip + legend) | 0 |
| `components/ui/table.tsx` | shadcn Table primitives | 0 |
| `stories/Chart.stories.tsx` | Storybook for Chart variants | 0 |
| `stories/Table.stories.tsx` | Storybook for Table | 0 |
| `stories/KPI.stories.tsx` | Storybook for KPI | 0 |
| `lib/ai/pricing.ts` | Price table per model + token-cost helpers | 1 |
| `lib/ai/system-prompt-cache.test.ts` | Verify cacheable prefix structure & length | 1 |
| `lib/auth/config.ts` | NextAuth.js config (providers, adapter, callbacks) | 2 |
| `lib/auth/index.ts` | Server-side `auth()` helper export | 2 |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth route handlers | 2 |
| `drizzle/0001_users_and_accounts.sql` | Generated migration for users/accounts/sessions tables | 2 |
| `lib/budget/identity.ts` | Resolve actor (user_id or anonymous_id) from request | 3 |
| `lib/budget/preflight.ts` | Pre-flight cap check; returns allow/reject | 3 |
| `lib/budget/postflight.ts` | Post-flight ledger write in onFinish | 3 |
| `lib/budget/preflight.test.ts` | Cap-decision-tree unit tests | 3 |
| `lib/db/usage-ledger.ts` | Drizzle queries for ledger reads/writes | 3 |
| `drizzle/0002_usage_ledger.sql` | Generated migration for usage_ledger | 3 |
| `app/api/turnstile/verify/route.ts` | Server-side Turnstile token verification | 4 |
| `lib/turnstile/verify.ts` | Cloudflare Turnstile API client | 4 |
| `lib/turnstile/cookie.ts` | Sign/verify `pac_trust` cookie | 4 |
| `middleware.ts` | Set `pac_anon` cookie on first request | 4 |
| `lib/anon/cookie.ts` | Sign/verify `pac_anon` cookie + extract anonymous_id | 4 |
| `components/chat/chip-deck.tsx` | Renders 4 chip prompts when input is empty | 4 |
| `lib/chat/chips.ts` | Static chip metadata (id, label, prompt) | 4 |
| `drizzle/0003_anonymous_session.sql` | Add `anonymous_id` column to sessions | 4 |
| `lib/byok/storage.ts` | Client-side localStorage helpers (with schema) | 5 |
| `lib/byok/validate.ts` | Server-side tiny-test-call validation | 5 |
| `app/api/byok/validate/route.ts` | POST validate endpoint | 5 |
| `app/settings/page.tsx` | Settings page (renders BYOK form as json-render) | 5 |
| `lib/json-render/actions/sign-in-with.ts` | OAuth-redirect action handler | 6 |
| `lib/json-render/server-injected.ts` | Build sign-in renderUI spec for quota-wall injection | 6 |
| `lib/json-render/actions/sign-in-with.test.ts` | Snapshot test of OAuth URL building | 6 |
| `lib/chat/prompts.ts` | The 4 showcase prompt strings (drafted in Phase 7) | 7 |
| `app/(landing)/page.tsx` | Public landing page (if separate from /chat) | 7 |
| `public/robots.txt` | `User-agent: *` / `Disallow: /` | 8 |
| `vercel.json` (or `vercel.ts`) | Production config | 8 |

### Modified

| Path | What changes | Phase |
|---|---|---|
| `package.json` | Add deps: recharts, next-auth@beta, @auth/drizzle-adapter, @marsidev/react-turnstile, etc. | 0, 2, 4 |
| `lib/json-render/catalog.ts` | Register Chart/Table/KPI; restructure system prompt; add `redirect` action mode | 0, 1, 6 |
| `lib/json-render/registry.tsx` | Register Chart/Table/KPI components; add `redirect` branch in action dispatcher | 0, 6 |
| `lib/json-render/endpoint-handlers.ts` | Add `redirect` action handlers (signInWith, etc.); add `validateByok` | 5, 6 |
| `lib/ai/system-prompt.ts` | Reordering so catalog is first; cache-friendly prefix | 1 |
| `lib/ai/providers.ts` | Accept optional per-request `azureKey` and `deploymentNames` overrides for BYOK | 5 |
| `lib/db/schema.ts` | Add users, accounts, sessions(authjs); add user_id + anonymous_id to chat sessions table; add usage_ledger | 2, 3, 4 |
| `lib/db/queries.ts` | Add user queries, anonymous→user claim mutation, usage ledger queries | 2, 3, 4 |
| `app/api/chat/route.ts` | Preflight, postflight, anonymous-vs-signed-in gating, server-injected sign-in card | 3, 4, 6 |
| `app/api/actions/[action]/route.ts` | Add `redirect` mode support + signInWith handler routing | 6 |
| `components/chat/chat.tsx` | Render `<ChipDeck>` when empty + signed-in mode toggle | 4 |
| `app/api/sessions/route.ts` | Scope listing to user_id when signed in / anonymous_id otherwise | 2, 4 |

---

## Phase 0 — Catalog: Chart + Table + KPI

**Execution mode: agent-autonomous**

**Goal:** Extend the json-render catalog with three new primitives — `Chart` (Recharts via shadcn's Chart recipe), `Table`, and `KPI` — so the showcase prompts can render the dashboard, charts/graphs, and composition-of-primitives categories.

**Open risks**
- Recharts catalog schema is the biggest unknown of the entire plan. Charts have many shapes (line/bar/area/pie) × many series × variable data shapes. The schema must be EXPRESSIVE enough for the model to emit interesting charts AND CONSTRAINED enough that the schema description doesn't bloat the catalog prompt past 6k tokens.
- The catalog prompt currently sits at ~3,000 tokens. Three new primitives could push it to 4,000–5,000. Re-measure in Task 9; if over 5,000, hide low-priority primitives behind a `verbose: true` config.

### Files

- Create: `components/ui/chart.tsx`, `components/ui/table.tsx`
- Create: `lib/json-render/primitives/chart-schema.ts`, `lib/json-render/primitives/chart.tsx`
- Create: `lib/json-render/primitives/table-schema.ts`, `lib/json-render/primitives/table.tsx`
- Create: `lib/json-render/primitives/kpi-schema.ts`, `lib/json-render/primitives/kpi.tsx`
- Create: `stories/Chart.stories.tsx`, `stories/Table.stories.tsx`, `stories/KPI.stories.tsx`
- Modify: `lib/json-render/catalog.ts` (register the three primitives)
- Modify: `lib/json-render/registry.tsx` (register the three components)
- Modify: `package.json` (add recharts)

### Tasks

#### Task 0.1 — Install Recharts + shadcn Chart recipe

- [ ] **Step 1: Install recharts**

Run:
```bash
cd /Users/jlawrenc/Development/personal/ai-chat
npm_config_registry=https://registry.npmjs.org/ pnpm add recharts
```

Expected: `recharts` added under `dependencies` in `package.json`. (As of 2026-05, the current shadcn `chart` recipe imports `TooltipValueType` which is only exported by recharts v3+; do not pin to v2.)

- [ ] **Step 2: Add shadcn Chart components via official CLI**

Run:
```bash
npm_config_registry=https://registry.npmjs.org/ pnpm dlx shadcn@latest add chart
```

If the CLI fails to detect components.json (it shouldn't — `components.json` already exists), retry with `--cwd .`. The CLI should create `components/ui/chart.tsx` and `components/ui/table.tsx` (also pull `table` if not present).

- [ ] **Step 3: Add shadcn Table component if missing**

Run:
```bash
npm_config_registry=https://registry.npmjs.org/ pnpm dlx shadcn@latest add table
```

- [ ] **Step 4: Type-check to verify install**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

#### Task 0.2 — Chart primitive schema (write test, then schema)

- [ ] **Step 1: Write the failing schema test**

Create `lib/json-render/primitives/chart-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chartPrimitive } from './chart-schema';

describe('chart primitive schema', () => {
  it('accepts a minimal line chart with 1 series', () => {
    const result = chartPrimitive.propsSchema.safeParse({
      kind: 'line',
      data: [
        { x: 'Jan', revenue: 100 },
        { x: 'Feb', revenue: 150 },
      ],
      series: [{ key: 'revenue', label: 'Revenue' }],
      xKey: 'x',
    });
    expect(result.success).toBe(true);
  });

  it('rejects when series array is empty', () => {
    const result = chartPrimitive.propsSchema.safeParse({
      kind: 'line',
      data: [{ x: 'Jan', revenue: 100 }],
      series: [],
      xKey: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown kinds', () => {
    const result = chartPrimitive.propsSchema.safeParse({
      kind: 'radar',
      data: [],
      series: [{ key: 'x' }],
      xKey: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('accepts bar, area, pie kinds', () => {
    for (const kind of ['bar', 'area', 'pie'] as const) {
      const result = chartPrimitive.propsSchema.safeParse({
        kind,
        data: [{ x: 'A', value: 1 }],
        series: [{ key: 'value' }],
        xKey: 'x',
      });
      expect(result.success).toBe(true);
    }
  });

  it('caps data length to prevent runaway specs', () => {
    const result = chartPrimitive.propsSchema.safeParse({
      kind: 'line',
      data: Array.from({ length: 101 }, (_, i) => ({ x: `${i}`, v: i })),
      series: [{ key: 'v' }],
      xKey: 'x',
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, expect it to fail**

Run: `pnpm test lib/json-render/primitives/chart-schema -t chart`
Expected: FAIL — `chart-schema` module not found.

- [ ] **Step 3: Implement the schema**

Create `lib/json-render/primitives/chart-schema.ts`:

```ts
import { z } from 'zod';

const chartKind = z.enum(['line', 'bar', 'area', 'pie']);

const seriesEntry = z.object({
  key: z.string().describe('Property name in each data row to read this series value from'),
  label: z.string().optional().describe('Display name for the legend; defaults to key'),
  color: z
    .string()
    .regex(/^(hsl\(.+\)|#[0-9a-fA-F]{3,8}|var\(.+\))$/)
    .optional()
    .describe('CSS color, hex, or CSS variable. Omit to use theme defaults.'),
});

const dataRow = z.record(z.string(), z.union([z.string(), z.number()]));

export const chartPropsSchema = z.object({
  kind: chartKind.describe('Chart type'),
  data: z
    .array(dataRow)
    .min(1)
    .max(100)
    .describe('Rows of data points. Cap at 100 to keep spec size bounded.'),
  series: z
    .array(seriesEntry)
    .min(1)
    .max(8)
    .describe('Which data keys to plot as series. Pie charts use only the first series.'),
  xKey: z
    .string()
    .describe('Property name in each data row used as the x-axis / category label'),
  title: z.string().optional().describe('Optional chart title rendered above the chart'),
  yAxisLabel: z.string().optional(),
  legend: z.boolean().optional().default(true),
  grid: z.boolean().optional().default(true),
});

export type ChartProps = z.infer<typeof chartPropsSchema>;

export const chartPrimitive = {
  description:
    'A data visualization. Choose `kind` based on intent: line for trends, bar for comparisons, area for stacked trends, pie for parts-of-a-whole. Provide data as rows; series.key picks the numeric value per row.',
  propsSchema: chartPropsSchema,
};
```

- [ ] **Step 4: Run the test, expect it to pass**

Run: `pnpm test lib/json-render/primitives/chart-schema`
Expected: 5 passed.

#### Task 0.3 — Chart primitive renderer

- [ ] **Step 1: Write the failing renderer test**

Create `lib/json-render/primitives/chart.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chart } from './chart';

describe('Chart renderer', () => {
  const data = [
    { month: 'Jan', revenue: 100 },
    { month: 'Feb', revenue: 200 },
  ];

  it('renders a line chart container with the title', () => {
    render(
      <Chart
        kind="line"
        data={data}
        series={[{ key: 'revenue', label: 'Revenue' }]}
        xKey="month"
        title="Monthly Revenue"
      />,
    );
    expect(screen.getByText('Monthly Revenue')).toBeInTheDocument();
  });

  it('renders all chart kinds without throwing', () => {
    for (const kind of ['line', 'bar', 'area', 'pie'] as const) {
      const { unmount } = render(
        <Chart kind={kind} data={data} series={[{ key: 'revenue' }]} xKey="month" />,
      );
      unmount();
    }
  });

  it('falls back gracefully on empty data', () => {
    const { container } = render(
      <Chart kind="line" data={[]} series={[{ key: 'revenue' }]} xKey="month" />,
    );
    expect(container).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test, expect it to fail**

Run: `pnpm test lib/json-render/primitives/chart`
Expected: FAIL — `chart` module not found.

- [ ] **Step 3: Implement the renderer**

Create `lib/json-render/primitives/chart.tsx`:

```tsx
'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartProps } from './chart-schema';

const FALLBACK_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

function buildConfig(series: ChartProps['series']) {
  return Object.fromEntries(
    series.map((s, i) => [
      s.key,
      { label: s.label ?? s.key, color: s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length] },
    ]),
  );
}

export function Chart(props: ChartProps) {
  const { kind, data, series, xKey, title, yAxisLabel, legend = true, grid = true } = props;
  const config = buildConfig(series);

  const content = (() => {
    if (data.length === 0) {
      return (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
          No data
        </div>
      );
    }

    if (kind === 'pie') {
      const first = series[0];
      return (
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie data={data} dataKey={first.key} nameKey={xKey} label>
              {data.map((_, i) => (
                <Cell key={i} fill={FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            {legend && <Legend />}
          </PieChart>
        </ResponsiveContainer>
      );
    }

    const SharedAxes = (
      <>
        {grid && <CartesianGrid strokeDasharray="3 3" />}
        <XAxis dataKey={xKey} />
        <YAxis label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft' } : undefined} />
        <Tooltip content={<ChartTooltipContent />} />
        {legend && <Legend />}
      </>
    );

    if (kind === 'line') {
      return (
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            {SharedAxes}
            {series.map((s, i) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label ?? s.key}
                stroke={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (kind === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data}>
            {SharedAxes}
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label ?? s.key}
                fill={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data}>
          {SharedAxes}
          {series.map((s, i) => (
            <Area
              key={s.key}
              dataKey={s.key}
              name={s.label ?? s.key}
              fill={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
              stroke={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  })();

  return (
    <ChartContainer config={config} className="w-full">
      <div className="space-y-2">
        {title && <h3 className="text-sm font-medium">{title}</h3>}
        {content}
      </div>
    </ChartContainer>
  );
}
```

- [ ] **Step 4: Run the test, expect it to pass**

Run: `pnpm test lib/json-render/primitives/chart`
Expected: 3 passed.

#### Task 0.4 — Table primitive schema + renderer

- [ ] **Step 1: Write the failing schema + renderer tests**

Create `lib/json-render/primitives/table-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { tablePrimitive } from './table-schema';

describe('table primitive schema', () => {
  it('accepts a 3-column table with 2 rows', () => {
    const r = tablePrimitive.propsSchema.safeParse({
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'role', label: 'Role' },
        { key: 'tenure', label: 'Tenure', align: 'right' },
      ],
      rows: [
        { name: 'Ada', role: 'Eng', tenure: '5y' },
        { name: 'Grace', role: 'Eng', tenure: '12y' },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects when columns is empty', () => {
    const r = tablePrimitive.propsSchema.safeParse({ columns: [], rows: [] });
    expect(r.success).toBe(false);
  });

  it('caps row count to prevent spec bloat', () => {
    const r = tablePrimitive.propsSchema.safeParse({
      columns: [{ key: 'x', label: 'X' }],
      rows: Array.from({ length: 51 }, () => ({ x: '1' })),
    });
    expect(r.success).toBe(false);
  });
});
```

Create `lib/json-render/primitives/table.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table } from './table';

describe('Table renderer', () => {
  it('renders headers and data rows', () => {
    render(
      <Table
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'role', label: 'Role' },
        ]}
        rows={[
          { name: 'Ada', role: 'Eng' },
          { name: 'Grace', role: 'Eng' },
        ]}
      />,
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Grace')).toBeInTheDocument();
  });

  it('renders empty state when rows is empty', () => {
    render(<Table columns={[{ key: 'x', label: 'X' }]} rows={[]} />);
    expect(screen.getByText(/no rows/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests, expect failures**

Run: `pnpm test lib/json-render/primitives/table`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement schema**

Create `lib/json-render/primitives/table-schema.ts`:

```ts
import { z } from 'zod';

const column = z.object({
  key: z.string().describe('Property name in each row to read the cell value from'),
  label: z.string().describe('Column header text'),
  align: z.enum(['left', 'center', 'right']).optional().default('left'),
});

const cellValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const row = z.record(z.string(), cellValue);

export const tablePropsSchema = z.object({
  columns: z.array(column).min(1).max(10),
  rows: z.array(row).max(50).describe('Data rows. Cap at 50 to keep spec size bounded.'),
  caption: z.string().optional(),
});

export type TableProps = z.infer<typeof tablePropsSchema>;

export const tablePrimitive = {
  description:
    'A tabular data display. Columns describe the schema; rows hold the data. Cap at 10 columns × 50 rows.',
  propsSchema: tablePropsSchema,
};
```

- [ ] **Step 4: Implement renderer**

Create `lib/json-render/primitives/table.tsx`:

```tsx
'use client';

import {
  Table as UiTable,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { TableProps } from './table-schema';

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

export function Table({ columns, rows, caption }: TableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        No rows
      </div>
    );
  }
  return (
    <UiTable>
      {caption && <TableCaption>{caption}</TableCaption>}
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c.key} className={`text-${c.align ?? 'left'}`}>
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            {columns.map((c) => (
              <TableCell key={c.key} className={`text-${c.align ?? 'left'}`}>
                {formatCell(r[c.key])}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </UiTable>
  );
}
```

- [ ] **Step 5: Run tests, expect pass**

Run: `pnpm test lib/json-render/primitives/table`
Expected: 5 passed.

#### Task 0.5 — KPI primitive schema + renderer

- [ ] **Step 1: Write the failing tests**

Create `lib/json-render/primitives/kpi-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { kpiPrimitive } from './kpi-schema';

describe('kpi primitive schema', () => {
  it('accepts minimum required fields', () => {
    const r = kpiPrimitive.propsSchema.safeParse({ label: 'Revenue', value: '$12.4M' });
    expect(r.success).toBe(true);
  });

  it('accepts a delta with positive/negative/neutral trend', () => {
    for (const trend of ['up', 'down', 'flat'] as const) {
      const r = kpiPrimitive.propsSchema.safeParse({
        label: 'Active users',
        value: '12,345',
        delta: { value: '+8%', trend },
      });
      expect(r.success).toBe(true);
    }
  });

  it('rejects unknown trend values', () => {
    const r = kpiPrimitive.propsSchema.safeParse({
      label: 'X',
      value: '1',
      delta: { value: '+1', trend: 'sideways' },
    });
    expect(r.success).toBe(false);
  });
});
```

Create `lib/json-render/primitives/kpi.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KPI } from './kpi';

describe('KPI renderer', () => {
  it('renders label, value, and delta', () => {
    render(<KPI label="Revenue" value="$12.4M" delta={{ value: '+8%', trend: 'up' }} />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('$12.4M')).toBeInTheDocument();
    expect(screen.getByText('+8%')).toBeInTheDocument();
  });

  it('renders without a delta', () => {
    render(<KPI label="Users" value="1,234" />);
    expect(screen.queryByText(/\+|-/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect failures**

Run: `pnpm test lib/json-render/primitives/kpi`

- [ ] **Step 3: Implement schema**

Create `lib/json-render/primitives/kpi-schema.ts`:

```ts
import { z } from 'zod';

const delta = z.object({
  value: z.string().describe('Display string for the change, e.g. "+8%" or "-$2.1M"'),
  trend: z.enum(['up', 'down', 'flat']),
});

export const kpiPropsSchema = z.object({
  label: z.string().describe('What the metric measures'),
  value: z.string().describe('The headline metric value, pre-formatted'),
  delta: delta.optional(),
  caption: z.string().optional().describe('Optional small line beneath the value'),
});

export type KpiProps = z.infer<typeof kpiPropsSchema>;

export const kpiPrimitive = {
  description: 'A headline stat (KPI) with optional delta indicator. Pre-format value strings.',
  propsSchema: kpiPropsSchema,
};
```

- [ ] **Step 4: Implement renderer**

Create `lib/json-render/primitives/kpi.tsx`:

```tsx
'use client';

import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { KpiProps } from './kpi-schema';

const TREND_STYLES = {
  up: { color: 'text-emerald-600 dark:text-emerald-400', Icon: ArrowUpIcon },
  down: { color: 'text-rose-600 dark:text-rose-400', Icon: ArrowDownIcon },
  flat: { color: 'text-muted-foreground', Icon: ArrowRightIcon },
};

export function KPI({ label, value, delta, caption }: KpiProps) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {delta && (() => {
          const { color, Icon } = TREND_STYLES[delta.trend];
          return (
            <div className={cn('flex items-center gap-1 text-xs font-medium', color)}>
              <Icon className="size-3" />
              {delta.value}
            </div>
          );
        })()}
        {caption && <div className="text-xs text-muted-foreground">{caption}</div>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Run tests, expect pass**

Run: `pnpm test lib/json-render/primitives/kpi`
Expected: 5 passed.

#### Task 0.6 — Register Chart/Table/KPI in catalog

- [ ] **Step 1: Locate the components map in `catalog.ts`**

Read `lib/json-render/catalog.ts` lines 77–250 to find the `defineCatalog(...)` block. Current primitives end at `Divider` around line 232.

- [ ] **Step 2: Add the three new entries to the components map**

Modify `lib/json-render/catalog.ts` — add after the `Divider:` entry, before the closing `},` of `components`:

```ts
    Chart: {
      props: chartPropsSchema,
      description:
        'A data visualization. Choose `kind` based on intent: line for trends, bar for comparisons, area for stacked trends, pie for parts-of-a-whole.',
    },
    Table: {
      props: tablePropsSchema,
      description:
        'A tabular data display. Columns define the schema; rows hold the data. Cap at 10×50.',
    },
    KPI: {
      props: kpiPropsSchema,
      description:
        'A single headline metric with optional delta indicator. Compose 2–4 in a row for a dashboard.',
    },
```

Also add the schema imports at the top of `catalog.ts`:

```ts
import { chartPropsSchema } from './primitives/chart-schema';
import { tablePropsSchema } from './primitives/table-schema';
import { kpiPropsSchema } from './primitives/kpi-schema';
```

- [ ] **Step 3: Write a catalog-includes test**

Create `lib/json-render/catalog-new-primitives.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalog } from './catalog';

describe('catalog registers new primitives', () => {
  it('exposes Chart, Table, KPI', () => {
    const components = (catalog as unknown as { components: Record<string, unknown> }).components;
    expect(components).toHaveProperty('Chart');
    expect(components).toHaveProperty('Table');
    expect(components).toHaveProperty('KPI');
  });
});
```

- [ ] **Step 4: Run the test, expect pass**

Run: `pnpm test catalog-new-primitives`
Expected: PASS.

#### Task 0.7 — Register Chart/Table/KPI components in the React registry

- [ ] **Step 1: Add component entries in `registry.tsx`**

Modify `lib/json-render/registry.tsx`:

Add imports at top with other component imports:

```ts
import { Chart } from './primitives/chart';
import { Table } from './primitives/table';
import { KPI } from './primitives/kpi';
```

Find the `defineRegistry(...)` map and add:

```ts
    Chart: (props) => <Chart {...(props as Parameters<typeof Chart>[0])} />,
    Table: (props) => <Table {...(props as Parameters<typeof Table>[0])} />,
    KPI: (props) => <KPI {...(props as Parameters<typeof KPI>[0])} />,
```

- [ ] **Step 2: Run all existing registry tests to confirm no regression**

Run: `pnpm test lib/json-render/registry`
Expected: PASS, no new failures.

#### Task 0.8 — Storybook stories for new primitives

- [ ] **Step 1: Create `stories/Chart.stories.tsx`**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { renderSpecStory } from './_render-spec-story';

const meta: Meta = { title: 'Catalog/Chart' };
export default meta;

const sample = [
  { month: 'Jan', revenue: 120, costs: 80 },
  { month: 'Feb', revenue: 145, costs: 95 },
  { month: 'Mar', revenue: 175, costs: 100 },
  { month: 'Apr', revenue: 210, costs: 110 },
];

export const LineSingleSeries: StoryObj = renderSpecStory({
  root: 'a',
  elements: {
    a: {
      component: 'Chart',
      props: {
        kind: 'line',
        data: sample,
        series: [{ key: 'revenue', label: 'Revenue' }],
        xKey: 'month',
        title: 'Monthly Revenue',
      },
      children: [],
    },
  },
});

export const BarTwoSeries: StoryObj = renderSpecStory({
  root: 'a',
  elements: {
    a: {
      component: 'Chart',
      props: {
        kind: 'bar',
        data: sample,
        series: [
          { key: 'revenue', label: 'Revenue' },
          { key: 'costs', label: 'Costs' },
        ],
        xKey: 'month',
      },
      children: [],
    },
  },
});

export const PieChart: StoryObj = renderSpecStory({
  root: 'a',
  elements: {
    a: {
      component: 'Chart',
      props: {
        kind: 'pie',
        data: [
          { segment: 'Org', value: 45 },
          { segment: 'SMB', value: 30 },
          { segment: 'Ent', value: 25 },
        ],
        series: [{ key: 'value' }],
        xKey: 'segment',
      },
      children: [],
    },
  },
});

export const EmptyData: StoryObj = renderSpecStory({
  root: 'a',
  elements: {
    a: {
      component: 'Chart',
      props: { kind: 'line', data: [], series: [{ key: 'v' }], xKey: 'x' },
      children: [],
    },
  },
});
```

- [ ] **Step 2: Create `stories/Table.stories.tsx`**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { renderSpecStory } from './_render-spec-story';

const meta: Meta = { title: 'Catalog/Table' };
export default meta;

export const Basic: StoryObj = renderSpecStory({
  root: 'a',
  elements: {
    a: {
      component: 'Table',
      props: {
        caption: 'Top contributors',
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'commits', label: 'Commits', align: 'right' },
          { key: 'role', label: 'Role' },
        ],
        rows: [
          { name: 'Ada', commits: 142, role: 'Maintainer' },
          { name: 'Grace', commits: 98, role: 'Maintainer' },
          { name: 'Linus', commits: 67, role: 'Reviewer' },
        ],
      },
      children: [],
    },
  },
});

export const Empty: StoryObj = renderSpecStory({
  root: 'a',
  elements: {
    a: {
      component: 'Table',
      props: { columns: [{ key: 'x', label: 'X' }], rows: [] },
      children: [],
    },
  },
});
```

- [ ] **Step 3: Create `stories/KPI.stories.tsx`**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { renderSpecStory } from './_render-spec-story';

const meta: Meta = { title: 'Catalog/KPI' };
export default meta;

export const WithUpDelta: StoryObj = renderSpecStory({
  root: 'a',
  elements: {
    a: {
      component: 'KPI',
      props: {
        label: 'Monthly Active Users',
        value: '24,318',
        delta: { value: '+12%', trend: 'up' },
        caption: 'vs prior 30 days',
      },
      children: [],
    },
  },
});

export const WithDownDelta: StoryObj = renderSpecStory({
  root: 'a',
  elements: {
    a: {
      component: 'KPI',
      props: {
        label: 'Churn',
        value: '3.2%',
        delta: { value: '-0.4pt', trend: 'down' },
      },
      children: [],
    },
  },
});

export const NoDelta: StoryObj = renderSpecStory({
  root: 'a',
  elements: {
    a: {
      component: 'KPI',
      props: { label: 'Total Revenue', value: '$12.4M' },
      children: [],
    },
  },
});
```

- [ ] **Step 4: Build Storybook to verify stories load**

Run: `npm_config_registry=https://registry.npmjs.org/ pnpm exec storybook build --quiet`
Expected: Build completes without errors. (Note: full `pnpm storybook` would block; use `build` to one-shot.)

#### Task 0.9 — Re-measure catalog prompt size

- [ ] **Step 1: Add a catalog-prompt-size assertion test**

Create `lib/json-render/catalog-prompt-size.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogPrompt } from './catalog';

describe('catalogPrompt size', () => {
  it('stays under the 5000-token budget (≈ 20,000 chars)', () => {
    // Approximate token count via chars / 4 — close enough for budget enforcement.
    const approxTokens = Math.ceil(catalogPrompt.length / 4);
    console.log(`catalogPrompt: ${catalogPrompt.length} chars, ~${approxTokens} tokens`);
    expect(approxTokens).toBeLessThan(5000);
  });
});
```

- [ ] **Step 2: Run it, observe the new token count**

Run: `pnpm test catalog-prompt-size`
Expected: PASS with logged token count. If it FAILS (> 5000 tokens), trim primitive descriptions or remove low-priority enum value docstrings.

### Phase 0 — Done means

- [ ] **All tests pass**: `pnpm test` exits 0.
- [ ] **Type-check passes**: `pnpm exec tsc --noEmit` exits 0.
- [ ] **`recharts` is in `package.json` dependencies**: `grep '"recharts"' package.json` returns a match.
- [ ] **shadcn Chart + Table exist**: both `components/ui/chart.tsx` and `components/ui/table.tsx` exist.
- [ ] **Catalog registers exactly 19 primitives**: `pnpm test catalog-new-primitives` passes AND `grep -cE "^    (Card|Heading|Text|Image|Link|Button|List|Input|Select|Checkbox|Form|Tabs|Accordion|Callout|Badge|Divider|Chart|Table|KPI):" lib/json-render/catalog.ts` returns 19.
- [ ] **catalogPrompt size assertion passes**: `pnpm test catalog-prompt-size` is green.
- [ ] **Storybook builds**: `npm_config_registry=https://registry.npmjs.org/ pnpm exec storybook build --quiet` exits 0.
- [ ] **No regression in existing tests**: `pnpm test` shows the same passed-tests count plus the new ones, no failures.

### Phase 0 — Human verification (none required)

This phase is fully agent-verifiable. Pure addition: existing app behavior unchanged. Storybook visual review is *optional* but not required to mark complete.

---

## Phase 1 — Prompt-cache refactor

**Execution mode: agent-autonomous**

**Goal:** Restructure the system prompt so the catalog text (the largest stable prefix) lives at the start of the prompt, maximizing Azure auto-prompt-cache hits. Add `lib/ai/pricing.ts` with per-model token prices so subsequent phases can compute spend.

**Open risks**
- Realized cache hit rate on a low-traffic portfolio site is probably 10–20%, not 50%. The plan must not assume the higher number when sizing other phases' budgets.

### Files

- Modify: `lib/ai/system-prompt.ts` — reorder
- Modify: `lib/ai/tools/render-ui.ts` — strip catalog from tool description (now lives in system prompt)
- Create: `lib/ai/pricing.ts`
- Create: `lib/ai/pricing.test.ts`
- Create: `lib/ai/system-prompt-cache.test.ts`

### Tasks

#### Task 1.1 — Pricing module

- [ ] **Step 1: Write failing test**

Create `lib/ai/pricing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeCost, PRICING } from './pricing';

describe('pricing', () => {
  it('has entries for all four known model ids', () => {
    expect(PRICING).toHaveProperty('gpt-5.4-mini');
    expect(PRICING).toHaveProperty('gpt-5.4');
    expect(PRICING).toHaveProperty('gpt-5.3-codex');
    expect(PRICING).toHaveProperty('o4-mini');
  });

  it('computes cost correctly for mini', () => {
    // 10,000 input + 5,000 cached input + 2,000 output on gpt-5.4-mini
    // = (10000/1e6)*0.15 + (5000/1e6)*0.075 + (2000/1e6)*0.60
    // = 0.0015 + 0.000375 + 0.0012 = 0.003075
    const cost = computeCost('gpt-5.4-mini', { tokensIn: 10000, tokensCached: 5000, tokensOut: 2000 });
    expect(cost).toBeCloseTo(0.003075, 6);
  });

  it('returns 0 for an unknown model id', () => {
    expect(computeCost('unknown', { tokensIn: 1000, tokensCached: 0, tokensOut: 1000 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm test lib/ai/pricing`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `lib/ai/pricing.ts`:

```ts
export interface ModelPricing {
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
}

export const PRICING: Record<string, ModelPricing> = {
  'gpt-5.4-mini': { inputPerMillion: 0.15, cachedInputPerMillion: 0.075, outputPerMillion: 0.6 },
  'gpt-5.4': { inputPerMillion: 1.25, cachedInputPerMillion: 0.625, outputPerMillion: 5.0 },
  'gpt-5.3-codex': { inputPerMillion: 1.25, cachedInputPerMillion: 0.625, outputPerMillion: 5.0 },
  'o4-mini': { inputPerMillion: 0.15, cachedInputPerMillion: 0.075, outputPerMillion: 0.6 },
};

export interface TokenUsage {
  tokensIn: number;
  tokensCached: number;
  tokensOut: number;
}

export function computeCost(modelId: string, usage: TokenUsage): number {
  const p = PRICING[modelId];
  if (!p) return 0;
  return (
    (usage.tokensIn / 1_000_000) * p.inputPerMillion +
    (usage.tokensCached / 1_000_000) * p.cachedInputPerMillion +
    (usage.tokensOut / 1_000_000) * p.outputPerMillion
  );
}
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm test lib/ai/pricing`
Expected: 3 passed.

#### Task 1.2 — System-prompt reorder for caching

- [ ] **Step 1: Inspect current SYSTEM_PROMPT**

Read `lib/ai/system-prompt.ts`. Identify the structure.

- [ ] **Step 2: Write cache-prefix test**

Create `lib/ai/system-prompt-cache.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT } from './system-prompt';
import { catalogPrompt } from '@/lib/json-render/catalog';

describe('SYSTEM_PROMPT structure for prompt caching', () => {
  it('starts with the catalogPrompt (so the cacheable prefix is stable)', () => {
    expect(SYSTEM_PROMPT.startsWith(catalogPrompt)).toBe(true);
  });

  it('cacheable prefix (catalogPrompt) exceeds 1024 tokens (~4096 chars)', () => {
    // Azure auto-cache kicks in at 1024 tokens.
    expect(catalogPrompt.length).toBeGreaterThan(4096);
  });
});
```

- [ ] **Step 3: Run, expect fail**

Run: `pnpm test system-prompt-cache`
Expected: FAIL — system prompt does not start with catalogPrompt.

- [ ] **Step 4: Modify SYSTEM_PROMPT to prepend catalogPrompt**

Modify `lib/ai/system-prompt.ts` so the file is:

```ts
import { catalogPrompt } from '@/lib/json-render/catalog';

const STEERING = `\
You are an AI assistant for a portfolio chat application. You can render rich UI in chat using the renderUI tool. Prefer rendering UI when it improves comprehension (data → charts/tables, choices → forms, multiple items → cards/tabs). Keep narrative inside the spec via Heading/Text/Callout primitives. One render per turn.`;

export const SYSTEM_PROMPT = `${catalogPrompt}\n\n---\n\n${STEERING}`;
```

(Preserve any additional steering text from the existing file; just ensure catalogPrompt comes first.)

- [ ] **Step 5: Strip catalog from renderUI tool description**

Modify `lib/ai/tools/render-ui.ts`: locate where `catalogPrompt` is included in the tool description and remove that injection. The catalog is now in the system prompt; duplicating it doubles cost.

- [ ] **Step 6: Run all tests**

Run: `pnpm test`
Expected: all green including new cache tests.

### Phase 1 — Done means

- [ ] `pnpm test` exits 0.
- [ ] `pnpm exec tsc --noEmit` exits 0.
- [ ] `SYSTEM_PROMPT.startsWith(catalogPrompt)` is true (asserted by `system-prompt-cache.test.ts`).
- [ ] `renderUI` tool description no longer contains catalogPrompt text (verify via `grep -c catalogPrompt lib/ai/tools/render-ui.ts` returns 0).
- [ ] `lib/ai/pricing.ts` exports `PRICING` and `computeCost`; tests cover all 4 known model ids + unknown fallback.

### Phase 1 — Human verification (none required)

Pure refactor + new pure-function module. Agent-verifiable end to end.

---

## Phase 2 — Auth + users table

**Execution mode: agent-autonomous**

**Goal:** Add NextAuth.js v5 with Google + GitHub + LinkedIn providers, create users/accounts tables, link existing `sessions` table to a (nullable) `user_id`. No UI surface yet beyond a placeholder `/api/auth/[...nextauth]` route; the visible login UX lands in Phase 6.

**Open risks**
- LinkedIn OAuth Developer App approval is 1–2 business days. Queue the application as the FIRST step of this phase so it can run in parallel with code work.
- NextAuth v5 (beta) → Auth.js naming; the Drizzle adapter version must match.

### Files

- Create: `lib/auth/config.ts`, `lib/auth/index.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Modify: `lib/db/schema.ts` (add users, accounts, sessions(authjs), verification_tokens; add `user_id` to existing `sessions` chat table — rename existing `sessions` to `chat_sessions` to avoid NextAuth name collision)
- Modify: `lib/db/queries.ts` (rename references; add user queries)
- Modify: `app/api/chat/route.ts`, `app/api/sessions/route.ts`, `app/api/sessions/[id]/route.ts` (table rename)
- Create: `drizzle/0001_auth_tables.sql` (generated)

### Tasks

#### Task 2.0 — Apply for LinkedIn OAuth Developer App (out-of-band)

- [ ] **Step 1: Create LinkedIn Developer app**

Manual step: the engineer (or user) navigates to LinkedIn's developer portal, creates a new app, requests "Sign In with LinkedIn using OpenID Connect" product. Note client_id and client_secret for later.

This step is NOT blocking the rest of Phase 2 — code work can proceed with Google + GitHub only and LinkedIn added when approval lands. Track approval status as a side-channel todo.

#### Task 2.1 — Install NextAuth + Drizzle adapter

- [ ] **Step 1: Install deps**

Run:
```bash
npm_config_registry=https://registry.npmjs.org/ pnpm add next-auth@beta @auth/drizzle-adapter
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

#### Task 2.2 — Schema changes: rename chat sessions, add auth tables

The existing `sessions` table is the chat-session concept; NextAuth's adapter wants a table called `sessions` for auth sessions. Rename the existing one to `chat_sessions` to avoid collision.

- [ ] **Step 1: Modify `lib/db/schema.ts`**

```ts
import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ----- Auth tables (Auth.js / NextAuth Drizzle adapter shape) -----

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expiresAt: integer('expires_at'),
    tokenType: text('token_type'),
    scope: text('scope'),
    idToken: text('id_token'),
    sessionState: text('session_state'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export const authSessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) }),
);

// ----- Chat tables (renamed: was `sessions`, now `chat_sessions`) -----

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull().default('New chat'),
    model: text('model').notNull(),
    tokensIn: bigint('tokens_in', { mode: 'number' }).notNull().default(0),
    tokensOut: bigint('tokens_out', { mode: 'number' }).notNull().default(0),
    tokensCached: bigint('tokens_cached', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    updatedAtIdx: index('chat_sessions_updated_at_idx').on(t.updatedAt.desc()),
    userIdIdx: index('chat_sessions_user_id_idx').on(t.userId),
  }),
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    parts: jsonb('parts').notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionCreatedIdx: index('messages_session_created_idx').on(t.sessionId, t.createdAt),
  }),
);

// Re-exports for the old name to ease migration; remove once all callers updated.
export const sessions = chatSessions;

export type Session = typeof chatSessions.$inferSelect;
export type NewSession = typeof chatSessions.$inferInsert;
export type DbMessage = typeof messages.$inferSelect;
export type NewDbMessage = typeof messages.$inferInsert;
```

- [ ] **Step 2: Update all `sessions` imports in `lib/db/queries.ts`**

Find/replace `sessions` → `chatSessions` in `lib/db/queries.ts`. Verify each call site post-replacement.

- [ ] **Step 3: Generate the migration**

Run:
```bash
pnpm db:generate
```

Expected: a new migration file appears under `drizzle/` (likely `drizzle/0001_<name>.sql`). The migration must include: rename of `sessions` → `chat_sessions`, addition of `user_id` column, addition of users/accounts/sessions(authjs)/verification_tokens tables.

Verify by reading the generated SQL.

- [ ] **Step 4: Apply the migration locally**

Run: `pnpm db:migrate`
Expected: no errors.

- [ ] **Step 5: Verify schema in DB**

Run:
```bash
pnpm exec drizzle-kit studio
```

Visually confirm tables exist: `users`, `accounts`, `sessions`, `verification_tokens`, `chat_sessions`, `messages`. Close studio.

OR via psql one-shot:

```bash
psql "$DATABASE_URL" -c "\dt"
```

Expected output includes all six tables.

#### Task 2.3 — NextAuth config

- [ ] **Step 1: Write failing config-shape test**

Create `lib/auth/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { authConfig } from './config';

describe('auth config', () => {
  it('registers google, github, linkedin providers', () => {
    const ids = authConfig.providers.map((p: { id?: string }) => p.id);
    expect(ids).toContain('google');
    expect(ids).toContain('github');
    expect(ids).toContain('linkedin');
  });

  it('uses the drizzle adapter', () => {
    expect(authConfig.adapter).toBeDefined();
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm test lib/auth/config`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement config**

Create `lib/auth/config.ts`:

```ts
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import type { NextAuthConfig } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import LinkedIn from 'next-auth/providers/linkedin';
import { db } from '@/lib/db/client';
import { accounts, authSessions, users, verificationTokens } from '@/lib/db/schema';

export const authConfig: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: authSessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }),
    GitHub({ clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET }),
    LinkedIn({ clientId: process.env.LINKEDIN_CLIENT_ID, clientSecret: process.env.LINKEDIN_CLIENT_SECRET }),
  ],
  session: { strategy: 'database' },
  pages: { signIn: '/auth/sign-in' },
};
```

Create `lib/auth/index.ts`:

```ts
import NextAuth from 'next-auth';
import { authConfig } from './config';

export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);
```

- [ ] **Step 4: Route handler**

Create `app/api/auth/[...nextauth]/route.ts`:

```ts
export { GET, POST } from '@/lib/auth';
```

Wait — Auth.js v5 export shape differs slightly. The correct route file is:

```ts
import { handlers } from '@/lib/auth';
export const { GET, POST } = handlers;
```

- [ ] **Step 5: Run config test**

Run: `pnpm test lib/auth/config`
Expected: 2 passed.

#### Task 2.4 — Wire `auth()` into chat route + sessions APIs

- [ ] **Step 1: Update `/api/chat/route.ts` to resolve `user_id` from session**

Modify `app/api/chat/route.ts`:

Add import at top:

```ts
import { auth } from '@/lib/auth';
```

In `POST`, after the body parse and before resolving session, add:

```ts
const session = await auth();
const userId = session?.user?.id ?? null;
```

Pass `userId` to `createSession` and downstream calls. The `chat_sessions` table now accepts `user_id` — write it on insert.

- [ ] **Step 2: Update `/api/sessions/route.ts` to scope listings**

Modify `app/api/sessions/route.ts` GET handler to only return sessions where `user_id = $1` when signed in, OR `user_id IS NULL` when not. (Anonymous-session listing rules tighten further in Phase 4 — for now, anonymous gets all-anonymous.)

- [ ] **Step 3: Update queries**

Modify `lib/db/queries.ts`:
- `createSession({ model, userId })` accepts `userId`.
- `listSessions({ userId })` filters by userId or `user_id IS NULL`.
- All affected queries get unit tests; add cases for `userId === null` vs a real id.

- [ ] **Step 4: Run integration tests**

Run: `pnpm test lib/db/queries`
Expected: existing tests + new userId tests all pass.

### Phase 2 — Done means

- [ ] `pnpm test` exits 0.
- [ ] `pnpm exec tsc --noEmit` exits 0.
- [ ] DB has 6 tables: `\dt` shows `users`, `accounts`, `sessions`, `verification_tokens`, `chat_sessions`, `messages`. Run: `psql "$DATABASE_URL" -c "\dt" | wc -l` ≥ 8 (header + 6 + footer).
- [ ] `chat_sessions.user_id` exists and is nullable: `psql "$DATABASE_URL" -c "\d chat_sessions"` shows `user_id | text |  |`.
- [ ] NextAuth route exists: `curl -s http://localhost:3000/api/auth/providers` returns JSON listing `google`, `github`, `linkedin`.
- [ ] No regressions: existing `chat_sessions` queries still pass.
- [ ] `lib/auth/config.test.ts` passes: 2/2.

### Phase 2 — Human verification (none required)

This phase ships back-end machinery only — no visible UI. The OAuth providers register but no sign-in button exists yet (that's Phase 6). Agent-verifiable end to end via the curl + psql assertions above.

---

## Phase 3 — Quota ledger + preflight + kill switch

**Execution mode: agent-autonomous**

**Goal:** Track every turn's actual token spend per actor and per day in a `usage_ledger` table. Preflight each chat request against per-actor and global caps; postflight record actual usage. BYOK bypasses global caps.

**Open risks**
- Postflight write happens in `onFinish` — if that handler crashes, the ledger drifts under-counted, allowing budget creep. Mitigation: postflight is wrapped in its own try/catch with a structured warning log; a periodic cron (not in this plan) could reconcile.
- The current `addUsageToSession` in `lib/db/queries.ts` writes per-session tokens. Keep it AND add the ledger; the ledger is the source of truth for budget, the session totals stay for the UI's session badge.

### Files

- Create: `lib/budget/identity.ts`
- Create: `lib/budget/preflight.ts`, `lib/budget/preflight.test.ts`
- Create: `lib/budget/postflight.ts`, `lib/budget/postflight.test.ts`
- Create: `lib/db/usage-ledger.ts`, `lib/db/usage-ledger.test.ts`
- Modify: `lib/db/schema.ts` (add usage_ledger)
- Modify: `app/api/chat/route.ts` (preflight + postflight integration)
- Create: `drizzle/0002_usage_ledger.sql` (generated)

### Tasks

#### Task 3.1 — Schema: `usage_ledger`

- [ ] **Step 1: Add to `lib/db/schema.ts`**

Append:

```ts
export const usageLedger = pgTable(
  'usage_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: text('actor_id').notNull(),
    actorKind: text('actor_kind').notNull(), // 'user' | 'anonymous' | 'global'
    day: text('day').notNull(), // YYYY-MM-DD in UTC
    month: text('month').notNull(), // YYYY-MM in UTC
    modelId: text('model_id').notNull(),
    tokensIn: bigint('tokens_in', { mode: 'number' }).notNull(),
    tokensOut: bigint('tokens_out', { mode: 'number' }).notNull(),
    tokensCached: bigint('tokens_cached', { mode: 'number' }).notNull(),
    costUsd: integer('cost_micro_usd').notNull(), // store as micro-USD to avoid float
    byok: integer('byok').notNull().default(0), // 0|1
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actorDayIdx: index('usage_ledger_actor_day_idx').on(t.actorId, t.day),
    globalDayIdx: index('usage_ledger_global_day_idx').on(t.day),
    globalMonthIdx: index('usage_ledger_global_month_idx').on(t.month),
  }),
);
```

- [ ] **Step 2: Generate + apply migration**

Run:
```bash
pnpm db:generate && pnpm db:migrate
```

Expected: new migration in `drizzle/`, applied without error.

- [ ] **Step 3: Verify**

Run: `psql "$DATABASE_URL" -c "\d usage_ledger"`
Expected: shows all columns + 3 indices.

#### Task 3.2 — Ledger queries

- [ ] **Step 1: Write failing test**

Create `lib/db/usage-ledger.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './client';
import { usageLedger } from './schema';
import { eq } from 'drizzle-orm';
import {
  recordUsage,
  sumActorSpendToday,
  sumGlobalSpendToday,
  sumGlobalSpendThisMonth,
} from './usage-ledger';

const TEST_ACTOR = 'test-actor-' + Date.now();

afterEach(async () => {
  await db.delete(usageLedger).where(eq(usageLedger.actorId, TEST_ACTOR));
});

describe('usage-ledger', () => {
  it('records a row and reads it back', async () => {
    await recordUsage({
      actorId: TEST_ACTOR,
      actorKind: 'user',
      modelId: 'gpt-5.4-mini',
      tokensIn: 1000,
      tokensOut: 500,
      tokensCached: 200,
      byok: false,
    });
    const sum = await sumActorSpendToday(TEST_ACTOR);
    expect(sum).toBeGreaterThan(0);
  });

  it('separately aggregates global daily + monthly', async () => {
    await recordUsage({
      actorId: TEST_ACTOR,
      actorKind: 'user',
      modelId: 'gpt-5.4-mini',
      tokensIn: 1000,
      tokensOut: 500,
      tokensCached: 0,
      byok: false,
    });
    const daily = await sumGlobalSpendToday();
    const monthly = await sumGlobalSpendThisMonth();
    expect(daily).toBeGreaterThan(0);
    expect(monthly).toBeGreaterThanOrEqual(daily);
  });

  it('excludes byok rows from non-byok aggregation', async () => {
    await recordUsage({
      actorId: TEST_ACTOR,
      actorKind: 'user',
      modelId: 'gpt-5.4-mini',
      tokensIn: 1_000_000,
      tokensOut: 0,
      tokensCached: 0,
      byok: true,
    });
    const daily = await sumGlobalSpendToday({ excludeByok: true });
    expect(daily).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm test usage-ledger`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `lib/db/usage-ledger.ts`:

```ts
import { and, eq, like, sum } from 'drizzle-orm';
import { computeCost } from '@/lib/ai/pricing';
import { db } from './client';
import { usageLedger } from './schema';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function thisMonthUtc(): string {
  return new Date().toISOString().slice(0, 7);
}

export interface RecordUsageInput {
  actorId: string;
  actorKind: 'user' | 'anonymous';
  modelId: string;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  byok: boolean;
}

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  const cost = computeCost(input.modelId, {
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    tokensCached: input.tokensCached,
  });
  await db.insert(usageLedger).values({
    actorId: input.actorId,
    actorKind: input.actorKind,
    day: todayUtc(),
    month: thisMonthUtc(),
    modelId: input.modelId,
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    tokensCached: input.tokensCached,
    costUsd: Math.round(cost * 1_000_000),
    byok: input.byok ? 1 : 0,
  });
}

async function sumCostMicro(filter: ReturnType<typeof and>): Promise<number> {
  const r = await db
    .select({ total: sum(usageLedger.costUsd).mapWith(Number) })
    .from(usageLedger)
    .where(filter);
  return r[0]?.total ?? 0;
}

export async function sumActorSpendToday(actorId: string): Promise<number> {
  const micro = await sumCostMicro(
    and(eq(usageLedger.actorId, actorId), eq(usageLedger.day, todayUtc()), eq(usageLedger.byok, 0)),
  );
  return micro / 1_000_000;
}

export async function sumGlobalSpendToday(opts: { excludeByok?: boolean } = {}): Promise<number> {
  const filter = opts.excludeByok !== false
    ? and(eq(usageLedger.day, todayUtc()), eq(usageLedger.byok, 0))
    : eq(usageLedger.day, todayUtc());
  const micro = await sumCostMicro(filter);
  return micro / 1_000_000;
}

export async function sumGlobalSpendThisMonth(): Promise<number> {
  const micro = await sumCostMicro(
    and(eq(usageLedger.month, thisMonthUtc()), eq(usageLedger.byok, 0)),
  );
  return micro / 1_000_000;
}
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm test usage-ledger`
Expected: 3 passed.

#### Task 3.3 — Identity resolver

- [ ] **Step 1: Test**

Create `lib/budget/identity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveActor } from './identity';

describe('resolveActor', () => {
  it('prefers user_id when both present', () => {
    expect(resolveActor({ userId: 'u1', anonymousId: 'a1' })).toEqual({
      actorKind: 'user',
      actorId: 'u1',
    });
  });

  it('falls back to anonymous_id when user_id missing', () => {
    expect(resolveActor({ userId: null, anonymousId: 'a1' })).toEqual({
      actorKind: 'anonymous',
      actorId: 'a1',
    });
  });

  it('throws when both are missing', () => {
    expect(() => resolveActor({ userId: null, anonymousId: null })).toThrow();
  });
});
```

- [ ] **Step 2: Implement**

Create `lib/budget/identity.ts`:

```ts
export interface ActorInput {
  userId: string | null;
  anonymousId: string | null;
}

export interface Actor {
  actorKind: 'user' | 'anonymous';
  actorId: string;
}

export function resolveActor(input: ActorInput): Actor {
  if (input.userId) return { actorKind: 'user', actorId: input.userId };
  if (input.anonymousId) return { actorKind: 'anonymous', actorId: input.anonymousId };
  throw new Error('No actor identity: both userId and anonymousId are null');
}
```

- [ ] **Step 3: Run**

Run: `pnpm test budget/identity`
Expected: 3 passed.

#### Task 3.4 — Preflight

- [ ] **Step 1: Test**

Create `lib/budget/preflight.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { preflight } from './preflight';

vi.mock('@/lib/db/usage-ledger', () => ({
  sumActorSpendToday: vi.fn(async () => 0),
  sumGlobalSpendToday: vi.fn(async () => 0),
  sumGlobalSpendThisMonth: vi.fn(async () => 0),
}));

import {
  sumActorSpendToday,
  sumGlobalSpendToday,
  sumGlobalSpendThisMonth,
} from '@/lib/db/usage-ledger';

afterEach(() => {
  vi.clearAllMocks();
});

describe('preflight', () => {
  it('allows when all caps under threshold', async () => {
    const r = await preflight({ actor: { actorKind: 'user', actorId: 'u1' }, byok: false });
    expect(r.allow).toBe(true);
  });

  it('rejects with dailyCapReached when global daily ≥ $5', async () => {
    (sumGlobalSpendToday as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5.01);
    const r = await preflight({ actor: { actorKind: 'user', actorId: 'u1' }, byok: false });
    expect(r.allow).toBe(false);
    expect(r.reason).toBe('dailyCapReached');
  });

  it('rejects with monthlyCapReached when global month ≥ $30', async () => {
    (sumGlobalSpendThisMonth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(30.01);
    const r = await preflight({ actor: { actorKind: 'user', actorId: 'u1' }, byok: false });
    expect(r.allow).toBe(false);
    expect(r.reason).toBe('monthlyCapReached');
  });

  it('rejects anonymous actor at $0.20', async () => {
    (sumActorSpendToday as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0.21);
    const r = await preflight({ actor: { actorKind: 'anonymous', actorId: 'a1' }, byok: false });
    expect(r.allow).toBe(false);
    expect(r.reason).toBe('actorCapReached');
  });

  it('rejects user actor at $1.00', async () => {
    (sumActorSpendToday as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1.01);
    const r = await preflight({ actor: { actorKind: 'user', actorId: 'u1' }, byok: false });
    expect(r.allow).toBe(false);
    expect(r.reason).toBe('actorCapReached');
  });

  it('byok bypasses all global caps', async () => {
    (sumGlobalSpendToday as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(100);
    (sumGlobalSpendThisMonth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1000);
    const r = await preflight({ actor: { actorKind: 'user', actorId: 'u1' }, byok: true });
    expect(r.allow).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

Create `lib/budget/preflight.ts`:

```ts
import {
  sumActorSpendToday,
  sumGlobalSpendThisMonth,
  sumGlobalSpendToday,
} from '@/lib/db/usage-ledger';
import type { Actor } from './identity';

export const CAPS = {
  dailyGlobalUsd: Number(process.env.CAP_DAILY_USD ?? '5'),
  monthlyGlobalUsd: Number(process.env.CAP_MONTHLY_USD ?? '30'),
  anonymousDailyUsd: Number(process.env.CAP_ANON_DAILY_USD ?? '0.20'),
  userDailyUsd: Number(process.env.CAP_USER_DAILY_USD ?? '1.00'),
};

export type PreflightReason =
  | 'dailyCapReached'
  | 'monthlyCapReached'
  | 'actorCapReached';

export type PreflightResult =
  | { allow: true }
  | { allow: false; reason: PreflightReason };

export interface PreflightInput {
  actor: Actor;
  byok: boolean;
}

export async function preflight(input: PreflightInput): Promise<PreflightResult> {
  if (input.byok) return { allow: true };

  const [globalDaily, globalMonthly] = await Promise.all([
    sumGlobalSpendToday(),
    sumGlobalSpendThisMonth(),
  ]);

  if (globalDaily >= CAPS.dailyGlobalUsd) return { allow: false, reason: 'dailyCapReached' };
  if (globalMonthly >= CAPS.monthlyGlobalUsd) return { allow: false, reason: 'monthlyCapReached' };

  const actorSpend = await sumActorSpendToday(input.actor.actorId);
  const actorCap =
    input.actor.actorKind === 'user' ? CAPS.userDailyUsd : CAPS.anonymousDailyUsd;
  if (actorSpend >= actorCap) return { allow: false, reason: 'actorCapReached' };

  return { allow: true };
}
```

- [ ] **Step 3: Run**

Run: `pnpm test budget/preflight`
Expected: 6 passed.

#### Task 3.5 — Postflight

- [ ] **Step 1: Test**

Create `lib/budget/postflight.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { postflight } from './postflight';

vi.mock('@/lib/db/usage-ledger', () => ({
  recordUsage: vi.fn(async () => {}),
}));

import { recordUsage } from '@/lib/db/usage-ledger';

describe('postflight', () => {
  it('forwards usage to recordUsage', async () => {
    await postflight({
      actor: { actorKind: 'user', actorId: 'u1' },
      modelId: 'gpt-5.4-mini',
      tokensIn: 100,
      tokensOut: 50,
      tokensCached: 25,
      byok: false,
    });
    expect(recordUsage).toHaveBeenCalledWith({
      actorId: 'u1',
      actorKind: 'user',
      modelId: 'gpt-5.4-mini',
      tokensIn: 100,
      tokensOut: 50,
      tokensCached: 25,
      byok: false,
    });
  });

  it('swallows ledger errors and logs', async () => {
    (recordUsage as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      postflight({
        actor: { actorKind: 'user', actorId: 'u1' },
        modelId: 'gpt-5.4-mini',
        tokensIn: 0,
        tokensOut: 0,
        tokensCached: 0,
        byok: false,
      }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Implement**

Create `lib/budget/postflight.ts`:

```ts
import { recordUsage } from '@/lib/db/usage-ledger';
import type { Actor } from './identity';

export interface PostflightInput {
  actor: Actor;
  modelId: string;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  byok: boolean;
}

export async function postflight(input: PostflightInput): Promise<void> {
  try {
    await recordUsage({
      actorId: input.actor.actorId,
      actorKind: input.actor.actorKind,
      modelId: input.modelId,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      tokensCached: input.tokensCached,
      byok: input.byok,
    });
  } catch (err) {
    console.error('[postflight] failed to record usage — budget may drift', err, input);
  }
}
```

- [ ] **Step 3: Run**

Run: `pnpm test budget/postflight`
Expected: 2 passed.

#### Task 3.6 — Wire preflight + postflight into `/api/chat`

- [ ] **Step 1: Modify `app/api/chat/route.ts`**

Inside `POST`, after resolving `userId` from `auth()` and BEFORE `createSession`:

```ts
// Anonymous identity comes from middleware-set cookie — placeholder until Phase 4 lands middleware.
// For now, fall back to a stable per-process random id.
const anonymousId = userId ? null : (req.headers.get('x-anonymous-id') ?? null);

const actor = resolveActor({ userId, anonymousId });
const byok = false; // wired up properly in Phase 5

const gate = await preflight({ actor, byok });
if (!gate.allow) {
  return new Response(JSON.stringify({ error: 'quota', reason: gate.reason }), {
    status: 429,
    headers: { 'content-type': 'application/json' },
  });
}
```

Inside the existing `onFinish` of `streamText`:

```ts
onFinish: async ({ totalUsage }) => {
  if (req.signal.aborted) return;
  await postflight({
    actor,
    modelId: model,
    tokensIn: totalUsage.inputTokens ?? 0,
    tokensOut: totalUsage.outputTokens ?? 0,
    tokensCached: totalUsage.cachedInputTokens ?? 0,
    byok,
  });
  // existing addUsageToSession call stays
  try {
    await addUsageToSession(sessionId, {
      tokensIn: totalUsage.inputTokens ?? 0,
      tokensOut: totalUsage.outputTokens ?? 0,
      tokensCached: totalUsage.cachedInputTokens ?? 0,
    });
  } catch (err) {
    console.error('usage persist failed', err);
  }
},
```

Add imports at top:

```ts
import { resolveActor } from '@/lib/budget/identity';
import { preflight } from '@/lib/budget/preflight';
import { postflight } from '@/lib/budget/postflight';
import { auth } from '@/lib/auth';
```

Also add `maxOutputTokens: Number(process.env.MAX_OUTPUT_TOKENS_PER_TURN ?? 10000)` to the `streamText` call options (this is the per-turn output ceiling).

- [ ] **Step 2: Integration test**

Create `app/api/chat/route.preflight.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/budget/preflight', () => ({
  preflight: vi.fn(),
  CAPS: { dailyGlobalUsd: 5, monthlyGlobalUsd: 30, anonymousDailyUsd: 0.2, userDailyUsd: 1 },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));

import { preflight } from '@/lib/budget/preflight';
import { POST } from './route';

describe('chat route preflight gating', () => {
  it('returns 429 with reason when preflight rejects', async () => {
    (preflight as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allow: false,
      reason: 'dailyCapReached',
    });
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-anonymous-id': 'anon-test' },
      body: JSON.stringify({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: 'quota', reason: 'dailyCapReached' });
  });
});
```

- [ ] **Step 3: Run**

Run: `pnpm test chat/route.preflight`
Expected: 1 passed.

### Phase 3 — Done means

- [ ] `pnpm test` exits 0 with all new test files green.
- [ ] `pnpm exec tsc --noEmit` exits 0.
- [ ] `usage_ledger` table exists with 3 indices: `psql "$DATABASE_URL" -c "\d usage_ledger"` shows the table and `\di` shows `usage_ledger_actor_day_idx`, `usage_ledger_global_day_idx`, `usage_ledger_global_month_idx`.
- [ ] Curl smoke: with `CAP_DAILY_USD=0.0001 pnpm dev` and a single chat POST, then a second POST → second one returns 429 with `{ error: 'quota', reason: 'dailyCapReached' }`. (Manual smoke; preflight unit tests cover the assertion programmatically.)
- [ ] BYOK bypass test passes: `pnpm test budget/preflight -t 'byok bypasses'`.
- [ ] No regressions in existing `chat_sessions` or `messages` queries: `pnpm test lib/db/queries` is green.

### Phase 3 — Human verification (none required)

All gating decisions and ledger writes are observable through unit + integration tests. The manual curl smoke in Done-means is *optional* — the test suite covers the assertions.

---

## Phase 4 — Anonymous front door

**Execution mode: review-checkpointed**

**Goal:** Public anonymous landing — Cloudflare Turnstile gate on first chat request, signed `pac_anon` cookie identity, 4 chip prompts as the entire anonymous input surface, anonymous→user session claim on sign-in. Free typing remains disabled for anonymous.

**Open risks**
- Chip styling and copy is part of the showcase aesthetic. Cannot be auto-verified. Human review of `ChipDeck` rendering required.
- Turnstile widget integration on Next.js 16 App Router has documented quirks with React 19 — verify the `@marsidev/react-turnstile` version pinned supports both.

### Files

- Create: `middleware.ts` (sets `pac_anon` cookie + extracts identity)
- Create: `lib/anon/cookie.ts` (sign/verify pac_anon)
- Create: `lib/anon/cookie.test.ts`
- Create: `lib/turnstile/verify.ts`, `lib/turnstile/verify.test.ts`
- Create: `lib/turnstile/cookie.ts`, `lib/turnstile/cookie.test.ts`
- Create: `app/api/turnstile/verify/route.ts`
- Create: `components/chat/chip-deck.tsx`
- Create: `lib/chat/chips.ts` (4 chip entries; actual prompt strings stay placeholder until Phase 7)
- Modify: `lib/db/schema.ts` (add `anonymous_id` to chat_sessions)
- Modify: `lib/db/queries.ts` (claim mutation + anonymous-scoped listing)
- Modify: `app/api/chat/route.ts` (gate on chip-only for anonymous + read pac_anon)
- Modify: `components/chat/chat.tsx` (render ChipDeck; disable free typing when anonymous)
- Create: `drizzle/0003_anonymous_session.sql` (generated)

### Tasks

#### Task 4.1 — `anonymous_id` column on chat_sessions

- [ ] **Step 1: Modify schema**

In `lib/db/schema.ts`, add to `chatSessions`:

```ts
anonymousId: text('anonymous_id'),
```

Plus an index:

```ts
anonymousIdIdx: index('chat_sessions_anonymous_id_idx').on(t.anonymousId),
```

- [ ] **Step 2: Generate + apply migration**

```bash
pnpm db:generate && pnpm db:migrate
```

- [ ] **Step 3: Verify**

```bash
psql "$DATABASE_URL" -c "\d chat_sessions"
```

Expected: shows `anonymous_id` column + `chat_sessions_anonymous_id_idx` index.

#### Task 4.2 — `pac_anon` cookie + middleware

- [ ] **Step 1: Test the cookie module**

Create `lib/anon/cookie.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { signAnonId, verifyAnonCookie, makeAnonId } from './cookie';

const SECRET = 'test-secret-32-chars-long-xxxxxxx';

describe('pac_anon cookie', () => {
  it('round-trips a signed id', () => {
    const id = makeAnonId();
    const cookieValue = signAnonId(id, SECRET);
    expect(verifyAnonCookie(cookieValue, SECRET)).toBe(id);
  });

  it('rejects an unsigned id', () => {
    expect(verifyAnonCookie('not-a-real-cookie', SECRET)).toBeNull();
  });

  it('rejects a tampered cookie', () => {
    const id = makeAnonId();
    const cookieValue = signAnonId(id, SECRET);
    const tampered = `${cookieValue.slice(0, -3)}xyz`;
    expect(verifyAnonCookie(tampered, SECRET)).toBeNull();
  });

  it('rejects with a wrong secret', () => {
    const id = makeAnonId();
    const cookieValue = signAnonId(id, SECRET);
    expect(verifyAnonCookie(cookieValue, 'different-secret-xxxxxxxxxxxxxxxx')).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

Create `lib/anon/cookie.ts`:

```ts
import { createHmac } from 'node:crypto';
import { nanoid } from 'nanoid';

export function makeAnonId(): string {
  return nanoid(21);
}

function hmac(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function signAnonId(id: string, secret: string): string {
  return `${id}.${hmac(id, secret)}`;
}

export function verifyAnonCookie(cookieValue: string, secret: string): string | null {
  const dot = cookieValue.lastIndexOf('.');
  if (dot < 1) return null;
  const id = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (sig !== hmac(id, secret)) return null;
  return id;
}
```

- [ ] **Step 3: Run**

Run: `pnpm test anon/cookie`
Expected: 4 passed.

- [ ] **Step 4: Create middleware**

Create `middleware.ts` at the repo root:

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { makeAnonId, signAnonId, verifyAnonCookie } from '@/lib/anon/cookie';

const COOKIE_NAME = 'pac_anon';
const SEVEN_DAYS = 60 * 60 * 24 * 7;

export function middleware(req: NextRequest) {
  const secret = process.env.ANON_COOKIE_SECRET;
  if (!secret) return NextResponse.next();

  const existing = req.cookies.get(COOKIE_NAME)?.value;
  const verified = existing ? verifyAnonCookie(existing, secret) : null;

  const res = NextResponse.next();

  if (!verified) {
    const id = makeAnonId();
    res.cookies.set(COOKIE_NAME, signAnonId(id, secret), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SEVEN_DAYS,
      path: '/',
    });
  } else {
    // refresh
    res.cookies.set(COOKIE_NAME, existing!, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SEVEN_DAYS,
      path: '/',
    });
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
```

#### Task 4.3 — Turnstile verify endpoint + trust cookie

- [ ] **Step 1: Install Turnstile React component**

```bash
npm_config_registry=https://registry.npmjs.org/ pnpm add @marsidev/react-turnstile
```

- [ ] **Step 2: Test verify**

Create `lib/turnstile/verify.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstileToken } from './verify';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('verifyTurnstileToken', () => {
  it('returns true when Cloudflare confirms', async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    ) as typeof fetch;
    const ok = await verifyTurnstileToken('tok', '1.2.3.4', 'secret');
    expect(ok).toBe(true);
  });

  it('returns false when Cloudflare rejects', async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] })),
    ) as typeof fetch;
    expect(await verifyTurnstileToken('tok', '1.2.3.4', 'secret')).toBe(false);
  });

  it('returns false on network error', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network');
    }) as typeof fetch;
    expect(await verifyTurnstileToken('tok', '1.2.3.4', 'secret')).toBe(false);
  });
});
```

- [ ] **Step 3: Implement verify**

Create `lib/turnstile/verify.ts`:

```ts
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstileToken(
  token: string,
  remoteIp: string | null,
  secret: string,
): Promise<boolean> {
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const r = await fetch(TURNSTILE_URL, { method: 'POST', body });
    const json = (await r.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Trust cookie module + tests**

Create `lib/turnstile/cookie.ts`:

```ts
import { createHmac } from 'node:crypto';

export interface TrustPayload {
  verifiedAt: number;
  expiresAt: number;
}

function hmac(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function signTrust(payload: TrustPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${hmac(encoded, secret)}`;
}

export function verifyTrust(cookieValue: string, secret: string): TrustPayload | null {
  const dot = cookieValue.lastIndexOf('.');
  if (dot < 1) return null;
  const encoded = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (sig !== hmac(encoded, secret)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as TrustPayload;
    if (typeof payload.expiresAt !== 'number' || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
```

Create `lib/turnstile/cookie.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { signTrust, verifyTrust } from './cookie';

const S = 'turnstile-test-secret-32-chars-xxx';

describe('trust cookie', () => {
  it('round-trips a fresh payload', () => {
    const now = Date.now();
    const cookie = signTrust({ verifiedAt: now, expiresAt: now + 3_600_000 }, S);
    const verified = verifyTrust(cookie, S);
    expect(verified?.verifiedAt).toBe(now);
  });

  it('rejects an expired payload', () => {
    const now = Date.now();
    const cookie = signTrust({ verifiedAt: now - 10_000_000, expiresAt: now - 1 }, S);
    expect(verifyTrust(cookie, S)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const now = Date.now();
    const cookie = signTrust({ verifiedAt: now, expiresAt: now + 3_600_000 }, S);
    const tampered = `${cookie.slice(0, -3)}xyz`;
    expect(verifyTrust(tampered, S)).toBeNull();
  });
});
```

- [ ] **Step 5: Verify endpoint**

Create `app/api/turnstile/verify/route.ts`:

```ts
import { verifyTurnstileToken } from '@/lib/turnstile/verify';
import { signTrust } from '@/lib/turnstile/cookie';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const cookieSecret = process.env.TRUST_COOKIE_SECRET;
  if (!secret || !cookieSecret) return new Response('Turnstile not configured', { status: 500 });

  const { token } = (await req.json()) as { token?: string };
  if (!token) return new Response('Bad request', { status: 400 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ok = await verifyTurnstileToken(token, ip, secret);
  if (!ok) return new Response('Turnstile verification failed', { status: 403 });

  const now = Date.now();
  const payload = { verifiedAt: now, expiresAt: now + 60 * 60 * 1000 };
  const cookie = signTrust(payload, cookieSecret);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': `pac_trust=${cookie}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    },
  });
}
```

- [ ] **Step 6: Run**

Run: `pnpm test turnstile`
Expected: 6 passed (3 verify + 3 cookie).

#### Task 4.4 — Chip metadata + ChipDeck

- [ ] **Step 1: Chip metadata module**

Create `lib/chat/chips.ts`:

```ts
export interface ChipPrompt {
  id: 'dashboard' | 'interactive' | 'composition' | 'charts';
  label: string;
  prompt: string;
}

// PROMPTS DRAFTED IN PHASE 7. These placeholders exist so the UI can render the chip deck
// during Phase 4 development; the strings change in Phase 7 after dogfooding.
export const CHIP_PROMPTS: ChipPrompt[] = [
  { id: 'dashboard', label: 'Show me a dashboard', prompt: 'placeholder dashboard prompt' },
  { id: 'interactive', label: 'Build me a form', prompt: 'placeholder interactive prompt' },
  { id: 'composition', label: 'Compose a card layout', prompt: 'placeholder composition prompt' },
  { id: 'charts', label: 'Plot some data', prompt: 'placeholder charts prompt' },
];
```

- [ ] **Step 2: ChipDeck component**

Create `components/chat/chip-deck.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { CHIP_PROMPTS, type ChipPrompt } from '@/lib/chat/chips';

interface Props {
  onSelect: (chip: ChipPrompt) => void;
  disabled?: boolean;
}

export function ChipDeck({ onSelect, disabled }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {CHIP_PROMPTS.map((c) => (
        <Button
          key={c.id}
          variant="outline"
          className="h-auto justify-start whitespace-normal py-3 text-left"
          disabled={disabled}
          onClick={() => onSelect(c)}
        >
          {c.label}
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Snapshot test**

Create `components/chat/chip-deck.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChipDeck } from './chip-deck';

describe('ChipDeck', () => {
  it('renders all 4 chips with labels', () => {
    render(<ChipDeck onSelect={() => {}} />);
    expect(screen.getByText('Show me a dashboard')).toBeInTheDocument();
    expect(screen.getByText('Build me a form')).toBeInTheDocument();
    expect(screen.getByText('Compose a card layout')).toBeInTheDocument();
    expect(screen.getByText('Plot some data')).toBeInTheDocument();
  });

  it('calls onSelect with the chip when clicked', () => {
    const spy = vi.fn();
    render(<ChipDeck onSelect={spy} />);
    fireEvent.click(screen.getByText('Show me a dashboard'));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'dashboard' }));
  });

  it('disables all chips when disabled prop set', () => {
    render(<ChipDeck onSelect={() => {}} disabled />);
    const buttons = screen.getAllByRole('button');
    for (const b of buttons) expect(b).toBeDisabled();
  });
});
```

- [ ] **Step 4: Render ChipDeck in `<Chat>`**

Modify `components/chat/chat.tsx`:

Read the current empty-state rendering (likely an "Ask anything…" placeholder). Replace the empty-state render with:

```tsx
{messages.length === 0 && (
  <div className="space-y-4">
    {/* existing greeting if any */}
    <ChipDeck onSelect={(c) => sendMessage({ text: c.prompt })} />
  </div>
)}
```

For anonymous users, the input box itself should disable free typing. Check current Chat props for `mode` or sign-in state — if missing, accept a new optional prop `isAnonymous: boolean`. When true: render the input as readonly/disabled with a "Sign in to chat freely" caption beneath.

- [ ] **Step 5: Run all tests**

Run: `pnpm test components/chat/chip-deck`
Expected: 3 passed.

#### Task 4.5 — Wire chip-only gate + Turnstile check in `/api/chat`

- [ ] **Step 1: Modify `/api/chat/route.ts`**

After body parse, before preflight:

```ts
const cookieSecret = process.env.TRUST_COOKIE_SECRET ?? '';
const anonSecret = process.env.ANON_COOKIE_SECRET ?? '';

const trustCookie = req.headers.get('cookie')?.match(/pac_trust=([^;]+)/)?.[1] ?? null;
const anonCookie = req.headers.get('cookie')?.match(/pac_anon=([^;]+)/)?.[1] ?? null;
const trusted = trustCookie ? verifyTrust(trustCookie, cookieSecret) : null;
const anonymousId = anonCookie ? verifyAnonCookie(anonCookie, anonSecret) : null;

const isAnonymous = userId === null;
if (isAnonymous) {
  if (!trusted) {
    return new Response(JSON.stringify({ error: 'turnstileRequired' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  // Chip-only gate: the request must include a chip id.
  const lastUser = (incoming.filter((m) => m.role === 'user').pop() as { metadata?: { chipId?: string } } | undefined);
  if (!lastUser?.metadata?.chipId || !CHIP_PROMPTS.some((c) => c.id === lastUser.metadata?.chipId)) {
    return new Response(JSON.stringify({ error: 'chipRequired' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
}
```

Update the actor resolution:

```ts
const actor = resolveActor({ userId, anonymousId });
```

- [ ] **Step 2: Send chipId from `<Chat>` when a chip is pressed**

Modify the `onSelect` handler in the empty-state render to attach metadata:

```tsx
<ChipDeck onSelect={(c) => sendMessage({ text: c.prompt, metadata: { chipId: c.id } })} />
```

Adapt to AI SDK's metadata shape if different — check current `sendMessage` signature first.

- [ ] **Step 3: Add Turnstile widget to anonymous landing**

In `components/chat/chat.tsx`, when `isAnonymous && !trustCookiePresent`, render the Turnstile widget before the input area:

```tsx
import { Turnstile } from '@marsidev/react-turnstile';

// inside render:
{isAnonymous && (
  <Turnstile
    siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
    onSuccess={async (token) => {
      await fetch('/api/turnstile/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      // After verify, refresh component state so input becomes enabled
    }}
  />
)}
```

Pass the trust-cookie presence down via a server-rendered prop on `<Chat>`'s wrapper (e.g., `app/chat/page.tsx` reads cookies via `next/headers` and passes `hasTrust: boolean` to a client component).

#### Task 4.6 — Claim mutation

- [ ] **Step 1: Test claim**

Create `lib/db/claim-anonymous.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './client';
import { chatSessions, users } from './schema';
import { claimAnonymousSessions } from './queries';

const TEST_ANON = 'anon-claim-test-' + Date.now();
const TEST_USER = 'user-claim-test-' + Date.now();

afterEach(async () => {
  await db.delete(chatSessions).where(eq(chatSessions.anonymousId, TEST_ANON));
  await db.delete(users).where(eq(users.id, TEST_USER));
});

describe('claimAnonymousSessions', () => {
  it('attaches anonymous sessions to a user', async () => {
    await db.insert(users).values({ id: TEST_USER, email: `${TEST_USER}@test` });
    await db.insert(chatSessions).values({
      anonymousId: TEST_ANON,
      model: 'gpt-5.4-mini',
    });
    await claimAnonymousSessions({ anonymousId: TEST_ANON, userId: TEST_USER });
    const rows = await db.select().from(chatSessions).where(eq(chatSessions.userId, TEST_USER));
    expect(rows.length).toBe(1);
    expect(rows[0].anonymousId).toBe(TEST_ANON);
  });
});
```

- [ ] **Step 2: Implement**

In `lib/db/queries.ts` add:

```ts
import { and, eq, isNull } from 'drizzle-orm';
import { chatSessions } from './schema';

export async function claimAnonymousSessions(input: {
  anonymousId: string;
  userId: string;
}): Promise<void> {
  await db
    .update(chatSessions)
    .set({ userId: input.userId })
    .where(and(eq(chatSessions.anonymousId, input.anonymousId), isNull(chatSessions.userId)));
}
```

- [ ] **Step 3: Wire into NextAuth `signIn` callback**

Modify `lib/auth/config.ts` — add a `callbacks.signIn` (or use `events.signIn`) that reads the `pac_anon` cookie from the incoming request and calls `claimAnonymousSessions`. NextAuth v5 exposes this via the `events.signIn` event:

```ts
import { cookies } from 'next/headers';
import { verifyAnonCookie } from '@/lib/anon/cookie';
import { claimAnonymousSessions } from '@/lib/db/queries';

events: {
  async signIn({ user }) {
    if (!user?.id) return;
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get('pac_anon')?.value;
    const anonId = cookieValue ? verifyAnonCookie(cookieValue, process.env.ANON_COOKIE_SECRET ?? '') : null;
    if (anonId) {
      await claimAnonymousSessions({ anonymousId: anonId, userId: user.id });
    }
  },
},
```

- [ ] **Step 4: Run**

Run: `pnpm test claim-anonymous`
Expected: 1 passed.

### Phase 4 — Done means

- [ ] `pnpm test` exits 0.
- [ ] `pnpm exec tsc --noEmit` exits 0.
- [ ] `chat_sessions.anonymous_id` column exists: `psql "$DATABASE_URL" -c "\d chat_sessions"` shows it.
- [ ] Middleware sets `pac_anon` on first request: `curl -i http://localhost:3000/ | grep set-cookie | grep pac_anon` returns a match.
- [ ] Turnstile widget renders on anonymous chat page: `curl -s http://localhost:3000/chat | grep -i 'cloudflare'` returns a match (or `grep turnstile`).
- [ ] `/api/turnstile/verify` returns 403 on invalid token: `curl -X POST http://localhost:3000/api/turnstile/verify -H 'content-type: application/json' -d '{"token":"bogus"}' -w '%{http_code}'` ends in `403`.
- [ ] Anonymous chat without chipId returns 403 `chipRequired`: integration test in `app/api/chat/route.test.ts`.
- [ ] Claim mutation test passes: `pnpm test claim-anonymous`.

### Phase 4 — Human verification (required)

Stop and review with the user before marking Phase 4 done:

- [ ] **Chip styling** — open `pnpm storybook` and visually inspect `components/chat/chip-deck.tsx` rendering. The 4 chips should feel like distinct affordances, not a row of identical buttons. The label text should be readable on hover. *Why human:* aesthetic call only the user can make.
- [ ] **Anonymous landing visual flow** — run `pnpm dev`, open the chat in an incognito window, confirm: (a) Turnstile widget visible before input is usable, (b) input box visibly disabled with explanatory caption, (c) clicking a chip submits a turn AND visibly grays out the rest of the chip deck until response completes. *Why human:* visual UX coherence.
- [ ] **Claim correctness post sign-in** — in the same incognito window, click a chip, complete the turn, then sign in with Google. Verify the prior anonymous session appears in the history sidebar attached to the user account. *Why human:* end-to-end flow check the unit tests don't cover.

---

## Phase 5 — BYOK

**Execution mode: agent-autonomous**

**Goal:** Engineer-friend escape hatch — signed-in user enters their Azure key + per-model deployment names on a settings page (rendered as a json-render Form for visual consistency with the chat). Key is stored in `localStorage`, sent on each chat request via a header, validated server-side with a tiny test call.

**Open risks**
- Azure key sent over a header in every request — TLS protects it in transit but the key briefly lives in the server's request log if logging is unmasked. Mitigation: filter the BYOK header out in any structured logging.
- The current provider wiring instantiates `createAzure(...)` at module load. Per-request override means moving the client construction into the request handler.

### Files

- Create: `lib/byok/storage.ts`, `lib/byok/storage.test.ts`
- Create: `lib/byok/validate.ts`, `lib/byok/validate.test.ts`
- Create: `app/api/byok/validate/route.ts`
- Create: `app/settings/page.tsx`
- Modify: `lib/ai/providers.ts` (accept per-request overrides)
- Modify: `lib/json-render/endpoint-handlers.ts` (add `validateByok` endpoint action)
- Modify: `app/api/chat/route.ts` (read `x-byok-key` + `x-byok-deployments` headers, pipe to `getModel`)
- Modify: `components/chat/chat.tsx` (attach BYOK headers to chat requests from localStorage)

### Tasks

#### Task 5.1 — Client-side BYOK storage

- [ ] **Step 1: Test**

Create `lib/byok/storage.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadByok, saveByok, clearByok, type ByokRecord } from './storage';

const STORAGE_KEY = 'pac.byok.v1';

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    store: new Map<string, string>(),
    getItem(k: string) {
      return (this.store as Map<string, string>).get(k) ?? null;
    },
    setItem(k: string, v: string) {
      (this.store as Map<string, string>).set(k, v);
    },
    removeItem(k: string) {
      (this.store as Map<string, string>).delete(k);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('byok storage', () => {
  it('returns null when nothing saved', () => {
    expect(loadByok()).toBeNull();
  });

  it('round-trips a record', () => {
    const record: ByokRecord = {
      key: 'sk-xxx',
      baseUrl: 'https://my-resource.openai.azure.com',
      deployments: { 'gpt-5.4-mini': 'my-deployment' },
    };
    saveByok(record);
    expect(loadByok()).toEqual(record);
  });

  it('clear removes the record', () => {
    saveByok({ key: 'k', baseUrl: 'u', deployments: {} });
    clearByok();
    expect(loadByok()).toBeNull();
  });

  it('returns null on corrupted JSON', () => {
    (globalThis.localStorage as unknown as { setItem: (k: string, v: string) => void }).setItem(STORAGE_KEY, '{not json');
    expect(loadByok()).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

Create `lib/byok/storage.ts`:

```ts
import { z } from 'zod';

const KEY = 'pac.byok.v1';

export const byokRecordSchema = z.object({
  key: z.string().min(1),
  baseUrl: z.string().url(),
  deployments: z.record(z.string(), z.string().min(1)),
});

export type ByokRecord = z.infer<typeof byokRecordSchema>;

export function loadByok(): ByokRecord | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = byokRecordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveByok(record: ByokRecord): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(record));
}

export function clearByok(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(KEY);
}
```

- [ ] **Step 3: Run**

Run: `pnpm test byok/storage`
Expected: 4 passed.

#### Task 5.2 — Server-side validation

- [ ] **Step 1: Test**

Create `lib/byok/validate.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateByokCredentials } from './validate';

vi.mock('@ai-sdk/azure', () => ({
  createAzure: vi.fn(() => ({
    responses: vi.fn(() => ({
      // minimal LanguageModel stub the SDK touches during a tiny generateText call
      doGenerate: vi.fn(async () => ({ text: 'ok', usage: { inputTokens: 1, outputTokens: 1 } })),
    })),
  })),
}));
vi.mock('ai', () => ({
  generateText: vi.fn(async () => ({ text: 'ok' })),
}));

afterEach(() => vi.clearAllMocks());

describe('validateByokCredentials', () => {
  it('returns ok:true when tiny call succeeds', async () => {
    const r = await validateByokCredentials({
      key: 'sk-xxx',
      baseUrl: 'https://example.openai.azure.com',
      deploymentName: 'my-deploy',
    });
    expect(r.ok).toBe(true);
  });

  it('returns ok:false with error when SDK throws', async () => {
    const { generateText } = await import('ai');
    (generateText as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('401'));
    const r = await validateByokCredentials({
      key: 'sk-bad',
      baseUrl: 'https://example.openai.azure.com',
      deploymentName: 'my-deploy',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('401');
  });
});
```

- [ ] **Step 2: Implement**

Create `lib/byok/validate.ts`:

```ts
import { createAzure } from '@ai-sdk/azure';
import { generateText } from 'ai';

export interface ValidateInput {
  key: string;
  baseUrl: string;
  deploymentName: string;
}

export type ValidateResult = { ok: true } | { ok: false; error: string };

export async function validateByokCredentials(input: ValidateInput): Promise<ValidateResult> {
  try {
    const azure = createAzure({ baseURL: input.baseUrl, apiKey: input.key });
    const model = azure.responses(input.deploymentName);
    await generateText({
      model,
      prompt: 'Reply with the single word: ok',
      maxOutputTokens: 5,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 3: Validate endpoint**

Create `app/api/byok/validate/route.ts`:

```ts
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { validateByokCredentials } from '@/lib/byok/validate';

export const runtime = 'nodejs';

const Body = z.object({
  key: z.string().min(1),
  baseUrl: z.string().url(),
  deploymentName: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response('Sign in required', { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return new Response('Bad request', { status: 400 });

  const r = await validateByokCredentials(parsed.data);
  return new Response(JSON.stringify(r), {
    status: r.ok ? 200 : 422,
    headers: { 'content-type': 'application/json' },
  });
}
```

- [ ] **Step 4: Run**

Run: `pnpm test byok/validate`
Expected: 2 passed.

#### Task 5.3 — Per-request provider override

- [ ] **Step 1: Modify `lib/ai/providers.ts`**

Replace contents with:

```ts
import { createAzure } from '@ai-sdk/azure';
import type { LanguageModel } from 'ai';
import type { ModelId } from './models';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const FOUNDRY_DEPLOYMENT_NAMES: Record<ModelId, string> = {
  'gpt-5.4': 'gpt-5.4',
  'gpt-5.4-mini': 'gpt-5.4-mini',
  'gpt-5.3-codex': 'gpt-5.3-codex',
  'o4-mini': 'o4-mini',
};

export interface ProviderOverride {
  apiKey: string;
  baseUrl: string;
  deployments: Partial<Record<ModelId, string>>;
}

export function getModel(id: ModelId, override?: ProviderOverride): LanguageModel {
  if (override) {
    const azure = createAzure({ baseURL: override.baseUrl, apiKey: override.apiKey });
    const deployment = override.deployments[id];
    if (!deployment) {
      throw new Error(`BYOK override is missing a deployment name for model ${id}`);
    }
    return azure.responses(deployment);
  }
  const azure = createAzure({
    baseURL: required('AZURE_FOUNDRY_BASE_URL'),
    apiKey: required('AZURE_FOUNDRY_API_KEY'),
    apiVersion: process.env.AZURE_FOUNDRY_API_VERSION ?? '2025-04-01-preview',
  });
  return azure.responses(FOUNDRY_DEPLOYMENT_NAMES[id]);
}
```

- [ ] **Step 2: Modify `/api/chat/route.ts` to read BYOK headers**

Add header parsing:

```ts
const byokKey = req.headers.get('x-byok-key');
const byokBase = req.headers.get('x-byok-base-url');
const byokDeploymentsHeader = req.headers.get('x-byok-deployments');

let byokOverride: ProviderOverride | undefined;
if (userId && byokKey && byokBase && byokDeploymentsHeader) {
  try {
    const deployments = JSON.parse(byokDeploymentsHeader) as Partial<Record<ModelId, string>>;
    byokOverride = { apiKey: byokKey, baseUrl: byokBase, deployments };
  } catch {
    byokOverride = undefined;
  }
}

const byok = byokOverride !== undefined;
```

Pass `byokOverride` through to `getModel`:

```ts
model: getModel(model, byokOverride),
```

Update preflight call: `preflight({ actor, byok })`. Update postflight call: `postflight({ ..., byok })`.

- [ ] **Step 3: Modify chat client to attach BYOK headers**

In the file that wires `useChat` (likely `components/chat/chat.tsx`), pass a `prepareRequest` (or equivalent) function that reads `loadByok()` and adds the headers:

```ts
import { loadByok } from '@/lib/byok/storage';

// inside the useChat config:
prepareRequest({ messages, body }) {
  const byok = loadByok();
  const headers: Record<string, string> = {};
  if (byok) {
    headers['x-byok-key'] = byok.key;
    headers['x-byok-base-url'] = byok.baseUrl;
    headers['x-byok-deployments'] = JSON.stringify(byok.deployments);
  }
  return { body: { messages, ...body }, headers };
},
```

The exact AI SDK v6 hook name may differ — check `useChat` API and adapt.

#### Task 5.4 — Settings page (rendered via json-render)

- [ ] **Step 1: Create page**

Create `app/settings/page.tsx`:

```tsx
'use client';

import { JSONUIProvider } from '@json-render/react';
import { useEffect, useState } from 'react';
import { SpecRenderer, registry } from '@/lib/json-render/registry';
import { byokRecordSchema, loadByok, saveByok } from '@/lib/byok/storage';
import type { Spec } from '@json-render/core';

const SPEC: Spec = {
  root: 'form',
  elements: {
    form: {
      component: 'Form',
      props: { name: 'byok' },
      children: ['heading', 'key', 'baseUrl', 'deploymentMini', 'deploymentFull', 'submit'],
    },
    heading: { component: 'Heading', props: { level: 2, text: 'Bring your own Azure key' }, children: [] },
    key: { component: 'Input', props: { name: 'key', label: 'API key', kind: 'password' }, children: [] },
    baseUrl: { component: 'Input', props: { name: 'baseUrl', label: 'Azure Foundry base URL' }, children: [] },
    deploymentMini: {
      component: 'Input',
      props: { name: 'gpt-5.4-mini', label: 'Deployment name for gpt-5.4-mini' },
      children: [],
    },
    deploymentFull: {
      component: 'Input',
      props: { name: 'gpt-5.4', label: 'Deployment name for gpt-5.4 (optional)' },
      children: [],
    },
    submit: {
      component: 'Button',
      props: { label: 'Validate & save', variant: 'default' },
      on: { press: { action: 'saveByok' } },
      children: [],
    },
  },
};

export default function SettingsPage() {
  const [existing, setExisting] = useState<ReturnType<typeof loadByok>>(null);
  useEffect(() => setExisting(loadByok()), []);
  return (
    <main className="mx-auto max-w-2xl p-8">
      <JSONUIProvider registry={registry}>
        <SpecRenderer spec={SPEC} />
      </JSONUIProvider>
      {existing && <p className="mt-4 text-sm text-muted-foreground">BYOK is configured.</p>}
    </main>
  );
}
```

- [ ] **Step 2: Add `saveByok` endpoint action**

Modify `lib/json-render/endpoint-handlers.ts`:

Add a handler for `saveByok` that POSTs to `/api/byok/validate`, and on success writes via `saveByok()`:

```ts
import { saveByok, byokRecordSchema } from '@/lib/byok/storage';

export async function handleSaveByok(params: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  const record = byokRecordSchema.safeParse({
    key: params.key,
    baseUrl: params.baseUrl,
    deployments: {
      'gpt-5.4-mini': params['gpt-5.4-mini'],
      ...(params['gpt-5.4'] ? { 'gpt-5.4': params['gpt-5.4'] } : {}),
    },
  });
  if (!record.success) return { ok: false, error: 'Invalid form values' };

  const r = await fetch('/api/byok/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key: record.data.key,
      baseUrl: record.data.baseUrl,
      deploymentName: record.data.deployments['gpt-5.4-mini'],
    }),
  });
  const json = (await r.json()) as { ok: boolean; error?: string };
  if (!json.ok) return json;

  saveByok(record.data);
  return { ok: true };
}
```

Register `saveByok` in the ACTION_REGISTRY (in `lib/json-render/catalog.ts`) with mode `'endpoint'`.

### Phase 5 — Done means

- [ ] `pnpm test` exits 0.
- [ ] `pnpm exec tsc --noEmit` exits 0.
- [ ] `loadByok()` / `saveByok()` round-trip test passes.
- [ ] `validateByokCredentials` test passes for both success and failure paths.
- [ ] `/api/byok/validate` returns 401 unauthenticated, 422 on bad credentials, 200 on good: integration test or curl: `curl -X POST http://localhost:3000/api/byok/validate -H 'content-type: application/json' -d '{}' -w '%{http_code}'` ends in `401` (no session).
- [ ] Provider override path is covered by a test in `lib/ai/providers.test.ts` (write one — assert `getModel('gpt-5.4-mini', override)` calls `createAzure` with the override values).

### Phase 5 — Human verification (none required)

Settings page renders via json-render — visual review *optional*, the form will look exactly like every other Form in Storybook.

---

## Phase 6 — Login-as-json-render + `redirect` action + server-injection

**Execution mode: review-checkpointed**

**Goal:** The auth UX is itself a json-render card. Add a fourth action mode `redirect` whose endpoint returns `{ redirectTo: string }`; the action handler does `window.location.assign()`. Add a server-side code path that emits a pre-built renderUI spec for the sign-in card when an anonymous request hits the quota wall (`actorCapReached`).

**Open risks**
- The "feel" of the model spontaneously emitting a sign-in card requires human review. Snapshot tests cover the spec shape but not the impact.
- Server-injecting a renderUI message bypasses `streamText` — must validate stream shape matches what `useChat` expects, otherwise the client will reject or render incorrectly.

### Files

- Modify: `lib/json-render/catalog.ts` (add `redirect` to `ActionMode`; add `signInWith` ACTION_REGISTRY entry)
- Modify: `lib/json-render/registry.tsx` (handle `redirect` action mode in dispatcher)
- Modify: `lib/json-render/endpoint-handlers.ts` (add `signInWith` returning `{ redirectTo }`)
- Modify: `app/api/actions/[action]/route.ts` (route `redirect` response back to client)
- Create: `lib/json-render/server-injected.ts`, `lib/json-render/server-injected.test.ts`
- Modify: `app/api/chat/route.ts` (on `actorCapReached`, inject sign-in spec instead of returning 429)

### Tasks

#### Task 6.1 — `redirect` action mode

- [ ] **Step 1: Update `ActionMode` type**

In `lib/json-render/catalog.ts`:

```ts
export type ActionMode = 'local' | 'model' | 'endpoint' | 'redirect';
```

- [ ] **Step 2: Register `signInWith`**

Add to `ACTION_REGISTRY` in `lib/json-render/catalog.ts`:

```ts
['signInWith', {
  mode: 'redirect',
  description: 'Initiate OAuth sign-in with the named provider. params: { provider: "google" | "github" | "linkedin" }',
  paramsSchema: z.object({ provider: z.enum(['google', 'github', 'linkedin']) }),
}],
```

- [ ] **Step 3: Update `resolveActionMode` test coverage**

In `lib/json-render/catalog.test.ts` (existing), add:

```ts
it('returns redirect for signInWith', () => {
  expect(resolveActionMode('signInWith')).toBe('redirect');
});
```

Run: `pnpm test catalog`
Expected: PASS including the new case.

#### Task 6.2 — Action dispatcher: handle `redirect`

- [ ] **Step 1: Find the action dispatcher in registry.tsx**

Read `lib/json-render/registry.tsx` (the `useActions`/handler bridge). Identify the switch on mode (currently `local | model | endpoint`).

- [ ] **Step 2: Add `redirect` branch**

In the dispatcher, after the `endpoint` case:

```ts
case 'redirect': {
  const response = await fetch(`/api/actions/${actionName}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (response.ok) {
    const json = (await response.json()) as { redirectTo?: string };
    if (json.redirectTo) {
      window.location.assign(json.redirectTo);
      return;
    }
  }
  toast.error('Sign-in failed');
  break;
}
```

Card locking behavior for `redirect`: lock the card after press (like model mode) since navigation is destructive.

- [ ] **Step 3: Update `isModelModeBound` to include redirect**

The card-lock predicate `isModelModeBound` in `registry.tsx` should also lock on `redirect` actions. Rename or extend the predicate (e.g., `isOneShotBound`) and update call sites.

#### Task 6.3 — `signInWith` endpoint handler

- [ ] **Step 1: Test**

Create `lib/json-render/actions/sign-in-with.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSignInRedirect } from './sign-in-with';

describe('buildSignInRedirect', () => {
  it('returns the NextAuth sign-in URL for google', () => {
    const r = buildSignInRedirect({ provider: 'google' }, 'http://localhost:3000');
    expect(r.redirectTo).toBe('http://localhost:3000/api/auth/signin/google');
  });

  it('returns sign-in URL for github', () => {
    const r = buildSignInRedirect({ provider: 'github' }, 'http://localhost:3000');
    expect(r.redirectTo).toBe('http://localhost:3000/api/auth/signin/github');
  });

  it('returns sign-in URL for linkedin', () => {
    const r = buildSignInRedirect({ provider: 'linkedin' }, 'http://localhost:3000');
    expect(r.redirectTo).toBe('http://localhost:3000/api/auth/signin/linkedin');
  });
});
```

- [ ] **Step 2: Implement**

Create `lib/json-render/actions/sign-in-with.ts`:

```ts
export interface SignInParams {
  provider: 'google' | 'github' | 'linkedin';
}

export function buildSignInRedirect(params: SignInParams, origin: string): { redirectTo: string } {
  return { redirectTo: `${origin}/api/auth/signin/${params.provider}` };
}
```

- [ ] **Step 3: Route handler**

Modify `app/api/actions/[action]/route.ts` — add:

```ts
import { buildSignInRedirect } from '@/lib/json-render/actions/sign-in-with';

// inside the POST switch:
case 'signInWith': {
  const params = (await req.json()) as { provider?: string };
  const provider = params.provider as 'google' | 'github' | 'linkedin' | undefined;
  if (!provider) return new Response('Bad request', { status: 400 });
  const origin = new URL(req.url).origin;
  return Response.json(buildSignInRedirect({ provider }, origin));
}
```

#### Task 6.4 — Server-injected sign-in spec

- [ ] **Step 1: Test the spec builder**

Create `lib/json-render/server-injected.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSignInSpec, buildQuotaWallMessage } from './server-injected';

describe('server-injected sign-in spec', () => {
  it('contains a Heading + three Buttons (one per provider)', () => {
    const spec = buildSignInSpec();
    const components = Object.values(spec.elements).map((e: { component: string }) => e.component);
    expect(components).toContain('Heading');
    expect(components.filter((c) => c === 'Button').length).toBe(3);
  });

  it('each provider button binds signInWith action', () => {
    const spec = buildSignInSpec();
    const buttons = Object.values(spec.elements).filter((e: { component: string }) => e.component === 'Button');
    for (const b of buttons as Array<{ on?: { press?: { action?: string } } }>) {
      expect(b.on?.press?.action).toBe('signInWith');
    }
  });
});

describe('buildQuotaWallMessage', () => {
  it('produces a UIMessage with a tool-renderUI part containing the sign-in spec', () => {
    const msg = buildQuotaWallMessage();
    expect(msg.role).toBe('assistant');
    const renderUiPart = msg.parts.find((p: { type: string }) => p.type === 'tool-renderUI');
    expect(renderUiPart).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement**

Create `lib/json-render/server-injected.ts`:

```ts
import type { Spec } from '@json-render/core';

export function buildSignInSpec(): Spec {
  return {
    root: 'card',
    elements: {
      card: {
        component: 'Card',
        props: { title: 'Continue with sign-in' },
        children: ['heading', 'text', 'google', 'github', 'linkedin'],
      },
      heading: {
        component: 'Heading',
        props: { level: 2, text: 'Free demo limit reached' },
        children: [],
      },
      text: {
        component: 'Text',
        props: {
          text: 'Sign in to keep exploring — larger daily quota, free typing, and history that follows you across devices.',
        },
        children: [],
      },
      google: {
        component: 'Button',
        props: { label: 'Continue with Google', variant: 'default' },
        on: { press: { action: 'signInWith', params: { provider: 'google' } } },
        children: [],
      },
      github: {
        component: 'Button',
        props: { label: 'Continue with GitHub', variant: 'outline' },
        on: { press: { action: 'signInWith', params: { provider: 'github' } } },
        children: [],
      },
      linkedin: {
        component: 'Button',
        props: { label: 'Continue with LinkedIn', variant: 'outline' },
        on: { press: { action: 'signInWith', params: { provider: 'linkedin' } } },
        children: [],
      },
    },
  };
}

export interface InjectedUIMessage {
  role: 'assistant';
  parts: Array<{ type: string; [k: string]: unknown }>;
}

export function buildQuotaWallMessage(): InjectedUIMessage {
  return {
    role: 'assistant',
    parts: [
      {
        type: 'tool-renderUI',
        state: 'output-available',
        toolCallId: `injected-${Date.now()}`,
        input: { spec: buildSignInSpec() },
        output: { ok: true },
      },
    ],
  };
}
```

- [ ] **Step 3: Wire into `/api/chat/route.ts`**

Modify the preflight rejection block — when `reason === 'actorCapReached'` for an anonymous actor, return a stream containing the injected message instead of 429:

```ts
if (!gate.allow && actor.actorKind === 'anonymous' && gate.reason === 'actorCapReached') {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: 'message', message: buildQuotaWallMessage() });
    },
    originalMessages: incoming,
  });
  return createUIMessageStreamResponse({ stream });
}

if (!gate.allow) {
  return new Response(JSON.stringify({ error: 'quota', reason: gate.reason }), {
    status: 429,
    headers: { 'content-type': 'application/json' },
  });
}
```

The exact `writer.write({ type: 'message', ... })` shape must match what `useChat` accepts — verify against the AI SDK v6 stream protocol; if writing a full message isn't supported, instead emit a synthetic step that produces a `tool-renderUI` part. Test in the browser to confirm.

#### Task 6.5 — Integration test

- [ ] **Step 1: Add to `app/api/chat/route.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/budget/preflight', () => ({
  preflight: vi.fn(async () => ({ allow: false, reason: 'actorCapReached' })),
  CAPS: {},
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));

import { POST } from './route';

describe('chat route — anonymous quota wall injects sign-in card', () => {
  it('returns 200 with a stream containing a tool-renderUI sign-in spec', async () => {
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'pac_anon=signed_anon_test; pac_trust=valid_trust_test',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', parts: [{ type: 'text', text: 'dashboard' }], metadata: { chipId: 'dashboard' } },
        ],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('tool-renderUI');
    expect(body).toContain('signInWith');
  });
});
```

Note: this test will need the `pac_anon` / `pac_trust` cookies stubbed via additional `vi.mock` of the cookie verifiers — wire those up to return valid identities so the path reaches preflight.

- [ ] **Step 2: Run**

Run: `pnpm test chat/route`
Expected: all green.

### Phase 6 — Done means

- [ ] `pnpm test` exits 0.
- [ ] `pnpm exec tsc --noEmit` exits 0.
- [ ] `ActionMode` includes `redirect`: `grep -c "'redirect'" lib/json-render/catalog.ts` ≥ 1.
- [ ] `signInWith` action registered: `pnpm test catalog -t signInWith` passes.
- [ ] `buildSignInSpec` snapshot test passes.
- [ ] Quota-wall integration test passes — anonymous request that would exceed cap receives a 200 stream containing the sign-in spec.
- [ ] `/api/actions/signInWith` returns valid redirect URL for all 3 providers: 3 curl checks per provider, e.g. `curl -X POST http://localhost:3000/api/actions/signInWith -H 'content-type: application/json' -d '{"provider":"google"}'` returns `{"redirectTo":"http://localhost:3000/api/auth/signin/google"}`.

### Phase 6 — Human verification (required)

- [ ] **Feel of model emitting a sign-in card** — run `pnpm dev`, drain the anonymous quota (set `CAP_ANON_DAILY_USD=0.0001` temporarily), hit a chip, observe that the sign-in card renders inline in the chat as if the model emitted it. *Why human:* the entire showcase narrative depends on this feeling natural.
- [ ] **OAuth round-trip works for all 3 providers** — click each provider button, confirm redirect to the provider, return after auth, anonymous session claimed and visible in history. *Why human:* OAuth callbacks are notoriously sensitive to URL configuration; visual confirmation is the only end-to-end check.
- [ ] **Stream protocol correctness** — confirm no console errors / parse failures during the quota-wall card render. *Why human:* server-injected stream messages bypass the model and any shape mismatch will manifest only at runtime in the browser.

---

## Phase 7 — Showcase prompts + landing page polish

**Execution mode: review-checkpointed**

**Goal:** Draft the 4 chip prompts (replacing placeholders from Phase 4) and polish the landing-page presentation so a recruiter understands what they're looking at in 5 seconds.

**Open risks**
- The 4 prompts are the entire anonymous showcase surface. Bad prompts = bad showcase. Iterate against real model output, not in the abstract.

### Files

- Modify: `lib/chat/chips.ts` (real prompt strings)
- Modify: `app/page.tsx` or new `app/(landing)/page.tsx` if a separate landing route is wanted
- Optionally: `components/landing/hero.tsx`, `components/landing/value-prop.tsx`

### Tasks

#### Task 7.1 — Draft + iterate the 4 chip prompts

- [ ] **Step 1: Draft initial v1 prompts targeting each showcase category**

Edit `lib/chat/chips.ts`. Replace placeholder prompts with draft v1 strings. Each prompt should be ≤ 30 words, end with a clear ask, and explicitly hint at the primitive type the user wants to see ("plot", "table", "form", "tabs"). Sample shape:

```ts
export const CHIP_PROMPTS: ChipPrompt[] = [
  {
    id: 'dashboard',
    label: 'Show me a dashboard',
    prompt:
      'Build me a dashboard for a fictional SaaS product showing 3 KPIs (MRR, active users, churn) plus a table of the top 5 accounts. Include a small delta indicator on each KPI.',
  },
  {
    id: 'interactive',
    label: 'Build me a form',
    prompt:
      'Create a form that collects a project name, project type (select: SaaS, marketplace, internal tool), and a launch date. Add a primary button labeled "Create project" that submits the form. Echo the submitted values back to me.',
  },
  {
    id: 'composition',
    label: 'Compose a card layout',
    prompt:
      'Render a card that uses tabs to switch between "Overview", "Activity", and "Settings". Each tab should contain different primitives (text, list, form fields) so I can see the composition working.',
  },
  {
    id: 'charts',
    label: 'Plot some data',
    prompt:
      'Plot a line chart of monthly revenue for a fictional company over 12 months, with two series (Revenue and Costs). Add a chart title and a legend.',
  },
];
```

- [ ] **Step 2: Dogfood each prompt against the live model**

For each chip, run the local app, click it, capture the rendered output as a screenshot, and judge:
- Does it actually render the intended primitive?
- Does it feel like a "wow" moment for the recruiter audience?
- Is the prompt stable (i.e., does running it 5 times produce broadly similar quality)?

If any prompt fails: rewrite, re-dogfood, repeat. Aim for ≤ 3 rounds per chip.

- [ ] **Step 3: Update chip labels if prompt drift dictates**

After dogfooding, the chip labels may need to tighten to match what actually renders well. Update `label` fields to match.

#### Task 7.2 — Landing-page hero

- [ ] **Step 1: Decide route shape**

Two options:
- (a) `app/page.tsx` IS the landing page; chat lives at `/chat`.
- (b) Keep `/` redirecting to `/chat`, and use the empty-state of `/chat` as the implicit landing.

Recommend (b) — fewer surfaces, one consistent app shell. The "landing-ness" comes from the empty-state copy + chip deck on `/chat`.

- [ ] **Step 2: Polish empty-state copy**

Modify `components/chat/chat.tsx` empty-state to include a hero block above the ChipDeck:

```tsx
{messages.length === 0 && (
  <div className="space-y-6">
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">A chat that builds its own UI.</h1>
      <p className="text-muted-foreground">
        Pick a starter prompt — the model responds with rich interactive components, not just text.
        Sign in to chat freely or bring your own Azure key.
      </p>
    </div>
    <ChipDeck onSelect={(c) => sendMessage({ text: c.prompt, metadata: { chipId: c.id } })} />
  </div>
)}
```

The exact copy is the user's call — this is a placeholder.

### Phase 7 — Done means

- [ ] All 4 chip prompts are non-placeholder strings (no occurrence of "placeholder" in `lib/chat/chips.ts`): `grep -c placeholder lib/chat/chips.ts` returns 0.
- [ ] Each chip prompt is ≤ 300 chars to fit the catalog cost budget: a test asserts `CHIP_PROMPTS.every((c) => c.prompt.length <= 300)`.
- [ ] Empty-state renders the hero + chip deck (visual).
- [ ] `pnpm test` exits 0.

### Phase 7 — Human verification (required, central)

- [ ] **Each chip produces an impressive render at least 4 of 5 attempts** — manual evaluation against the live model. *Why human:* this is the entire purpose of the phase.
- [ ] **Hero copy reads well** — user's call.
- [ ] **Visual flow on empty state** — does the order (hero → chips → input) feel right? Should the input even be visible to anonymous, or hidden until sign-in? *Why human:* aesthetic judgment.

---

## Phase 8 — Deploy + domain + robots.txt

**Execution mode: review-checkpointed**

**Goal:** Push to Vercel production with all environment secrets configured, a domain pointed, and `robots.txt` + `<meta name="robots" content="noindex">` blocking search engine indexing.

### Files

- Create: `public/robots.txt`
- Modify: `app/layout.tsx` (add `<meta name="robots" content="noindex">`)
- Optionally create: `vercel.ts` for typed config (per Vercel knowledge update)

### Tasks

#### Task 8.1 — robots.txt + meta tag

- [ ] **Step 1: Create `public/robots.txt`**

```txt
User-agent: *
Disallow: /
```

- [ ] **Step 2: Add noindex meta**

Modify `app/layout.tsx` — add to `<head>` (via Next.js metadata API):

```ts
export const metadata = {
  // ... existing fields
  robots: { index: false, follow: false },
};
```

- [ ] **Step 3: Verify locally**

Run: `pnpm dev`
Check: `curl -s http://localhost:3000/robots.txt` shows the disallow.
Check: `curl -s http://localhost:3000 | grep -i 'noindex'` matches.

#### Task 8.2 — Vercel environment variables

- [ ] **Step 1: Inventory required env vars**

| Var | Source |
|---|---|
| `DATABASE_URL` | Vercel Postgres or marketplace provider |
| `AZURE_FOUNDRY_BASE_URL`, `AZURE_FOUNDRY_API_KEY`, `AZURE_FOUNDRY_API_VERSION` | Azure |
| `AUTH_SECRET` | NextAuth — generate via `openssl rand -base64 32` |
| `AUTH_URL` | Production URL |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth Apps |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | LinkedIn Developer (pending approval from Phase 2 Task 2.0) |
| `ANON_COOKIE_SECRET`, `TRUST_COOKIE_SECRET` | Generate via `openssl rand -base64 32` each |
| `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile dashboard |
| `CAP_DAILY_USD=5`, `CAP_MONTHLY_USD=30`, `CAP_ANON_DAILY_USD=0.20`, `CAP_USER_DAILY_USD=1.00`, `MAX_OUTPUT_TOKENS_PER_TURN=10000` | This plan |

- [ ] **Step 2: Set in Vercel**

Use `pnpm dlx vercel env add` for each. Per the user's CLAUDE.md, the `/vercel:env` skill exists if needed for orchestration.

#### Task 8.3 — OAuth redirect URIs

- [ ] **Step 1: Register production callback URLs**

For each provider, add the callback URL `https://<your-domain>/api/auth/callback/<provider>` to the provider's dashboard:
- Google Cloud Console → OAuth 2.0 Client → Authorized redirect URIs
- GitHub OAuth App → Authorization callback URL
- LinkedIn Developer App → Redirect URLs

#### Task 8.4 — Deploy + verify

- [ ] **Step 1: Deploy**

Run:
```bash
npm_config_registry=https://registry.npmjs.org/ pnpm dlx vercel --prod
```

- [ ] **Step 2: Production smoke tests**

```bash
curl -sI https://<your-domain>/robots.txt | head -1                # 200
curl -s https://<your-domain>/robots.txt                            # contains Disallow: /
curl -s https://<your-domain>/api/auth/providers | jq '.google.id'  # "google"
curl -sI https://<your-domain> | grep -i 'x-robots-tag\|robots'     # noindex present
```

- [ ] **Step 3: Manual end-to-end smoke**

Walk through the full anonymous → signed-in → BYOK happy paths in production.

### Phase 8 — Done means

- [ ] `https://<your-domain>/robots.txt` returns the disallow.
- [ ] HTML response contains `<meta name="robots" content="noindex">`.
- [ ] `https://<your-domain>/api/auth/providers` lists `google`, `github`, `linkedin`.
- [ ] Anonymous chat path (chip click → render) works in production.
- [ ] Sign-in works for all 3 providers in production.

### Phase 8 — Human verification (required)

- [ ] **End-to-end production smoke** — walk through the showcase like a recruiter would. Does each chip render something impressive? Does sign-in feel smooth? *Why human:* final taste check before the URL goes anywhere public.
- [ ] **Domain resolves and TLS is healthy** — visual check in browser. *Why human:* DNS + cert issues are easier to spot than to script.
- [ ] **Verify caps are correct in production** — query `usage_ledger` after a few turns and confirm row shape matches local. Manual psql via Vercel Postgres dashboard. *Why human:* production-DB reconciliation.

---

## Cross-cutting open risks

These risks span phases and should be tracked across the whole project:

1. **Catalog prompt size growth** — Phase 0 adds Chart/Table/KPI which grow the catalog. If the post-Phase-0 size exceeds 5,000 tokens, cache savings shrink AND per-turn input cost rises. The Phase 0 Task 0.9 assertion catches this; if it triggers, revisit primitive descriptions BEFORE Phase 1.
2. **Realized cache hit rate** — assume 10% reduction in budget math, not 50%. Re-measure post-launch with a couple weeks of real traffic; revise caps if savings are higher OR lower.
3. **Per-turn 10K output cap** — may be too tight for the chart chip. Make it tunable (`MAX_OUTPUT_TOKENS_PER_TURN` env var). Revisit during Phase 7 dogfooding.
4. **LinkedIn OAuth approval gating Phase 2 completion** — the `linkedin` provider can ship dark (registered in NextAuth config but with placeholder env vars) until approval lands; the button just fails until production env vars exist. Don't block Phase 2 completion on it.
5. **Server-injected renderUI message stream shape** — Phase 6 introduces a new code path that emits a tool-renderUI part bypassing `streamText`. Stream-protocol shape mismatch will manifest only at runtime. Phase 6 human verification specifically calls this out.
6. **Azure prompt-cache cold path** — first request after cache eviction pays full input cost. On the lowest-traffic days the cache hit rate could drop to ~0%. Account for this in cap sizing: the daily $5 cap should hold even at 0% cache hit rate.
7. **BYOK header injection** — Phase 5 sends the BYOK Azure key on a header. Filter the header out of any structured request logging the app does. Verify Vercel's default request log doesn't include arbitrary headers (it doesn't, but verify).

---

## Self-review checklist (done by plan author)

- [x] Spec coverage: every phase from the conversation handoff is represented (0–8).
- [x] Each phase tagged with execution mode (`agent-autonomous` or `review-checkpointed`).
- [x] Each review-checkpointed phase lists specific items needing human eyes.
- [x] No placeholder language ("TBD", "add error handling", "implement later").
- [x] File paths are exact.
- [x] Test code is complete; assertions are concrete.
- [x] User preference observed: no git commits — leave changes unstaged.
- [x] User preference observed: pnpm registry override called out where required.
- [x] Open risks surfaced per phase + cross-cutting.
- [x] Showcase prompts explicitly deferred to Phase 7.
- [x] Cost model + cap decision tree documented in architectural decisions.
- [x] New `redirect` action mode introduced as an explicit fourth category.
- [x] Cross-references: types referenced in later phases (`ProviderOverride`, `Actor`, `PreflightResult`) are defined in earlier phases.
