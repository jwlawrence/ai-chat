import { describe, expect, it } from 'vitest';
import { resolveActor } from './identity';

describe('resolveActor', () => {
  it('prefers user_id when both present', () => {
    expect(resolveActor({ userId: 'u1', anonymousId: 'a1' })).toEqual({
      actorKind: 'user',
      actorId: 'u1',
    });
  });

  it('falls back to anonymous_id when user_id missing', () => {
    expect(resolveActor({ userId: null, anonymousId: 'a1' })).toEqual({
      actorKind: 'anonymous',
      actorId: 'a1',
    });
  });

  it('returns null when both are missing (graceful degradation pre-Phase-4)', () => {
    expect(resolveActor({ userId: null, anonymousId: null })).toBeNull();
  });
});
