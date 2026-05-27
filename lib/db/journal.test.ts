import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

const journalPath = join(process.cwd(), 'drizzle', 'meta', '_journal.json');
const journal: Journal = JSON.parse(readFileSync(journalPath, 'utf8'));

describe('drizzle journal monotonicity', () => {
  it('has at least one migration entry', () => {
    expect(journal.entries.length).toBeGreaterThan(0);
  });

  it('entries are strictly monotonic by `when`', () => {
    for (let i = 1; i < journal.entries.length; i++) {
      const prev = journal.entries[i - 1];
      const cur = journal.entries[i];
      expect(cur.when).toBeGreaterThan(prev.when);
    }
  });

  it('entries are strictly monotonic by `idx`', () => {
    for (let i = 0; i < journal.entries.length; i++) {
      expect(journal.entries[i].idx).toBe(i);
    }
  });
});
