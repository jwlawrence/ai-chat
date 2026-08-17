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
import {
  appendMessages,
  deleteSession,
  getMessages,
  getSession,
  isSessionId,
  isUserOwnedSession,
  listSessions,
} from './queries';

/** A real uuid: chat_sessions.id is a `uuid` column and the query layer now
 *  short-circuits anything that isn't one. */
const SESSION_ID = '3f1b9d0e-9a1c-4c7e-8f2a-6b5d4e3c2a10';

describe('session id guard — non-UUID ids never reach Postgres', () => {
  // chat_sessions.id is a `uuid` column: a non-UUID parameter aborts the query
  // with 22P02 rather than matching zero rows, so /chat/<garbage> answered 500
  // instead of 404. These ids come straight from user-controlled URLs.
  beforeEach(() => {
    selectMock.mockClear();
    insertMock.mockClear();
  });

  it('recognises a real uuid and rejects the shapes URLs actually carry', () => {
    expect(isSessionId('3f1b9d0e-9a1c-4c7e-8f2a-6b5d4e3c2a10')).toBe(true);
    for (const bad of ['does-not-exist', '', '123', 'undefined', '../../etc/passwd']) {
      expect(isSessionId(bad)).toBe(false);
    }
  });

  it('short-circuits reads without issuing a query', async () => {
    expect(await getSession('does-not-exist', null)).toBeNull();
    expect(await isUserOwnedSession('does-not-exist')).toBe(false);
    expect(await getMessages('does-not-exist', null)).toEqual([]);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('short-circuits writes without issuing a query', async () => {
    await deleteSession('does-not-exist', null);
    await appendMessages('does-not-exist', null, [{ role: 'user', parts: [] }]);
    expect(insertMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
  });
});

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
      limit: vi.fn().mockResolvedValue([{ id: SESSION_ID }]),
    });
    await appendMessages(SESSION_ID, null, [
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

    await appendMessages(SESSION_ID, null, []);

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
      limit: vi.fn().mockResolvedValue([{ id: SESSION_ID }]),
    });
    await appendMessages(SESSION_ID, null, [
      { role: 'user', parts: [{ type: 'text', text: 'only one' }] },
    ]);

    expect(valuesMock).toHaveBeenCalledTimes(1);
    const [rows] = valuesMock.mock.calls[0] as [Array<{ createdAt: Date }>];
    expect(rows).toHaveLength(1);
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });
});
