# AI Chat (Foundry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js 16 chat app that talks to two Azure AI Foundry models (GPT-5.3+ and Kimi K2.6) via an OpenAI-compatible API, with Postgres-backed save/load sessions, a sidebar of past chats, and auto-generated titles.

**Architecture:** Next.js App Router with Server Components for initial session hydration and Route Handlers for streaming. AI SDK v5 (`streamText` + `useChat`) over a single OpenAI-compatible provider configured with two `baseURL`s — one per Foundry deployment. Drizzle ORM against Vercel Postgres (Neon under the hood); sessions and messages are persisted server-side in the `onFinish` callback once a stream completes. The session id for a brand-new chat is emitted as an AI-SDK data event mid-stream and the client `router.replace()`s the URL.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · AI Elements · AI SDK v5 (`ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`) · Drizzle ORM + Vercel Postgres · SWR · next-themes · pnpm · Biome

**User-chosen conventions (don't second-guess):**
- No test suite on day one — replace TDD with manual verification before each commit.
- Per-session model lock-in (composer dropdown, locks after first message).
- Hardcoded global system prompt in source.
- Sliding-window context of last 50 messages (env-configurable).
- Stop = discard partial; don't persist the in-flight turn at all.
- Regenerate = replace the last assistant message in place.
- Errors surface as inline error bubble + Retry.
- Sidebar uses date-grouped buckets (Today / Yesterday / Previous 7 days / Older).

---

## File Map

Created during this plan:

```
.env.example
biome.json
drizzle.config.ts
components.json                  # via shadcn init
drizzle/                         # generated migrations
app/
  globals.css                    # Tailwind v4 layer + theme tokens (overwritten)
  layout.tsx                     # root: fonts, theme provider, SWR provider
  page.tsx                       # / → redirect /chat
  chat/
    layout.tsx                   # sidebar + main pane shell
    page.tsx                     # /chat new-chat empty state
    [id]/page.tsx                # /chat/[id] RSC fetches messages
  api/
    chat/route.ts                # POST: stream + persist + session create
    sessions/route.ts            # GET list
    sessions/[id]/route.ts       # PATCH rename, DELETE
components/
  chat/
    chat.tsx                     # client useChat wrapper
    composer.tsx                 # PromptInput + stop button
    conversation.tsx             # AI Elements Conversation + Message list
    error-bubble.tsx             # inline error + retry
    model-dropdown.tsx           # Foundry model picker
  sidebar/
    sidebar.tsx                  # desktop nav + mobile sheet shell
    sidebar-list.tsx             # SWR data + date grouping
    sidebar-item.tsx             # row + context menu
    rename-popover.tsx
    delete-confirm.tsx
  providers.tsx                  # ThemeProvider + SWRConfig
  theme-toggle.tsx
lib/
  ai/
    models.ts                    # ModelId type + registry
    providers.ts                 # createOpenAICompatible per model
    system-prompt.ts             # const SYSTEM_PROMPT
    title.ts                     # auto-title generator
  db/
    client.ts                    # drizzle(sql) instance
    schema.ts                    # sessions, messages tables
    queries.ts                   # typed helpers
  date-groups.ts                 # Today/Yesterday/Prev 7 days/Older bucketing
  utils.ts                       # cn() — written by shadcn init
hooks/
  use-sessions.ts                # SWR hook for sidebar list
```

---

## Task 1: Scaffold Next.js project + base tooling

**Files:**
- Create (via CLI): `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.gitignore`, `postcss.config.mjs`
- Create: `biome.json`

- [ ] **Step 1: Verify working directory and create Next.js project**

The current directory (`/Users/jlawrenc/.superset/worktrees/ai-chat/jlawrenc/josh-lawrence/plan/`) already has `.git/` and `docs/` from this plan file. `create-next-app` will warn about a non-empty directory but proceeds because nothing conflicts.

Run:
```bash
pnpm create next-app@latest . \
  --typescript --app --tailwind \
  --no-eslint --no-src-dir \
  --import-alias "@/*" --use-pnpm
```

Answer any interactive prompt with `Yes` (continue in non-empty directory).

Expected: `package.json`, `tsconfig.json`, `app/`, `next.config.ts`, etc. created. `pnpm install` runs automatically.

- [ ] **Step 2: Confirm dev server boots**

Run:
```bash
pnpm dev
```
Visit `http://localhost:3000`. Expect Next.js default page. Stop the server (Ctrl-C).

- [ ] **Step 3: Add Biome and configure**

Run:
```bash
pnpm add -D -E @biomejs/biome
pnpm exec biome init
```

Replace `biome.json` with:
```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignoreUnknown": true, "ignore": ["drizzle/**", ".next/**", "node_modules/**"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "useNodejsImportProtocol": "off" },
      "suspicious": { "noExplicitAny": "warn" }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "always", "trailingCommas": "all" } }
}
```

Add scripts to `package.json` (merge into existing `"scripts"`):
```json
"lint": "biome lint .",
"format": "biome format --write ."
```

- [ ] **Step 4: Verify Biome runs**

Run:
```bash
pnpm format
pnpm lint
```
Expected: both exit 0 (or with auto-fixed formatting only).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 + Tailwind v4 + Biome"
```

---

## Task 2: Install runtime dependencies + env scaffold

**Files:**
- Modify: `package.json` (deps via pnpm)
- Create: `.env.example`
- Modify: `.gitignore` (ensure `.env*` ignored — usually already)

- [ ] **Step 1: Install AI SDK, Drizzle, and UI deps**

```bash
pnpm add ai @ai-sdk/react @ai-sdk/openai-compatible \
  drizzle-orm postgres \
  swr next-themes sonner date-fns zod
pnpm add -D drizzle-kit @types/node
```

(Note: `@vercel/postgres` is not available in our registry mirror, so we use `postgres` (postgres-js) here. Connection string is identical.)

- [ ] **Step 2: Write `.env.example`**

Create `.env.example`:
```env
# Postgres (Vercel Postgres or any Neon connection string)
POSTGRES_URL="postgres://user:pass@host/db?sslmode=require"

# Azure AI Foundry — one API key, one URL per deployed model
AZURE_FOUNDRY_API_KEY=""
AZURE_FOUNDRY_GPT_URL="https://<resource>.services.ai.azure.com/models"
AZURE_FOUNDRY_KIMI_URL="https://<resource>.services.ai.azure.com/models"

# Optional knobs
CONTEXT_WINDOW_MESSAGES="50"
TITLE_MODEL="kimi-k2.6"
```

- [ ] **Step 3: Verify `.gitignore` excludes env files**

Open `.gitignore` and confirm these lines exist (Next.js scaffold normally adds them):
```
.env*.local
.env
```

If missing, append them.

- [ ] **Step 4: Have the user populate `.env.local`**

This is a manual step for the engineer. Tell the user:

> Copy `.env.example` to `.env.local` and fill in real values. You need:
> 1. A Postgres URL — create a free Neon database at https://neon.tech, copy the pooled connection string.
> 2. Azure Foundry API key + two model deployment URLs.

Verify the file exists and is non-empty before continuing:
```bash
test -s .env.local && echo "ok" || echo "FILL IN .env.local FIRST"
```

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example .gitignore
git commit -m "chore: add runtime deps + env scaffold"
```

---

## Task 3: Database schema + Drizzle setup

**Files:**
- Create: `drizzle.config.ts`
- Create: `lib/db/schema.ts`
- Create: `lib/db/client.ts`
- Create: `drizzle/0000_*.sql` (generated)

- [ ] **Step 1: Write the schema**

Create `lib/db/schema.ts`:
```ts
import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull().default('New chat'),
    model: text('model').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    updatedAtIdx: index('sessions_updated_at_idx').on(t.updatedAt.desc()),
  }),
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'user' | 'assistant' | 'system'
    parts: jsonb('parts').notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionCreatedIdx: index('messages_session_created_idx').on(t.sessionId, t.createdAt),
  }),
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type DbMessage = typeof messages.$inferSelect;
export type NewDbMessage = typeof messages.$inferInsert;
```

- [ ] **Step 2: Write the Drizzle client**

Create `lib/db/client.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// postgres-js client. `max: 1` keeps things simple for serverless/edge; bump for higher-concurrency runtimes.
const queryClient = postgres(process.env.POSTGRES_URL!, { max: 1 });
export const db = drizzle(queryClient, { schema });
```

(Note: original plan called for `@vercel/postgres`, but that package isn't in our registry mirror. `postgres-js` is the substitute — same Neon/Vercel-Postgres connection string works.)

- [ ] **Step 3: Write `drizzle.config.ts`**

Create `drizzle.config.ts`:
```ts
import 'dotenv/config';
import type { Config } from 'drizzle-kit';

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL!,
  },
} satisfies Config;
```

Add `dotenv`:
```bash
pnpm add -D dotenv
```

- [ ] **Step 4: Add db scripts to `package.json`**

Merge into `"scripts"`:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```

- [ ] **Step 5: Generate and apply the initial migration**

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: a `drizzle/0000_*.sql` file appears and runs against your DB without error. Open Drizzle Studio briefly to confirm tables exist:
```bash
pnpm db:studio
```

Stop with Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add lib/db drizzle drizzle.config.ts package.json pnpm-lock.yaml
git commit -m "feat(db): add sessions + messages schema with Drizzle"
```

---

## Task 4: DB query helpers

**Files:**
- Create: `lib/db/queries.ts`

- [ ] **Step 1: Write the query helpers**

Create `lib/db/queries.ts`:
```ts
import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { UIMessage } from 'ai';
import { db } from './client';
import { messages, sessions, type NewDbMessage, type Session } from './schema';

export async function listSessions(): Promise<Session[]> {
  return db.select().from(sessions).orderBy(desc(sessions.updatedAt));
}

export async function getSession(id: string): Promise<Session | null> {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createSession(input: { model: string }): Promise<Session> {
  const [row] = await db.insert(sessions).values({ model: input.model }).returning();
  return row;
}

export async function renameSession(id: string, title: string): Promise<void> {
  await db
    .update(sessions)
    .set({ title, updatedAt: new Date() })
    .where(eq(sessions.id, id));
}

export async function touchSession(id: string): Promise<void> {
  await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, id));
}

export async function deleteSession(id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id));
}

export async function getMessages(sessionId: string): Promise<UIMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));
  return rows.map((r) => ({
    id: r.id,
    role: r.role as UIMessage['role'],
    parts: r.parts as UIMessage['parts'],
  }));
}

export async function appendMessages(
  sessionId: string,
  toInsert: Array<Pick<UIMessage, 'role' | 'parts'>>,
): Promise<void> {
  if (toInsert.length === 0) return;
  const rows: NewDbMessage[] = toInsert.map((m) => ({
    sessionId,
    role: m.role,
    parts: m.parts as unknown as NewDbMessage['parts'],
  }));
  await db.insert(messages).values(rows);
}

export async function countMessages(sessionId: string): Promise<number> {
  const rows = await db.select({ id: messages.id }).from(messages).where(eq(messages.sessionId, sessionId));
  return rows.length;
}

export async function trimTrailingMessages(sessionId: string, n: number): Promise<void> {
  if (n <= 0) return;
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(desc(messages.createdAt))
    .limit(n);
  if (rows.length === 0) return;
  await db.delete(messages).where(
    // delete by id set
    // drizzle's `inArray` helper
    inArray(messages.id, rows.map((r) => r.id)),
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```
Expected: no errors. Fix any import-path issues before continuing.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries.ts
git commit -m "feat(db): add typed query helpers"
```

---

## Task 5: AI provider configuration + model registry + system prompt

**Files:**
- Create: `lib/ai/models.ts`
- Create: `lib/ai/providers.ts`
- Create: `lib/ai/system-prompt.ts`

- [ ] **Step 1: Write the model registry**

Create `lib/ai/models.ts`:
```ts
export const MODEL_IDS = ['gpt-5.3', 'kimi-k2.6'] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export const DEFAULT_MODEL: ModelId = 'gpt-5.3';

export const MODEL_LABELS: Record<ModelId, string> = {
  'gpt-5.3': 'GPT-5.3+',
  'kimi-k2.6': 'Kimi K2.6',
};

export function isModelId(value: unknown): value is ModelId {
  return typeof value === 'string' && (MODEL_IDS as readonly string[]).includes(value);
}
```

- [ ] **Step 2: Write the provider factory**

Create `lib/ai/providers.ts`:
```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { ModelId } from './models';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const FOUNDRY_API_KEY = required('AZURE_FOUNDRY_API_KEY');

function makeProvider(baseURL: string) {
  // Foundry uses the "api-key" header, not "Authorization: Bearer". We must NOT pass
  // `apiKey` to createOpenAICompatible — that would inject an Authorization header
  // alongside our custom one, which Foundry rejects. Only `headers` is set.
  return createOpenAICompatible({
    name: 'azure-foundry',
    baseURL,
    headers: { 'api-key': FOUNDRY_API_KEY },
  });
}

const gpt = makeProvider(required('AZURE_FOUNDRY_GPT_URL'));
const kimi = makeProvider(required('AZURE_FOUNDRY_KIMI_URL'));

// Foundry deployments use the deployment name as the model identifier.
// Adjust these strings if your deployment names differ.
const FOUNDRY_DEPLOYMENT_NAMES: Record<ModelId, string> = {
  'gpt-5.3': 'gpt-5.3',
  'kimi-k2.6': 'kimi-k2.6',
};

export function getModel(id: ModelId): LanguageModel {
  switch (id) {
    case 'gpt-5.3':
      return gpt.chatModel(FOUNDRY_DEPLOYMENT_NAMES[id]);
    case 'kimi-k2.6':
      return kimi.chatModel(FOUNDRY_DEPLOYMENT_NAMES[id]);
  }
}
```

- [ ] **Step 3: Write the system prompt**

Create `lib/ai/system-prompt.ts`:
```ts
export const SYSTEM_PROMPT = `You are a helpful, concise AI assistant.

- Answer in plain Markdown.
- Use fenced code blocks with language tags for any code.
- Keep responses focused; ask clarifying questions only when truly necessary.
`;
```

- [ ] **Step 4: Type-check**

```bash
pnpm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add lib/ai
git commit -m "feat(ai): add Foundry provider + model registry + system prompt"
```

---

## Task 6: Auto-title helper

**Files:**
- Create: `lib/ai/title.ts`

- [ ] **Step 1: Write the title generator**

Create `lib/ai/title.ts`:
```ts
import { generateText, type UIMessage } from 'ai';
import { getModel } from './providers';

const TITLE_INSTRUCTION = `You are a title generator. Read the conversation and produce a short (max 6 words) descriptive title. Return only the title text, no quotes, no punctuation at the end.`;

function flattenText(msg: UIMessage): string {
  return msg.parts
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join('')
    .slice(0, 2000);
}

export async function generateTitle(messages: UIMessage[]): Promise<string> {
  const modelId = (process.env.TITLE_MODEL ?? 'kimi-k2.6') as 'gpt-5.3' | 'kimi-k2.6';
  const conversation = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, 4)
    .map((m) => `${m.role.toUpperCase()}: ${flattenText(m)}`)
    .join('\n\n');

  const { text } = await generateText({
    model: getModel(modelId),
    system: TITLE_INSTRUCTION,
    prompt: conversation,
  });
  return text.trim().replace(/^["']|["']$/g, '').slice(0, 80) || 'New chat';
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/title.ts
git commit -m "feat(ai): add auto-title helper"
```

---

## Task 7: POST /api/chat route — the heart of the system

This route streams responses, lazily creates sessions, persists turns on finish, and triggers the auto-title call for the first turn.

**Files:**
- Create: `app/api/chat/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/chat/route.ts`:
```ts
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { DEFAULT_MODEL, isModelId, type ModelId } from '@/lib/ai/models';
import { getModel } from '@/lib/ai/providers';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { generateTitle } from '@/lib/ai/title';
import {
  appendMessages,
  countMessages,
  createSession,
  getSession,
  renameSession,
  touchSession,
  trimTrailingMessages,
} from '@/lib/db/queries';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BodySchema = z.object({
  sessionId: z.string().uuid().optional(),
  model: z.string().optional(),
  messages: z.array(z.any()), // UIMessage[] — trust the SDK shape
});

const CONTEXT_WINDOW = Number.parseInt(process.env.CONTEXT_WINDOW_MESSAGES ?? '50', 10);

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return new Response('Bad request', { status: 400 });
  }
  const body = parsed.data;
  const incoming = body.messages as UIMessage[];

  // Resolve session + model
  let sessionId = body.sessionId;
  let isNewSession = false;
  let model: ModelId;

  if (sessionId) {
    const session = await getSession(sessionId);
    if (!session) return new Response('Session not found', { status: 404 });
    if (!isModelId(session.model)) return new Response('Bad model on session', { status: 500 });
    model = session.model;
  } else {
    const candidate = body.model && isModelId(body.model) ? body.model : DEFAULT_MODEL;
    const session = await createSession({ model: candidate });
    sessionId = session.id;
    model = candidate;
    isNewSession = true;
  }

  // Reconcile incoming history vs DB so persistence is correct for send AND regenerate.
  // Use `incoming` (full client history) for reconciliation — NOT `windowed` (which is
  // truncated for the model). Otherwise long sessions would falsely trim in-DB messages.
  // - Normal send:        incoming.length = db.length + 1   → trim 0, append the new user msg
  // - Regenerate:         incoming.length = db.length - 1   → trim 1 (old assistant), no new user msg
  // - Error retry/etc.:   reduces to one of the above
  // The trim happens only after a successful onFinish so aborted/error turns don't disturb history.
  const dbCount = isNewSession ? 0 : await countMessages(sessionId);
  const trimCount = Math.max(0, dbCount - incoming.length);
  const newUserMessages = incoming.slice(dbCount - trimCount); // [] when regenerating, else trailing user msgs

  // The view sent to the model: sliding window of the most recent messages.
  const windowed = incoming.slice(-CONTEXT_WINDOW);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Tell the client the session id immediately. The client uses this to
      // router.replace('/chat/<id>') for new sessions.
      writer.write({
        type: 'data-session',
        data: { id: sessionId, isNew: isNewSession },
        transient: true,
      });

      const result = streamText({
        model: getModel(model),
        system: SYSTEM_PROMPT,
        messages: convertToModelMessages(windowed),
        abortSignal: req.signal,
      });
      writer.merge(result.toUIMessageStream());
    },
    originalMessages: incoming,
    onFinish: async ({ messages: finalMessages, responseMessage }) => {
      // Stop = discard partial. Error = same. Neither user nor assistant gets persisted.
      // `req.signal.aborted` is the authoritative check; it flips true on client disconnect.
      if (req.signal.aborted || !responseMessage) return;

      // Persistence errors after stream completion can't be surfaced to the client
      // (response is already closed), so at minimum log them prominently.
      try {
        if (trimCount > 0) {
          await trimTrailingMessages(sessionId, trimCount);
        }
        await appendMessages(sessionId, [
          ...newUserMessages.map((m) => ({ role: m.role, parts: m.parts })),
          { role: responseMessage.role, parts: responseMessage.parts },
        ]);
        await touchSession(sessionId);
      } catch (err) {
        console.error('persistence failed — turn will not appear in history', err);
        return;
      }

      // First turn → generate a title.
      if (isNewSession) {
        try {
          const title = await generateTitle(finalMessages);
          await renameSession(sessionId, title);
        } catch (err) {
          // Non-fatal: keep the default 'New chat'.
          console.error('title generation failed', err);
        }
      }
    },
    onError: (err) => {
      console.error('chat stream error', err);
      return 'Something went wrong while talking to the model.';
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```
Expected: clean. If AI SDK API names differ slightly (`convertToModelMessages`, `createUIMessageStream`, `createUIMessageStreamResponse`, `toUIMessageStream`) check `pnpm why ai` for the installed version and consult `node_modules/ai/dist/index.d.ts` — these are the v5 names as of the AI SDK reference, and should be stable.

- [ ] **Step 3: Smoke-test the route with curl**

Start dev server:
```bash
pnpm dev
```

In another terminal, hit the route with a minimal payload:
```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{
    "model": "gpt-5.3",
    "messages": [
      { "id": "u1", "role": "user", "parts": [{ "type": "text", "text": "Say hi in 4 words." }] }
    ]
  }'
```

Expected: streaming chunks come back; a `data-session` event arrives first carrying a session id; followed by text-delta chunks; finally a finish event. Verify in Drizzle Studio (`pnpm db:studio`) that a new `sessions` row and two `messages` rows exist, and the session `title` is populated by the auto-titler after a few seconds.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(api): POST /api/chat with streaming, persistence, auto-title"
```

---

## Task 8: Sessions API (list, rename, delete)

**Files:**
- Create: `app/api/sessions/route.ts`
- Create: `app/api/sessions/[id]/route.ts`

- [ ] **Step 1: Write list route**

Create `app/api/sessions/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { listSessions } from '@/lib/db/queries';

export const runtime = 'nodejs';

export async function GET() {
  const rows = await listSessions();
  return NextResponse.json(rows);
}
```

- [ ] **Step 2: Write rename + delete route**

Create `app/api/sessions/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteSession, renameSession } from '@/lib/db/queries';

export const runtime = 'nodejs';

const PatchBody = z.object({ title: z.string().min(1).max(120) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { title } = PatchBody.parse(await req.json());
  await renameSession(id, title);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteSession(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Smoke-test**

```bash
pnpm dev
```

In another terminal (with a known session id from Task 7):
```bash
SID=<paste-id>

curl -s http://localhost:3000/api/sessions | head -c 400
curl -s -X PATCH http://localhost:3000/api/sessions/$SID \
  -H 'content-type: application/json' \
  -d '{"title":"Renamed in test"}'
curl -s http://localhost:3000/api/sessions | head -c 400
curl -s -X DELETE http://localhost:3000/api/sessions/$SID
```

Expected: list returns array; PATCH and DELETE return `{"ok":true}`; final list excludes the deleted id.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add app/api/sessions
git commit -m "feat(api): sessions list/rename/delete"
```

---

## Task 9: Date-group helper + sessions SWR hook

**Files:**
- Create: `lib/date-groups.ts`
- Create: `hooks/use-sessions.ts`

- [ ] **Step 1: Write date grouping**

Create `lib/date-groups.ts`:
```ts
import { differenceInCalendarDays, isToday, isYesterday } from 'date-fns';

export type DateBucket = 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older';

export function bucketFor(d: Date | string): DateBucket {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (differenceInCalendarDays(new Date(), date) < 7) return 'Previous 7 days';
  return 'Older';
}

export function groupByBucket<T extends { updatedAt: string | Date }>(items: T[]): Array<{
  bucket: DateBucket;
  items: T[];
}> {
  const order: DateBucket[] = ['Today', 'Yesterday', 'Previous 7 days', 'Older'];
  const map = new Map<DateBucket, T[]>();
  for (const it of items) {
    const b = bucketFor(it.updatedAt);
    const list = map.get(b) ?? [];
    list.push(it);
    map.set(b, list);
  }
  return order.filter((b) => map.has(b)).map((b) => ({ bucket: b, items: map.get(b)! }));
}
```

- [ ] **Step 2: Write the SWR hook**

Create `hooks/use-sessions.ts`:
```ts
'use client';

import useSWR from 'swr';
import type { Session } from '@/lib/db/schema';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useSessions() {
  return useSWR<Session[]>('/api/sessions', fetcher, {
    revalidateOnFocus: false,
    fallbackData: [],
  });
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/date-groups.ts hooks/use-sessions.ts
git commit -m "feat: date bucketing + sessions SWR hook"
```

---

## Task 10: Root layout — fonts, theme provider, SWR provider

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Create: `components/providers.tsx`

- [ ] **Step 1: Write providers**

Create `components/providers.tsx`:
```tsx
'use client';

import { ThemeProvider } from 'next-themes';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <SWRConfig value={{ revalidateOnFocus: false }}>{children}</SWRConfig>
    </ThemeProvider>
  );
}
```

- [ ] **Step 2: Rewrite root layout**

Overwrite `app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Chat',
  description: 'Chat against Azure Foundry deployments.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-background text-foreground antialiased">
        <Providers>
          {children}
          <Toaster richColors closeButton />
        </Providers>
      </body>
    </html>
  );
}
```

Install Geist:
```bash
pnpm add geist
```

- [ ] **Step 3: Refresh globals.css**

Overwrite `app/globals.css` with the minimal Tailwind v4 + theme tokens. shadcn init in Task 11 will append more variables, so keep this small for now:
```css
@import "tailwindcss";

@theme {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

html, body { height: 100%; }
```

- [ ] **Step 4: Verify boot**

```bash
pnpm dev
```
Visit `http://localhost:3000`. The default Next.js page should still render with Geist fonts. Stop server.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx app/globals.css components/providers.tsx package.json pnpm-lock.yaml
git commit -m "feat(ui): root layout with Geist + theme + SWR providers"
```

---

## Task 11: shadcn init + AI Elements install

**Files:**
- Create: `components.json` (via CLI)
- Create: `components/ui/*` (via CLI)
- Create: `components/ai-elements/*` (via CLI)
- Modify: `lib/utils.ts`

- [ ] **Step 1: Initialize shadcn**

```bash
pnpm dlx shadcn@latest init -y --base-color slate
```

This writes `components.json`, `lib/utils.ts` (with `cn()`), and updates `app/globals.css` with theme variables. Accept all defaults.

- [ ] **Step 2: Add the shadcn primitives we'll need**

```bash
pnpm dlx shadcn@latest add button input textarea dropdown-menu popover sheet alert-dialog separator scroll-area tooltip skeleton sonner
```

- [ ] **Step 3: Install AI Elements**

```bash
pnpm dlx ai-elements@latest
```

This installs all AI Elements components into `components/ai-elements/`. If the CLI prompts about overwrites, accept.

- [ ] **Step 4: Verify install**

Check directories exist:
```bash
ls components/ui/ | head
ls components/ai-elements/ | head
```

Expected: `button.tsx`, `input.tsx`, etc. in `ui/`; `conversation.tsx`, `message.tsx`, `response.tsx`, `prompt-input.tsx`, `code-block.tsx`, `loader.tsx` etc. in `ai-elements/`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): shadcn init + AI Elements components"
```

---

## Task 12: Sidebar — shell, list, items, rename, delete, mobile sheet

**Files:**
- Create: `components/sidebar/sidebar.tsx`
- Create: `components/sidebar/sidebar-list.tsx`
- Create: `components/sidebar/sidebar-item.tsx`
- Create: `components/sidebar/rename-popover.tsx`
- Create: `components/sidebar/delete-confirm.tsx`
- Create: `components/theme-toggle.tsx`
- Create: `app/chat/layout.tsx`

- [ ] **Step 1: Theme toggle**

Create `components/theme-toggle.tsx`:
```tsx
'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
```

- [ ] **Step 2: Rename popover**

Create `components/sidebar/rename-popover.tsx`:
```tsx
'use client';

import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { mutate } from 'swr';

export function RenamePopover({
  sessionId,
  currentTitle,
  children,
}: {
  sessionId: string;
  currentTitle: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentTitle);

  async function save() {
    const next = value.trim();
    if (!next || next === currentTitle) {
      setOpen(false);
      return;
    }
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: next }),
    });
    if (!res.ok) {
      toast.error('Rename failed');
      return;
    }
    setOpen(false);
    mutate('/api/sessions');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setOpen(false);
            }}
            autoFocus
          />
          <Button size="sm" onClick={save}>Save</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Delete confirm**

Create `components/sidebar/delete-confirm.tsx`:
```tsx
'use client';

import { type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { mutate } from 'swr';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function DeleteConfirm({
  sessionId,
  children,
}: {
  sessionId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  async function onConfirm() {
    const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Delete failed');
      return;
    }
    mutate('/api/sessions');
    if (pathname === `/chat/${sessionId}`) router.replace('/chat');
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 4: Sidebar item**

Create `components/sidebar/sidebar-item.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Session } from '@/lib/db/schema';
import { RenamePopover } from './rename-popover';
import { DeleteConfirm } from './delete-confirm';

export function SidebarItem({ session }: { session: Session }) {
  const pathname = usePathname();
  const active = pathname === `/chat/${session.id}`;
  return (
    <div
      className={cn(
        'group flex items-center justify-between rounded-md px-2 py-1.5 text-sm',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
      )}
    >
      <Link href={`/chat/${session.id}`} className="min-w-0 flex-1 truncate">
        {session.title}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label="Session actions"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <RenamePopover sessionId={session.id} currentTitle={session.title}>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <Pencil className="mr-2 size-4" /> Rename
            </DropdownMenuItem>
          </RenamePopover>
          <DeleteConfirm sessionId={session.id}>
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-4" /> Delete
            </DropdownMenuItem>
          </DeleteConfirm>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 5: Sidebar list (with grouping)**

Create `components/sidebar/sidebar-list.tsx`:
```tsx
'use client';

import { groupByBucket } from '@/lib/date-groups';
import { useSessions } from '@/hooks/use-sessions';
import { Skeleton } from '@/components/ui/skeleton';
import { SidebarItem } from './sidebar-item';

export function SidebarList() {
  const { data, isLoading } = useSessions();
  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }
  const groups = groupByBucket(
    (data ?? []).map((s) => ({ ...s, updatedAt: s.updatedAt as unknown as string })),
  );
  if (groups.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        No chats yet. Start one below.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 p-2">
      {groups.map((g) => (
        <div key={g.bucket}>
          <div className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {g.bucket}
          </div>
          <div className="flex flex-col">
            {g.items.map((s) => (
              <SidebarItem key={s.id} session={s} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Sidebar shell (desktop + mobile sheet)**

Create `components/sidebar/sidebar.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { Menu, MessageSquarePlus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme-toggle';
import { SidebarList } from './sidebar-list';

function Header() {
  return (
    <div className="flex items-center justify-between border-b px-3 py-2">
      <Link href="/chat" className="text-sm font-semibold">AI Chat</Link>
      <ThemeToggle />
    </div>
  );
}

function NewChatButton({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/chat" onClick={onClick}>
      <Button className="m-2 w-[calc(100%-1rem)] justify-start" variant="outline">
        <MessageSquarePlus className="mr-2 size-4" /> New chat
      </Button>
    </Link>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop */}
      <aside className="hidden w-72 shrink-0 border-r md:flex md:flex-col">
        <Header />
        <NewChatButton />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarList />
        </div>
      </aside>
      {/* Mobile trigger */}
      <div className="absolute left-2 top-2 z-20 md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open sidebar">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b px-3 py-2">
              <SheetTitle>AI Chat</SheetTitle>
            </SheetHeader>
            <NewChatButton onClick={() => setMobileOpen(false)} />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SidebarList />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
```

- [ ] **Step 7: Chat layout**

Create `app/chat/layout.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar/sidebar';

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
```

- [ ] **Step 8: Verify the sidebar renders**

`pnpm dev`. Visit `http://localhost:3000/chat` (page doesn't exist yet — Next.js will 404). That's expected; just open `http://localhost:3000/chat/_layout`-equivalent or proceed to Task 13 to give it a real page. For now confirm no TypeScript errors:
```bash
pnpm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add components/sidebar components/theme-toggle.tsx app/chat/layout.tsx
git commit -m "feat(ui): sidebar with date groups, rename, delete, mobile sheet"
```

---

## Task 13: Chat client component

This is the React component that hosts `useChat`. It's shared by `/chat` (new) and `/chat/[id]` (existing).

**Files:**
- Create: `components/chat/chat.tsx`
- Create: `components/chat/composer.tsx`
- Create: `components/chat/conversation.tsx`
- Create: `components/chat/error-bubble.tsx`
- Create: `components/chat/model-dropdown.tsx`

- [ ] **Step 1: Model dropdown**

Create `components/chat/model-dropdown.tsx`:
```tsx
'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MODEL_IDS, MODEL_LABELS, type ModelId } from '@/lib/ai/models';

export function ModelDropdown({
  value,
  onChange,
  disabled,
}: {
  value: ModelId;
  onChange: (v: ModelId) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} className="gap-1">
          {MODEL_LABELS[value]}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {MODEL_IDS.map((id) => (
          <DropdownMenuItem key={id} onSelect={() => onChange(id)}>
            <Check className={`mr-2 size-4 ${id === value ? '' : 'invisible'}`} />
            {MODEL_LABELS[id]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Composer**

Create `components/chat/composer.tsx`:
```tsx
'use client';

import { type FormEvent, useState } from 'react';
import { Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  PromptInput,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import type { ModelId } from '@/lib/ai/models';
import { ModelDropdown } from './model-dropdown';

export function Composer({
  status,
  model,
  modelLocked,
  onModelChange,
  onSubmit,
  onStop,
}: {
  status: 'ready' | 'streaming' | 'submitted' | 'error';
  model: ModelId;
  modelLocked: boolean;
  onModelChange: (m: ModelId) => void;
  onSubmit: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState('');
  const isBusy = status === 'streaming' || status === 'submitted';

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const v = text.trim();
    if (!v || isBusy) return;
    onSubmit(v);
    setText('');
  }

  return (
    <PromptInput onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl">
      <PromptInputBody>
        <PromptInputTextarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message..."
        />
        <PromptInputToolbar>
          <PromptInputTools>
            <ModelDropdown value={model} onChange={onModelChange} disabled={modelLocked} />
          </PromptInputTools>
          {isBusy ? (
            <Button type="button" size="icon" variant="ghost" onClick={onStop} aria-label="Stop">
              <Square className="size-4" />
            </Button>
          ) : (
            <PromptInputSubmit disabled={!text.trim()} />
          )}
        </PromptInputToolbar>
      </PromptInputBody>
    </PromptInput>
  );
}
```

- [ ] **Step 3: Error bubble**

Create `components/chat/error-bubble.tsx`:
```tsx
'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ErrorBubble({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 text-destructive" />
      <div className="flex-1">
        <div className="font-medium text-destructive">Something went wrong.</div>
        <div className="text-destructive/80">{message}</div>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RotateCcw className="mr-1 size-3.5" /> Retry
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Conversation**

Create `components/chat/conversation.tsx`:
```tsx
'use client';

import type { UIMessage } from 'ai';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { Loader } from '@/components/ai-elements/loader';

export function ChatConversation({
  messages,
  status,
}: {
  messages: UIMessage[];
  status: 'ready' | 'streaming' | 'submitted' | 'error';
}) {
  const showThinking =
    status === 'submitted' && (messages.at(-1)?.role !== 'assistant');

  return (
    <Conversation className="min-h-0 flex-1">
      <ConversationContent className="mx-auto max-w-3xl">
        {messages.map((m) => (
          <Message key={m.id} from={m.role}>
            <MessageContent>
              {m.parts.map((p, i) => {
                if (p.type === 'text') return <Response key={i}>{p.text}</Response>;
                // Reasoning/tools are persisted but not rendered on day one.
                return null;
              })}
            </MessageContent>
          </Message>
        ))}
        {showThinking ? (
          <div className="mx-auto w-full max-w-3xl px-4">
            <Loader />
          </div>
        ) : null}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
```

- [ ] **Step 5: Chat (the main client component)**

Create `components/chat/chat.tsx`:
```tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { mutate } from 'swr';
import { DEFAULT_MODEL, type ModelId } from '@/lib/ai/models';
import { Composer } from './composer';
import { ChatConversation } from './conversation';
import { ErrorBubble } from './error-bubble';

type Props = {
  sessionId?: string;
  initialModel?: ModelId;
  initialMessages?: UIMessage[];
};

export function Chat({ sessionId: initialSessionId, initialModel, initialMessages }: Props) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [model, setModel] = useState<ModelId>(initialModel ?? DEFAULT_MODEL);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            sessionId,
            model,
            messages,
          },
        }),
      }),
    [sessionId, model],
  );

  const { messages, sendMessage, status, error, regenerate, stop } = useChat({
    transport,
    messages: initialMessages,
    onData: ({ type, data }) => {
      if (type === 'data-session') {
        const d = data as { id: string; isNew: boolean };
        if (d.isNew) {
          setSessionId(d.id);
          // Replace URL without reloading the component tree.
          router.replace(`/chat/${d.id}`, { scroll: false });
          // Refresh sidebar so the new session appears.
          mutate('/api/sessions');
        }
      }
    },
    onFinish: () => {
      // Bump sidebar so updatedAt / title reflect latest.
      mutate('/api/sessions');
    },
  });

  const modelLocked = messages.length > 0;
  const showError = status === 'error' && !!error;

  function handleRetry() {
    // Server-side reconcile handles trim/append based on incoming-vs-DB counts,
    // so a plain regenerate() works for both error-retry and user-initiated regenerate.
    regenerate();
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <ChatConversation messages={messages} status={status} />
      {showError ? (
        <div className="mx-auto w-full max-w-3xl px-4 pb-2">
          <ErrorBubble message={error?.message ?? 'Unknown error'} onRetry={handleRetry} />
        </div>
      ) : null}
      <div className="border-t bg-background/95 px-4 py-3">
        <Composer
          status={status}
          model={model}
          modelLocked={modelLocked}
          onModelChange={setModel}
          onSubmit={(text) =>
            sendMessage({ role: 'user', parts: [{ type: 'text', text }] })
          }
          onStop={stop}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Type-check**

```bash
pnpm exec tsc --noEmit
```
Expected: clean. Reconcile any minor v5 API drift (e.g., `sendMessage` signature) by checking `node_modules/@ai-sdk/react/dist/index.d.ts`.

- [ ] **Step 7: Commit**

```bash
git add components/chat
git commit -m "feat(chat): client component with composer, conversation, error bubble"
```

---

## Task 14: Chat pages — `/`, `/chat`, `/chat/[id]`

**Files:**
- Modify: `app/page.tsx`
- Create: `app/chat/page.tsx`
- Create: `app/chat/[id]/page.tsx`

- [ ] **Step 1: Root page redirect**

Overwrite `app/page.tsx`:
```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/chat');
}
```

- [ ] **Step 2: New chat page**

Create `app/chat/page.tsx`:
```tsx
import { Chat } from '@/components/chat/chat';

export default function NewChatPage() {
  return <Chat />;
}
```

- [ ] **Step 3: Session page (RSC fetch + hydrate)**

Create `app/chat/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { Chat } from '@/components/chat/chat';
import { isModelId } from '@/lib/ai/models';
import { getMessages, getSession } from '@/lib/db/queries';

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) notFound();
  const model = isModelId(session.model) ? session.model : 'gpt-5.3';
  const initialMessages = await getMessages(id);
  return <Chat sessionId={id} initialModel={model} initialMessages={initialMessages} />;
}
```

- [ ] **Step 4: End-to-end manual verification**

```bash
pnpm dev
```

Walk this script in a browser:

1. Visit `http://localhost:3000` — should redirect to `/chat` and show the empty composer with model dropdown defaulting to GPT-5.3+.
2. Type a message and hit Send. Expect: streaming response appears; URL flips to `/chat/<uuid>`; a new entry appears in the sidebar under "Today"; a few seconds after the response finishes, the sidebar entry's title updates from "New chat" to something descriptive.
3. Send a second message in the same chat. Verify the model dropdown is now read-only (locked).
4. Open a second browser tab to `http://localhost:3000/chat/<the-uuid>`. The full conversation should hydrate from the database.
5. Hover a sidebar entry → click the `…` button → Rename. Confirm the title updates and persists across a refresh.
6. Click `…` → Delete. Confirm the entry disappears; if it was the active session, you're redirected to `/chat`.
7. Click "New chat" → choose Kimi K2.6 from the dropdown → send a message. Verify it streams from the Kimi endpoint (check Network panel; URL flip occurs).
8. While a response is streaming, click the Stop (square) button. Verify the partial assistant content is **not** persisted (refresh the page — the aborted turn is gone, only the prior turns remain).
9. Toggle the theme via the icon in the sidebar header — should switch light ↔ dark with no layout flicker.
10. Resize the browser narrow (<768px). Sidebar collapses; a menu button appears top-left; tapping it opens the sheet.

