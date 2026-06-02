// @vitest-environment jsdom

/**
 * Unit tests for delete-confirm.tsx.
 *
 * Primary goal: assert the pure isViewingSession helper that is testable
 * without DOM or React.
 */

import { describe, expect, it } from 'vitest';
import { isViewingSession } from './delete-confirm';

describe('isViewingSession', () => {
  it('returns true when currentPath matches /chat/<sessionId>', () => {
    expect(isViewingSession('abc', '/chat/abc')).toBe(true);
  });

  it('returns false when currentPath is /chat (root, not a session)', () => {
    expect(isViewingSession('abc', '/chat')).toBe(false);
  });

  it('returns false when currentPath is a different session', () => {
    expect(isViewingSession('abc', '/chat/other')).toBe(false);
  });

  it('returns false when path has a trailing slash', () => {
    expect(isViewingSession('abc', '/chat/abc/')).toBe(false);
  });

  it('returns false when path has extra segments', () => {
    expect(isViewingSession('abc', '/chat/abc/settings')).toBe(false);
  });
});
