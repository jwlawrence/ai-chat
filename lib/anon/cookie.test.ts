import { describe, expect, it } from 'vitest';
import { makeAnonId, signAnonId, verifyAnonCookie } from './cookie';

const SECRET = 'test-secret-32-chars-long-xxxxxxx';

describe('pac_anon cookie', () => {
  it('round-trips a signed id', async () => {
    const id = makeAnonId();
    const cookieValue = await signAnonId(id, SECRET);
    expect(await verifyAnonCookie(cookieValue, SECRET)).toBe(id);
  });

  it('makeAnonId returns 21-char URL-safe nanoid', () => {
    const id = makeAnonId();
    expect(id).toHaveLength(21);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects an unsigned id', async () => {
    expect(await verifyAnonCookie('not-a-real-cookie', SECRET)).toBeNull();
  });

  it('rejects a cookie with no dot separator', async () => {
    expect(await verifyAnonCookie('nodothere', SECRET)).toBeNull();
  });

  it('rejects a tampered cookie', async () => {
    const id = makeAnonId();
    const cookieValue = await signAnonId(id, SECRET);
    const tampered = `${cookieValue.slice(0, -3)}xyz`;
    expect(await verifyAnonCookie(tampered, SECRET)).toBeNull();
  });

  it('rejects with a wrong secret', async () => {
    const id = makeAnonId();
    const cookieValue = await signAnonId(id, SECRET);
    expect(await verifyAnonCookie(cookieValue, 'different-secret-xxxxxxxxxxxxxxxx')).toBeNull();
  });
});
