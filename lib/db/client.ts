import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) throw new Error('POSTGRES_URL is required');

// postgres-js client. `max: 1` keeps things simple for serverless/edge; bump for higher-concurrency runtimes.
const queryClient = postgres(POSTGRES_URL, { max: 1 });
export const db = drizzle(queryClient, { schema });
