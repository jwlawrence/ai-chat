import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  db: {},
}));

vi.mock('@auth/drizzle-adapter', () => ({
  DrizzleAdapter: vi.fn(() => ({ __mocked: true })),
}));

import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { authConfig } from './config';

describe('auth config', () => {
  it('registers google and github providers', () => {
    const ids = authConfig.providers.map((p) => (p as unknown as { id?: string }).id);
    expect(ids).toContain('google');
    expect(ids).toContain('github');
    expect(ids).not.toContain('linkedin');
  });

  it('passes all four tables to DrizzleAdapter', () => {
    expect(DrizzleAdapter).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usersTable: expect.anything(),
        accountsTable: expect.anything(),
        sessionsTable: expect.anything(),
        verificationTokensTable: expect.anything(),
      }),
    );
  });

  it('uses database session strategy (needed for session.user.id to be populated by adapter)', () => {
    expect(authConfig.session?.strategy).toBe('database');
  });
});
