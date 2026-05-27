/**
 * Fix #13: Unit tests for appendMessages timestamp stamping.
 *
 * appendMessages gives each row a distinct createdAt value offset by its array
 * index so that ORDER BY created_at ASC reliably returns messages in insertion
 * order (Postgres's defaultNow() evaluates once per statement, causing ties).
 *
 * We mock @/lib/db/client so no real database is required.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spy on drizzle-orm eq and isNull so we can assert which branch runs.
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: vi.fn(actual.eq),
    isNull: vi.fn(actual.isNull),
  };
});

// ---------------------------------------------------------------------------
// Mock @/lib/db/client BEFORE importing queries.
// vi.mock() is hoisted to the top of the file by vitest's transform, so we
// cannot reference module-level variables inside the factory — we use
// vi.hoisted() to declare the mocks in a way the factory can safely close over.
// ---------------------------------------------------------------------------

const { valuesMock, insertMock, orderByMock, whereMock, selectMock } = vi.hoisted(() => {
  const orderByMock = vi.fn().mockResolvedValue([]);
  const limitMock = vi.fn().mockResolvedValue([]);
  const whereMock = vi.fn(() => ({ orderBy: orderByMock, limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const valuesMock = vi.fn();
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  return { valuesMock, insertMock, orderByMock, whereMock, selectMock };
});

vi.mock('@/lib/db/client', () => ({
  db: { insert: insertMock, select: selectMock, update: vi.fn(), delete: vi.fn() },
}));

// Import AFTER the mocks are registered.
import { eq, isNull } from 'drizzle-orm';
import { appendMessages, listSessions } from './queries';

describe('listSessions — userId filtering', () => {
  beforeEach(() => {
    vi.mocked(eq).mockClear();
    vi.mocked(isNull).mockClear();
    whereMock.mockClear();
    orderByMock.mockClear();
    selectMock.mockClear();
  });

  it('short-circuits to [] when userId is null (no DB call)', async () => {
    const result = await listSessions(null);
    expect(result).toEqual([]);
    expect(whereMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('calls eq with userId when string given (not isNull)', async () => {
    orderByMock.mockResolvedValueOnce([]);
    await listSessions('user-123');
    expect(vi.mocked(eq)).toHaveBeenCalled();
    expect(vi.mocked(isNull)).not.toHaveBeenCalled();
    expect(whereMock).toHaveBeenCalled();
  });
});

describe('appendMessages — Fix #13: distinct createdAt per row', () => {
  it('stamps each row with a monotonically-increasing createdAt', async () => {
    valuesMock.mockResolvedValue(undefined);

    // Ownership gate: make the select mock return a matching session row.
    whereMock.mockReturnValueOnce({
      orderBy: orderByMock,
      limit: vi.fn().mockResolvedValue([{ id: 'session-abc' }]),
    });
    await appendMessages('session-abc', null, [
      { role: 'user', parts: [{ type: 'text', text: 'hello' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'world' }] },
    ]);

    // .values() should have been called once with two rows.
    expect(valuesMock).toHaveBeenCalledTimes(1);
    const [rows] = valuesMock.mock.calls[0] as [Array<{ createdAt: Date }>];
    expect(rows).toHaveLength(2);

    const t0 = rows[0].createdAt.getTime();
    const t1 = rows[1].createdAt.getTime();

    // Rows must have distinct, monotonically-increasing timestamps.
    expect(t1).toBeGreaterThan(t0);
    // The second row's timestamp should be exactly 1 ms after the first.
    expect(t1 - t0).toBe(1);
  });

  it('is a no-op when the input array is empty', async () => {
    valuesMock.mockClear();
    insertMock.mockClear();

    await appendMessages('session-abc', null, []);

    // db.insert should not have been called at all.
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('stamps a single-element batch with the base timestamp', async () => {
    valuesMock.mockClear();
    insertMock.mockClear();
    valuesMock.mockResolvedValue(undefined);

    // Ownership gate: make the select mock return a matching session row.
    whereMock.mockReturnValueOnce({
      orderBy: orderByMock,
      limit: vi.fn().mockResolvedValue([{ id: 'session-single' }]),
    });
    await appendMessages('session-single', null, [
      { role: 'user', parts: [{ type: 'text', text: 'only one' }] },
    ]);

    expect(valuesMock).toHaveBeenCalledTimes(1);
    const [rows] = valuesMock.mock.calls[0] as [Array<{ createdAt: Date }>];
    expect(rows).toHaveLength(1);
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });
});
