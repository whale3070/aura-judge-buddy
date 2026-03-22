import type { AuditReport } from "@/lib/api";

/** 五维满分 20，与评审规则一致 */
export const FIVE_DIM_KEYS_ZH = ["创新性", "技术实现", "商业价值", "用户体验", "落地可行性"] as const;
export type FiveDimKeyZh = (typeof FIVE_DIM_KEYS_ZH)[number];

export type LetterTier = "S" | "A" | "B" | "C" | "D" | "?";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 从单条评审正文中解析五维分数（0–20）。
 * 支持「创新性: 18」「创新性：18/20」等形式；英文维度名作为补充。
 */
export function parseFiveDimsOutOf20(content: string): Partial<Record<FiveDimKeyZh, number>> {
  const out: Partial<Record<FiveDimKeyZh, number>> = {};
  if (!content?.trim()) return out;

  for (const k of FIVE_DIM_KEYS_ZH) {
    const re = new RegExp(`${escapeRegExp(k)}\\s*[:：]\\s*(\\d{1,2})(?:\\s*\\/\\s*20)?`, "im");
    const m = content.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 0 && n <= 20) out[k] = n;
    }
  }

  const englishPairs: { re: RegExp; key: FiveDimKeyZh }[] = [
    { re: /\bInnovation\s*[:：]\s*(\d{1,2})(?:\s*\/\s*20)?/im, key: "创新性" },
    { re: /\bTechnical\s*(?:execution|implementation)?\s*[:：]\s*(\d{1,2})(?:\s*\/\s*20)?/im, key: "技术实现" },
    { re: /\bBusiness\s*(?:value)?\s*[:：]\s*(\d{1,2})(?:\s*\/\s*20)?/im, key: "商业价值" },
    { re: /\bUser\s*(?:experience|UX)?\s*[:：]\s*(\d{1,2})(?:\s*\/\s*20)?/im, key: "用户体验" },
    { re: /\bFeasibility\s*[:：]\s*(\d{1,2})(?:\s*\/\s*20)?/im, key: "落地可行性" },
  ];
  for (const { re, key } of englishPairs) {
    if (out[key] !== undefined) continue;
    const m = content.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 0 && n <= 20) out[key] = n;
    }
  }

  return out;
}

/** 多模型报告：各维度取有解析结果的模型的算术平均；任缺一维则无法定级（返回 null）。 */
export function averageFiveDims(reports: Pick<AuditReport, "content" | "error">[]): Record<FiveDimKeyZh, number> | null {
  const parsed: Partial<Record<FiveDimKeyZh, number>>[] = [];
  for (const r of reports) {
    if (r.error) continue;
    const d = parseFiveDimsOutOf20(r.content);
    if (Object.keys(d).length > 0) parsed.push(d);
  }
  if (parsed.length === 0) return null;

  const agg = {} as Record<FiveDimKeyZh, number>;
  for (const k of FIVE_DIM_KEYS_ZH) {
    let sum = 0;
    let c = 0;
    for (const p of parsed) {
      const v = p[k];
      if (typeof v === "number") {
        sum += v;
        c++;
      }
    }
    if (c === 0) return null;
    agg[k] = sum / c;
  }
  return agg;
}

/**
 * S：五维均 ≥18
 * A：至少三维 ≥15
 * B：至少二维 ≥12
 * C：至少一维 ≥12
 * D：无一维 ≥12
 * 优先级自上而下。
 */
export function letterTierFromAveragedDims(avg: Record<FiveDimKeyZh, number> | null): LetterTier {
  if (!avg) return "?";
  const scores = FIVE_DIM_KEYS_ZH.map((k) => avg[k]);
  if (scores.every((s) => s >= 18)) return "S";
  const ge15 = scores.filter((s) => s >= 15).length;
  if (ge15 >= 3) return "A";
  const ge12 = scores.filter((s) => s >= 12).length;
  if (ge12 >= 2) return "B";
  if (ge12 >= 1) return "C";
  return "D";
}

export function letterTierFromReports(reports: Pick<AuditReport, "content" | "error">[] | undefined): LetterTier {
  if (!reports?.length) return "?";
  return letterTierFromAveragedDims(averageFiveDims(reports));
}
