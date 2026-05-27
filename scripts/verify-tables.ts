import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env.development.local' });

async function main() {
  const { db } = await import('@/lib/db/client');

  const tables = await db.execute(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  console.log('tables:', tables.map((x: Record<string, unknown>) => x.tablename));

  const columns = await db.execute(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'chat_sessions'
     ORDER BY ordinal_position`,
  );
  console.log('\nchat_sessions columns:');
  for (const col of columns) {
    const c = col as { column_name: string; data_type: string; is_nullable: string };
    console.log(`  ${c.column_name} (${c.data_type}, nullable=${c.is_nullable})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
