import { describe, expect, it } from 'vitest';
import { dynBool, dynNum, dynStr } from './dynamic-value';

describe('dynStr', () => {
  it('accepts a literal string', () => {
    expect(dynStr().safeParse('hello').success).toBe(true);
  });

  it('accepts a { $state: "/path" } reference', () => {
    expect(dynStr().safeParse({ $state: '/path' }).success).toBe(true);
  });

  it('rejects { $state: 5 } (non-string path)', () => {
    expect(dynStr().safeParse({ $state: 5 }).success).toBe(false);
  });

  it('rejects { $state: "/path", extra: 1 } (strict mode catches extras)', () => {
    expect(dynStr().safeParse({ $state: '/path', extra: 1 }).success).toBe(false);
  });

  it('rejects a number', () => {
    expect(dynStr().safeParse(42).success).toBe(false);
  });
});

describe('dynNum', () => {
  it('accepts a literal number', () => {
    expect(dynNum().safeParse(42).success).toBe(true);
  });

  it('accepts a { $state: "/path" } reference', () => {
    expect(dynNum().safeParse({ $state: '/count' }).success).toBe(true);
  });

  it('rejects { $state: 5 } (non-string path)', () => {
    expect(dynNum().safeParse({ $state: 5 }).success).toBe(false);
  });

  it('rejects { $state: "/path", extra: 1 } (strict mode catches extras)', () => {
    expect(dynNum().safeParse({ $state: '/path', extra: 1 }).success).toBe(false);
  });

  it('rejects a string', () => {
    expect(dynNum().safeParse('hello').success).toBe(false);
  });
});

describe('dynBool', () => {
  it('accepts a literal boolean', () => {
    expect(dynBool().safeParse(true).success).toBe(true);
  });

  it('accepts a { $state: "/path" } reference', () => {
    expect(dynBool().safeParse({ $state: '/loading' }).success).toBe(true);
  });

  it('rejects { $state: 5 } (non-string path)', () => {
    expect(dynBool().safeParse({ $state: 5 }).success).toBe(false);
  });

  it('rejects { $state: "/path", extra: 1 } (strict mode catches extras)', () => {
    expect(dynBool().safeParse({ $state: '/path', extra: 1 }).success).toBe(false);
  });

  it('rejects a string', () => {
    expect(dynBool().safeParse('true').success).toBe(false);
  });
});
