/**
 * Inspect the most recent assistant message in the most recent session.
 * Run: pnpm exec tsx scripts/inspect-last-turn.ts
 */

import { config } from 'dotenv';

// Load env BEFORE importing the db client (which throws at import time without POSTGRES_URL).
config({ path: '.env.local' });
config({ path: '.env.development.local' });

async function main() {
  const { db } = await import('@/lib/db/client');
  const { messages, chatSessions } = await import('@/lib/db/schema');
  const { desc, eq } = await import('drizzle-orm');

  const [latestSession] = await db
    .select()
    .from(chatSessions)
    .orderBy(desc(chatSessions.updatedAt))
    .limit(1);
  if (!latestSession) {
    console.log('No sessions found.');
    return;
  }
  console.log(`Session: ${latestSession.id} — "${latestSession.title}" (${latestSession.model})`);

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, latestSession.id))
    .orderBy(desc(messages.createdAt))
    .limit(4);

  console.log(`\nLast ${rows.length} messages (newest first):\n`);
  for (const row of rows) {
    console.log('='.repeat(80));
    console.log(`[${row.role}] ${row.createdAt.toISOString()} (id ${row.id.slice(0, 8)})`);
    const parts = row.parts as Array<Record<string, unknown>>;
    parts.forEach((p, i) => {
      console.log(
        `  part #${i}: type=${p.type as string} state=${(p as { state?: string }).state ?? 'n/a'}`,
      );
      if (typeof p.type === 'string' && p.type.startsWith('tool-')) {
        console.log('    ALL keys:', Object.keys(p).join(', '));
        for (const [k, v] of Object.entries(p)) {
          if (k === 'type' || k === 'state') continue;
          const s = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
          console.log(`    ${k}:`, (s ?? 'undefined').slice(0, 3000));
        }
      } else if (p.type === 'text') {
        console.log('    text:', String(p.text).slice(0, 600));
      } else if (p.type === 'reasoning') {
        console.log('    reasoning:', String((p as { text?: string }).text ?? '').slice(0, 600));
      }
    });
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
