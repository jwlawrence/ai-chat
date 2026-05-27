import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env.development.local' });

async function main() {
  const { db } = await import('@/lib/db/client');

  const migRows = await db.execute(
    'SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at',
  );
  console.log('applied migrations:');
  for (const r of migRows) {
    console.log(' ', r);
  }

  const allTables = await db.execute(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  console.log(
    '\npublic tables:',
    allTables.map((x: Record<string, unknown>) => x.tablename),
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
