import { config } from 'dotenv';
import postgres from 'postgres';

for (const path of ['.env.local', '.env.development.local', '.env']) {
  config({ path, override: false });
}

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error('POSTGRES_URL not set');

  const sql = postgres(url, { max: 1 });

  const tables = await sql`
    SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
  `;
  console.log('public tables:', tables.map((r) => r.tablename));

  const migrations = await sql`
    SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id
  `;
  console.log('applied migrations:');
  for (const m of migrations) {
    console.log(`  id=${m.id} created_at=${m.created_at} hash=${String(m.hash).slice(0, 12)}...`);
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
