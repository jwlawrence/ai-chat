import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// postgres-js client. `max: 1` keeps things simple for serverless/edge; bump for higher-concurrency runtimes.
const queryClient = postgres(process.env.POSTGRES_URL!, { max: 1 });
export const db = drizzle(queryClient, { schema });
