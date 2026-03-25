import type { RuleSet } from "@/lib/rulesApi";
import { FOUR_DIM_RUBRIC_KEYS_EN, FIVE_DIM_KEYS_ZH } from "@/lib/dimensionTier";

export type JudgeRubricMode = "five20" | "four10" | "generic";

export function inferJudgeRubricMode(ruleSet: RuleSet | null): JudgeRubricMode {
  if (!ruleSet?.dimensions?.length) return "generic";
  const dims = ruleSet.dimensions;
  const names = dims.map((d) => d.name.trim());

  const matchesFourEN =
    names.length === FOUR_DIM_RUBRIC_KEYS_EN.length &&
    FOUR_DIM_RUBRIC_KEYS_EN.every((k, i) => names[i] === k);
  if (matchesFourEN) return "four10";

  const fiveNeed = new Set<string>([...FIVE_DIM_KEYS_ZH]);
  if (names.length === 5 && names.every((n) => fiveNeed.has(n))) return "five20";

  if (dims.length === 4 && dims.every((d) => (d.max ?? 10) <= 10)) return "four10";
  if (dims.length === 5 && dims.every((d) => (d.max ?? 20) <= 20)) return "five20";

  return "generic";
}

export function tierFoldHeadline(mode: JudgeRubricMode, dimCount: number): string {
  switch (mode) {
    case "five20":
      return "五维 0–20 分档（与规则页一致）";
    case "four10":
      return "四维 0–10 分档（与规则页一致）";
    default:
      return dimCount > 0
        ? `${dimCount} 个评分维度 · 档位与规则页 notes / 阶梯说明一致`
        : "分档（与当前激活规则一致）";
  }
}
