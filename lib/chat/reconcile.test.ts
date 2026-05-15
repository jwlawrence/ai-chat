import { describe, expect, it } from 'vitest';
import { reconcileIncoming } from './reconcile';

type Msg = { id: string };

const m = (id: string): Msg => ({ id });
const seq = (n: number): Msg[] => Array.from({ length: n }, (_, i) => m(`m${i + 1}`));

describe('reconcileIncoming — normal send', () => {
  it('trims 0 and returns the one trailing user message when incoming is dbCount + 1', () => {
    const incoming = [...seq(4), m('new-user')];
    const { trimCount, newMessages } = reconcileIncoming(4, incoming);
    expect(trimCount).toBe(0);
    expect(newMessages).toEqual([m('new-user')]);
  });

  it('treats a brand-new session (dbCount=0) like a normal send', () => {
    const incoming = [m('first')];
    const { trimCount, newMessages } = reconcileIncoming(0, incoming);
    expect(trimCount).toBe(0);
    expect(newMessages).toEqual([m('first')]);
  });
});

describe('reconcileIncoming — regenerate', () => {
  it('trims 1 (the dropped assistant message) and returns no new messages', () => {
    // DB has [user1, asst1, user2, asst2]. Client regenerates by dropping asst2.
    const incoming = seq(3); // [m1, m2, m3]
    const { trimCount, newMessages } = reconcileIncoming(4, incoming);
    expect(trimCount).toBe(1);
    expect(newMessages).toEqual([]);
  });
});

describe('reconcileIncoming — multi-trim', () => {
  it('trims (dbCount - incoming.length) and returns no new messages', () => {
    // Client truncated history back to 2 turns; DB has 4.
    const { trimCount, newMessages } = reconcileIncoming(4, seq(2));
    expect(trimCount).toBe(2);
    expect(newMessages).toEqual([]);
  });

  it('trims all DB messages when incoming is empty', () => {
    const { trimCount, newMessages } = reconcileIncoming(5, []);
    expect(trimCount).toBe(5);
    expect(newMessages).toEqual([]);
  });
});

describe('reconcileIncoming — multi-append', () => {
  it('appends the trailing (incoming.length - dbCount) messages with no trim', () => {
    const incoming = [...seq(4), m('newA'), m('newB')];
    const { trimCount, newMessages } = reconcileIncoming(4, incoming);
    expect(trimCount).toBe(0);
    expect(newMessages).toEqual([m('newA'), m('newB')]);
  });
});

describe('reconcileIncoming — idle', () => {
  it('does nothing when DB count matches incoming length', () => {
    const { trimCount, newMessages } = reconcileIncoming(4, seq(4));
    expect(trimCount).toBe(0);
    expect(newMessages).toEqual([]);
  });
});

describe('reconcileIncoming — invariants', () => {
  it('never returns a negative trimCount even when DB has fewer than incoming', () => {
    const { trimCount } = reconcileIncoming(0, seq(3));
    expect(trimCount).toBeGreaterThanOrEqual(0);
  });

  it('newMessages.length + (dbCount - trimCount) always equals incoming.length', () => {
    // The total messages we end up "logically owning" must match what the client sent.
    const cases: Array<[number, number]> = [
      [0, 0],
      [0, 1],
      [4, 5],
      [4, 3],
      [4, 4],
      [4, 0],
      [4, 6],
      [10, 1],
    ];
    for (const [dbCount, n] of cases) {
      const { trimCount, newMessages } = reconcileIncoming(dbCount, seq(n));
      expect(newMessages.length + (dbCount - trimCount)).toBe(n);
    }
  });

  it('returns a fresh array (does not alias incoming) so callers can safely mutate', () => {
    const incoming = [...seq(4), m('new')];
    const { newMessages } = reconcileIncoming(4, incoming);
    expect(newMessages).not.toBe(incoming);
    newMessages.push(m('mutation'));
    expect(incoming).toHaveLength(5);
  });
});