If any of these fail, fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/chat/page.tsx app/chat/[id]/page.tsx
git commit -m "feat(pages): /, /chat, /chat/[id] wired end-to-end"
```

---

## Task 15: Cleanup, lint, README pointers

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the default README with a getting-started doc**

Overwrite `README.md`:
```md
# AI Chat (Foundry)

Single-user Next.js chat against Azure AI Foundry deployments (GPT-5.3+ and Kimi K2.6) with Postgres-backed session save/load.

## Setup

```bash
pnpm install
cp .env.example .env.local
# Edit .env.local — see notes below
pnpm db:generate
pnpm db:migrate
pnpm dev
```

## Env vars

- `POSTGRES_URL` — Neon / Vercel Postgres connection string.
- `AZURE_FOUNDRY_API_KEY` — single key reused for both Foundry deployments.
- `AZURE_FOUNDRY_GPT_URL` — base URL for the GPT-5.3+ deployment (the `…/models` root).
- `AZURE_FOUNDRY_KIMI_URL` — base URL for the Kimi K2.6 deployment.
- `CONTEXT_WINDOW_MESSAGES` — sliding window size (default 50).
- `TITLE_MODEL` — model used for the auto-title call (default `kimi-k2.6`).

## Notes

- AI SDK v5 with `@ai-sdk/openai-compatible`. Foundry expects the `api-key` header — see `lib/ai/providers.ts`.
- Sessions and messages are persisted in `onFinish`; aborted turns are discarded.
- New-session id is sent to the client via a `data-session` event mid-stream; the client `router.replace()`s.

