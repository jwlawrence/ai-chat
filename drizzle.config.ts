import 'dotenv/config';
import type { Config } from 'drizzle-kit';

const url = process.env.POSTGRES_URL;
if (!url) throw new Error('POSTGRES_URL is required to run drizzle-kit');

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
} satisfies Config;
