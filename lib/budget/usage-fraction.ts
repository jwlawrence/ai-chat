export function dailyUsedFraction(spentUsd: number, capUsd: number): number {
  if (capUsd <= 0) return 0;
  const spent = Math.max(0, spentUsd);
  return Math.min(1, spent / capUsd);
}

export function remainingPctLabel(usedFraction: number): string {
  return `${Math.max(0, Math.round((1 - usedFraction) * 100))}% left`;
}
