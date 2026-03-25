/** 与后端一致：rubric_raw_max>0 时 avg 为原始分总和，否则 avg 为 0–100 归一百分位 */

export function scoreNorm100(
  avgScore: number,
  rubricRawMax?: number | null | undefined
): number {
  const max = rubricRawMax ?? 0;
  if (max > 0 && Number.isFinite(avgScore)) {
    const n = (avgScore / max) * 100;
    return Math.min(100, Math.max(0, n));
  }
  if (!Number.isFinite(avgScore)) return 0;
  return Math.min(100, Math.max(0, avgScore));
}

export function formatPrimaryScoreLabel(
  avgScore: number,
  rubricRawMax?: number | null | undefined
): string {
  const max = rubricRawMax ?? 0;
  if (max > 0 && Number.isFinite(avgScore)) {
    const m = max % 1 === 0 ? String(Math.round(max)) : max.toFixed(1);
    return `${avgScore.toFixed(1)} / ${m}`;
  }
  return Number.isFinite(avgScore) ? avgScore.toFixed(1) : "—";
}

/** 排名合并：优先按归一百分位降序，再按 raw/legacy 分数降序 */
export function compareRankingScoreDesc(
  a: { avg_score: number; rubric_raw_max?: number },
  b: { avg_score: number; rubric_raw_max?: number }
): number {
  const da = scoreNorm100(a.avg_score, a.rubric_raw_max);
  const db = scoreNorm100(b.avg_score, b.rubric_raw_max);
  if (db !== da) return db - da;
  return b.avg_score - a.avg_score;
}
