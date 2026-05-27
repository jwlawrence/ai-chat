import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env.development.local' });

async function main() {
  const { db } = await import('@/lib/db/client');

  const chatSessionsExists = await db.execute(
    "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='chat_sessions') AS exists",
  );
  console.log('chat_sessions exists?', chatSessionsExists[0]);

  const usersExists = await db.execute(
    "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='users') AS exists",
  );
  console.log('users exists?', usersExists[0]);

  const sessionsCols = await db.execute(
    "SELECT column_name FROM information_schema.columns WHERE table_name='sessions' AND table_schema='public' ORDER BY ordinal_position",
  );
  console.log(
    'sessions columns:',
    sessionsCols.map((x: Record<string, unknown>) => x.column_name),
  );

  const migCount = await db.execute('SELECT COUNT(*) as n FROM drizzle.__drizzle_migrations');
  console.log('migration count:', migCount[0]);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
