import type { RuleVersionMeta } from "@/lib/apiClient";

/** 不按 rule_version_id 过滤：分档统计与管理员控制台一致（含所有存证规则） */
export const ALL_RULES_FILTER_VALUE = "__all_rules__";

/** 旧 JSON 无 rule_version_id 时的筛选项 */
export const LEGACY_RULE_FILTER_VALUE = "__legacy_no_rule__";

const RULE_ID_UNIX_RE = /^rule_(\d+)_/;

/** 用于排序/默认选中：越大越新（毫秒） */
export function ruleVersionRecencyMs(id: string, metaById: Map<string, RuleVersionMeta>): number {
  const m = metaById.get(id);
  if (m?.uploaded_at) {
    const t = Date.parse(m.uploaded_at);
    if (Number.isFinite(t)) return t;
  }
  const match = id.match(RULE_ID_UNIX_RE);
  if (match) return parseInt(match[1], 10) * 1000;
  return 0;
}

export interface RuleFilterOption {
  value: string;
  label: string;
  /** 短 SHA 预览（列表用） */
  shaShort?: string;
  /** 完整 SHA256（详情行用） */
  sha256?: string;
}

export function filterRankingsByRule<T extends { rule_version_id?: string }>(rows: T[], ruleFilterId: string): T[] {
  if (ruleFilterId === ALL_RULES_FILTER_VALUE) {
    return [...rows];
  }
  if (ruleFilterId === LEGACY_RULE_FILTER_VALUE) {
    return rows.filter((r) => !(r.rule_version_id || "").trim());
  }
  return rows.filter((r) => (r.rule_version_id || "").trim() === ruleFilterId);
}

/** 后端对 judge-result 里出现但无本地 YAML 的版本标记 is_orphan；下拉与默认选中均排除 */
function isOrphanRuleMeta(m: RuleVersionMeta | undefined): boolean {
  return m?.is_orphan === true;
}

function pickActiveRuleVersionId(versionMetas: RuleVersionMeta[], metaById: Map<string, RuleVersionMeta>): string | null {
  const actives = versionMetas.filter((m) => m.is_active && !isOrphanRuleMeta(m));
  if (actives.length === 0) return null;
  actives.sort(
    (a, b) => ruleVersionRecencyMs(b.id, metaById) - ruleVersionRecencyMs(a.id, metaById)
  );
  return actives[0]!.id;
}

/**
 * 无用户覆盖时的默认规则：
 * 1) 若服务端规则列表中存在 is_active 的激活版本，优先选之（多个激活则取时间最近的一条）；
 * 2) 否则若排行榜中存在带 rule_version_id 的行，取其中时间最近的一条（跳过 is_orphan 仅存证项）；
 * 3) 否则若仅有旧数据（无版本号），选「旧数据」；
 * 4) 否则若服务端有规则版本列表，取其中 uploaded_at 最新的一条（跳过 is_orphan）；
 * 5) 否则回退到 LEGACY（极少见，且此时下拉通常为空）。
 */
export function computeDefaultRuleFilterId(
  rows: { rule_version_id?: string }[],
  versionMetas: RuleVersionMeta[]
): string {
  const metaById = new Map(versionMetas.map((m) => [m.id, m]));

  const activeId = pickActiveRuleVersionId(versionMetas, metaById);
  if (activeId) {
    return activeId;
  }

  const idsFromRows = new Set<string>();
  let hasLegacy = false;
  for (const r of rows) {
    const id = (r.rule_version_id || "").trim();
    if (!id) hasLegacy = true;
    else idsFromRows.add(id);
  }

  const rowIdsNonOrphan = [...idsFromRows].filter((id) => !isOrphanRuleMeta(metaById.get(id)));
  if (rowIdsNonOrphan.length > 0) {
    const sorted = rowIdsNonOrphan.sort(
      (a, b) => ruleVersionRecencyMs(b, metaById) - ruleVersionRecencyMs(a, metaById)
    );
    return sorted[0]!;
  }

  if (hasLegacy && rows.length > 0) {
    return LEGACY_RULE_FILTER_VALUE;
  }

  const metasWithYaml = versionMetas.filter((m) => !isOrphanRuleMeta(m));
  if (metasWithYaml.length > 0) {
    const sorted = [...metasWithYaml].sort(
      (a, b) => ruleVersionRecencyMs(b.id, metaById) - ruleVersionRecencyMs(a.id, metaById)
    );
    return sorted[0]!.id;
  }

  return LEGACY_RULE_FILTER_VALUE;
}

/**
 * 下拉选项：排行榜中出现过的规则 + 服务端登记过的版本（空榜时仍可切换规则）；
 * 不含 is_orphan（仅存证、无本地 YAML）项。可选「无规则存证」旧数据。按时间从新到旧排序（legacy 最后）。
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
  for (const m of versionMetas) {
    ids.add(m.id);
  }

  const opts: RuleFilterOption[] = [];
  for (const id of ids) {
    const m = metaById.get(id);
    if (isOrphanRuleMeta(m)) continue;
    const label = m?.name ? `${m.name}${m.version ? ` · v${m.version}` : ""}` : id;
    const sha256 = m?.sha256 || shaFromRows.get(id);
    const shaShort = sha256 ? `${sha256.slice(0, 16)}…` : undefined;
    opts.push({ value: id, label, shaShort, sha256 });
  }

  if (hasLegacy) {
    opts.push({ value: LEGACY_RULE_FILTER_VALUE, label: "", shaShort: undefined });
  }

  opts.sort((a, b) => {
    if (a.value === LEGACY_RULE_FILTER_VALUE) return 1;
    if (b.value === LEGACY_RULE_FILTER_VALUE) return -1;
    return ruleVersionRecencyMs(b.value, metaById) - ruleVersionRecencyMs(a.value, metaById);
  });

  const allOpt: RuleFilterOption = {
    value: ALL_RULES_FILTER_VALUE,
    label: "",
    shaShort: undefined,
    sha256: undefined,
  };
  return [allOpt, ...opts];
}