## Scripts

- `pnpm dev` — Next.js dev server (Turbopack).
- `pnpm lint` / `pnpm format` — Biome.
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` — Drizzle.
```

- [ ] **Step 2: Run lint + type-check one last time**

```bash
pnpm format
pnpm lint
pnpm exec tsc --noEmit
```
Expected: all clean.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README with setup + env + scripts"
```

---

## Acceptance checklist

Run through this list after Task 15. Each item maps back to a grilled-on requirement.

- [ ] `/` redirects to `/chat`.
- [ ] `/chat` shows empty composer with model dropdown, default = GPT-5.3+.
- [ ] First send creates a session, streams, URL flips to `/chat/[id]`, sidebar shows the new entry.
- [ ] Auto-title appears shortly after the first response finishes.
- [ ] Model dropdown locks (greyed-out) once the session has any messages.
- [ ] `/chat/[id]` direct-load hydrates the full conversation server-side.
- [ ] Sidebar is grouped: Today / Yesterday / Previous 7 days / Older.
- [ ] Rename works via popover, persists, updates sidebar via SWR mutate.
- [ ] Delete works via confirm dialog; deleting the active chat redirects to `/chat`.
- [ ] Stop discards the in-flight assistant response — neither user nor assistant row is written for that turn.
- [ ] Regenerate replaces the last assistant message in place (visually and in DB after re-stream).
- [ ] Foundry errors render an inline error bubble + Retry button.
- [ ] Reasoning parts (if emitted by the model) are stored in `messages.parts` as jsonb but not rendered.
- [ ] Sliding window of 50 messages caps history sent to Foundry; configurable via `CONTEXT_WINDOW_MESSAGES`.
- [ ] Dark mode default, with toggle in the sidebar header.
- [ ] Mobile <768px collapses sidebar into a Sheet.
