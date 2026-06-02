import { describe, expect, it } from 'vitest';
import { dailyUsedFraction, remainingPctLabel } from './usage-fraction';

describe('dailyUsedFraction', () => {
  it('returns 0 when spent is 0 and cap is 1', () => {
    expect(dailyUsedFraction(0, 1)).toBe(0);
  });

  it('returns 0.27 when spent is 0.27 and cap is 1', () => {
    expect(dailyUsedFraction(0.27, 1)).toBeCloseTo(0.27);
  });

  it('clamps to 1 when spent exceeds cap (1.5 / 1)', () => {
    expect(dailyUsedFraction(1.5, 1)).toBe(1);
  });

  it('returns 0 when cap is 0', () => {
    expect(dailyUsedFraction(0.5, 0)).toBe(0);
  });

  it('returns 0 when cap is negative', () => {
    expect(dailyUsedFraction(0.5, -1)).toBe(0);
  });

  it('clamps negative spent to 0', () => {
    expect(dailyUsedFraction(-0.5, 1)).toBe(0);
  });
});

describe('remainingPctLabel', () => {
  it('returns "100% left" when usedFraction is 0', () => {
    expect(remainingPctLabel(0)).toBe('100% left');
  });

  it('returns "73% left" when usedFraction is 0.27', () => {
    expect(remainingPctLabel(0.27)).toBe('73% left');
  });

  it('returns "0% left" when usedFraction is 1', () => {
    expect(remainingPctLabel(1)).toBe('0% left');
  });

  it('returns "0% left" when usedFraction exceeds 1', () => {
    expect(remainingPctLabel(1.5)).toBe('0% left');
  });
});
