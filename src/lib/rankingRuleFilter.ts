import type { RuleVersionMeta } from "@/lib/apiClient";

/** 本届排行榜默认规则：五维 20 分 + AI_SCORE v4（与解析器对齐） */
export const DEFAULT_RANKING_RULE_ID = "rule_1773792000_cn5d4";

/** 旧 JSON 无 rule_version_id 时的筛选项 */
export const LEGACY_RULE_FILTER_VALUE = "__legacy_no_rule__";

export interface RuleFilterOption {
  value: string;
  label: string;
  /** 短 SHA 预览（列表用） */
  shaShort?: string;
  /** 完整 SHA256（详情行用） */
  sha256?: string;
}

export function filterRankingsByRule<T extends { rule_version_id?: string }>(rows: T[], ruleFilterId: string): T[] {
  if (ruleFilterId === LEGACY_RULE_FILTER_VALUE) {
    return rows.filter((r) => !(r.rule_version_id || "").trim());
  }
  return rows.filter((r) => (r.rule_version_id || "").trim() === ruleFilterId);
}

/**
 * 下拉选项：数据中出现过的规则 + 默认规则 ID（便于空表提示）；可选「无规则存证」旧数据。
 */
export function buildRuleFilterOptions(
  rows: { rule_version_id?: string; rule_sha256?: string }[],
  versionMetas: RuleVersionMeta[]
): RuleFilterOption[] {
  const metaById = new Map(versionMetas.map((m) => [m.id, m]));
  const shaFromRows = new Map<string, string>();
  const inData = new Set<string>();
  let hasLegacy = false;
  for (const r of rows) {
    const id = (r.rule_version_id || "").trim();
    if (!id) {
      hasLegacy = true;
      continue;
    }
    inData.add(id);
    if (r.rule_sha256 && !shaFromRows.has(id)) shaFromRows.set(id, r.rule_sha256);
  }

  const ids = new Set<string>(inData);
  ids.add(DEFAULT_RANKING_RULE_ID);

  const opts: RuleFilterOption[] = [];
  for (const id of ids) {
    const m = metaById.get(id);
    const label = m?.name ? `${m.name}${m.version ? ` · v${m.version}` : ""}` : id;
    const sha256 = m?.sha256 || shaFromRows.get(id);
    const shaShort = sha256 ? `${sha256.slice(0, 16)}…` : undefined;
    opts.push({ value: id, label, shaShort, sha256 });
  }

  if (hasLegacy) {
    opts.push({ value: LEGACY_RULE_FILTER_VALUE, label: "", shaShort: undefined });
  }

  opts.sort((a, b) => {
    if (a.value === DEFAULT_RANKING_RULE_ID) return -1;
    if (b.value === DEFAULT_RANKING_RULE_ID) return 1;
    if (a.value === LEGACY_RULE_FILTER_VALUE) return 1;
    if (b.value === LEGACY_RULE_FILTER_VALUE) return -1;
    return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
  });

  return opts;
}
