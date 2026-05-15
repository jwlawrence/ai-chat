import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

for (const path of ['.env.local', '.env.development.local', '.env']) {
  config({ path, override: false });
}

const url = process.env.POSTGRES_URL;
if (!url) throw new Error('POSTGRES_URL is required to run drizzle-kit');

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
} satisfies Config;
