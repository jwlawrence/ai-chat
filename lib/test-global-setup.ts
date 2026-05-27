/**
 * Vitest globalSetup — runs once in the main Node process before workers start.
 *
 * Loads env in priority order:
 *   1. `.env.test` (if present)  — local override; create one to point tests
 *      at an isolated DB without touching `.env.local`
 *   2. `.env.local` (fallback)   — repo's documented dev setup; currently
 *      points at production Neon (per README)
 *
 * Each file is loaded with `override: false` so values set higher in the
 * chain win. A startup line announces which file was loaded so accidental
 * prod-DB hits are visible in the test output.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

export default function setup() {
  const candidates = ['.env.test', '.env.local'];
  for (const file of candidates) {
    const path = resolve(process.cwd(), file);
    if (existsSync(path)) {
      config({ path, override: false });
      console.log(`[vitest setup] loaded env from ${file}`);
      // Continue iterating so later files can fill any gaps without overriding.
    }
  }

  // Belt-and-suspenders prod-DB guard. The integration tests scope writes by
  // randomized actor IDs, but a loud warning still helps catch the case where
  // a developer forgot to create .env.test.
  const url = process.env.POSTGRES_URL ?? '';
  if (url) {
    let host = '<unparseable>';
    try {
      host = new URL(url).host;
    } catch {
      // ignore
    }
    const isTestLike = /localhost|127\.0\.0\.1|-test/i.test(url);
    if (!isTestLike) {
      console.warn(
        `[vitest setup] ⚠️  POSTGRES_URL host "${host}" does not look test-like ` +
          `(no localhost/-test marker). Integration tests will read+write this DB. ` +
          `Create .env.test pointing at an isolated DB to silence this warning.`,
      );
    }
  }
}
