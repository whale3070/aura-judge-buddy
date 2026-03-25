import type { SavedResult } from "@/lib/apiClient";
import type { TransKey } from "@/lib/i18n";
import {
  ALL_RULES_FILTER_VALUE,
  LEGACY_RULE_FILTER_VALUE,
  type RuleFilterOption,
} from "@/lib/rankingRuleFilter";
import {
  FIVE_DIM_KEYS_ZH,
  averageFiveDims,
  letterTierFromReports,
  type LetterTier,
} from "@/lib/dimensionTier";
import {
  loadDuelBracketSnapshot,
  getDuelMatchesForFileSet,
  buildFileNameAliasGroups,
  bracketRankIndexForAliases,
  usesRoundRobinLiteRanking,
  sortArenaTierItems,
  tierHasBracketEvidence,
  isPkRoundRobinArenaFormat,
  getBracketSliceForTier,
  type DuelBracketSnapshot,
  type StoredDuelMatch,
} from "@/lib/duelBracketStorage";

const TIER_ORDER: LetterTier[] = ["S", "A", "B", "C", "D", "?"];

const DIM_EN = ["Innovation", "Technical execution", "Business value", "User experience", "Feasibility"] as const;

function mergeByTitle(rankings: SavedResult[], titleMap: Record<string, string>): SavedResult[] {
  const map = new Map<string, SavedResult>();
  for (const item of rankings) {
    const title = titleMap[item.file_name] || item.file_name;
    const existing = map.get(title);
    if (!existing || item.avg_score > existing.avg_score) map.set(title, item);
  }
  return Array.from(map.values());
}

function displayLabel(item: SavedResult, titleMap: Record<string, string>): string {
  return titleMap[item.file_name] || item.file_name;
}

function resolveGithubUrl(item: SavedResult, fileGithubMap: Record<string, string>): string | undefined {
  const u = (item.github_url || fileGithubMap[item.file_name] || "").trim();
  if (!u) return undefined;
  if (!/^https?:\/\//i.test(u)) return undefined;
  return u;
}

function sortWithinTier(
  items: SavedResult[],
  tier: LetterTier,
  snap: DuelBracketSnapshot | null,
  titleMap: Record<string, string>,
  fileAliases: Map<string, string[]>
): SavedResult[] {
  const label = (it: SavedResult) => displayLabel(it, titleMap).toLowerCase();
  if (!snap || !tierHasBracketEvidence(snap, tier)) {
    return [...items].sort((a, b) => label(a).localeCompare(label(b), "zh-Hans-CN"));
  }
  if (usesRoundRobinLiteRanking(snap, tier)) {
    return sortArenaTierItems(items, tier, snap, true, fileAliases, label);
  }
  const idx = (it: SavedResult) => {
    const names = fileAliases.get(it.file_name) ?? [it.file_name];
    return bracketRankIndexForAliases(names, snap, tier);
  };
  return [...items].sort((a, b) => idx(a) - idx(b));
}

function buildByTier(
  rankings: SavedResult[],
  titleMap: Record<string, string>,
  snap: DuelBracketSnapshot | null,
  fileAliases: Map<string, string[]>
): Record<LetterTier, SavedResult[]> {
  const merged = mergeByTitle(rankings, titleMap);
  const groups: Record<LetterTier, SavedResult[]> = {
    S: [],
    A: [],
    B: [],
    C: [],
    D: [],
    "?": [],
  };
  for (const item of merged) {
    const tier = letterTierFromReports(item.reports);
    groups[tier].push(item);
  }
  for (const tier of TIER_ORDER) {
    groups[tier] = sortWithinTier(groups[tier], tier, snap, titleMap, fileAliases);
  }
  return groups;
}

function ruleFilterExportLabel(
  option: RuleFilterOption | undefined,
  t: (k: TransKey, vars?: Record<string, string>) => string
): string {
  if (!option) return "—";
  if (option.value === ALL_RULES_FILTER_VALUE) return t("ranking.ruleAllRulesOption");
  if (option.value === LEGACY_RULE_FILTER_VALUE) return t("ranking.ruleLegacyOption");
  return option.label ? `${option.label} — ${option.value}` : option.value;
}

function indentAsCodeBlock(s: string): string {
  return s.split("\n").map((line) => (line.length ? `    ${line}` : "")).join("\n");
}

function duelDimLabel(index: number, lang: "zh" | "en"): string {
  const i = index - 1;
  if (i < 0 || i >= 5) return `Dim ${index}`;
  return lang === "zh" ? FIVE_DIM_KEYS_ZH[i] : DIM_EN[i];
}

function sideProjectLabel(side: string, m: StoredDuelMatch): string {
  const s = side.toUpperCase();
  if (s === "A" && m.titleA) return m.titleA;
  if (s === "B" && m.titleB) return m.titleB;
  return side;
}

function mdTableCell(s: string): string {
  return String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function formatDuelMatchMarkdown(
  m: StoredDuelMatch,
  lang: "zh" | "en",
  t: (k: TransKey, vars?: Record<string, string>) => string
): string {
  const lines: string[] = [];
  if (m.status === "skipped" && m.error) {
    lines.push(`- **skipped:** ${mdTableCell(m.error)}`);
    return lines.join("\n");
  }
  if (m.status === "error" && m.error) {
    lines.push(`- **error:** ${mdTableCell(m.error)}`);
    return lines.join("\n");
  }
  const dims = m.dimension_winners;
  const counts = m.dim_vote_counts;
  if (dims && dims.length > 0) {
    lines.push(`**${t("ranking.duelFiveDimTitle")}**`);
    if (counts) {
      lines.push("");
      lines.push(t("ranking.duelFiveDimScoreAB", { a: String(counts.A), b: String(counts.B) }));
    }
    lines.push("");
    lines.push(`| ${t("ranking.duelFiveDimColDim")} | ${t("ranking.duelFiveDimColWinner")} |`);
    lines.push("| --- | --- |");
    for (const d of dims) {
      lines.push(
        `| ${mdTableCell(duelDimLabel(d.index, lang))} | ${mdTableCell(sideProjectLabel(d.winner, m))} |`
      );
    }
    lines.push("");
  }
  if (m.reason?.trim()) {
    lines.push(`**${t("ranking.duelReason")}**`);
    lines.push("");
    lines.push(indentAsCodeBlock(m.reason.trim()));
    lines.push("");
  }
  return lines.join("\n");
}

export interface BuildRankingMarkdownParams {
  lang: "zh" | "en";
  t: (k: TransKey, vars?: Record<string, string>) => string;
  roundId: string;
  pageUrl?: string;
  rankings: SavedResult[];
  /** 未传则与 rankings 相同 */
  allRankingsForAliases?: SavedResult[];
  titleMap: Record<string, string>;
  fileGithubMap: Record<string, string>;
  ruleFilterOption?: RuleFilterOption;
}

export function buildRankingMarkdownExport(p: BuildRankingMarkdownParams): string {
  const { t, roundId, rankings, titleMap, fileGithubMap, ruleFilterOption, pageUrl, lang } = p;
  const allForAlias = p.allRankingsForAliases ?? rankings;
  const fileAliases = buildFileNameAliasGroups(allForAlias, titleMap);
  const snap = loadDuelBracketSnapshot(roundId);
  const snapHasAnyArena = Boolean(
    snap && (["S", "A", "B"] as const).some((t) => tierHasBracketEvidence(snap, t))
  );
  const byTier = buildByTier(rankings, titleMap, snap, fileAliases);

  const lines: string[] = [];
  lines.push(`# ${t("ranking.title")}`);
  lines.push("");
  lines.push(`**round_id:** \`${roundId}\``);
  if (pageUrl) {
    lines.push("");
    lines.push(`**${t("ranking.exportPageUrl")}** ${pageUrl}`);
  }
  lines.push("");
  lines.push(`**${t("ranking.exportGeneratedAt")}** ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`**${t("ranking.exportRuleFilter")}** ${ruleFilterExportLabel(ruleFilterOption, t)}`);
  if (
    ruleFilterOption &&
    ruleFilterOption.value !== ALL_RULES_FILTER_VALUE &&
    ruleFilterOption.value !== LEGACY_RULE_FILTER_VALUE &&
    ruleFilterOption.sha256
  ) {
    lines.push("");
    lines.push(t("ranking.ruleSelectedMeta", { id: ruleFilterOption.value, sha: ruleFilterOption.sha256 }));
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(t("ranking.note"));
  lines.push("");
  if (snapHasAnyArena && snap) {
    for (const tier of ["S", "A", "B"] as const) {
      if (!tierHasBracketEvidence(snap, tier)) continue;
      const slice = getBracketSliceForTier(snap, tier);
      lines.push(
        isPkRoundRobinArenaFormat(slice?.arenaFormat)
          ? t("ranking.bracketOrderHintRr", { tier })
          : t("ranking.bracketOrderHint", { tier })
      );
    }
    lines.push("");
    lines.push(
      `*${t("ranking.exportBracketSavedAt")} ${snap.savedAt} · poolTier ${snap.poolTier}${
        snap.otherPoolTiers && Object.keys(snap.otherPoolTiers).length
          ? ` + ${Object.keys(snap.otherPoolTiers).join(", ")}`
          : ""
      }*`
    );
  } else {
    lines.push(t("ranking.noBracketUiHint"));
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const tier of TIER_ORDER) {
    const list = byTier[tier];
    if (list.length === 0) continue;

    const tierHeading =
      tier === "?" ? t("ranking.tierUnknown") : t("ranking.tierSection", { tier });
    lines.push(`## ${tierHeading}`);
    lines.push("");

    list.forEach((item, i) => {
      const title = displayLabel(item, titleMap);
      const gh = resolveGithubUrl(item, fileGithubMap);
      lines.push(`### ${i + 1}. ${title}`);
      lines.push("");
      if (title !== item.file_name) {
        lines.push(`- **${t("ranking.exportReadmeFile")}** \`${item.file_name}\``);
      }
      if (gh) {
        lines.push(`- **${t("ranking.exportRepo")}** [${gh}](${gh})`);
      } else {
        lines.push(`- *${t("ranking.sourceRepoUnknown")}*`);
      }
      lines.push(`- **${t("ranking.exportAvgScore")}** ${item.avg_score}`);
      lines.push(`- **${t("ranking.timestamp")}** ${item.timestamp}`);
      if (item.rule_version_id) {
        lines.push(`- **${t("ranking.ruleVersion")}** \`${item.rule_version_id}\``);
      }
      if (item.rule_sha256) {
        lines.push(`- **SHA256** \`${item.rule_sha256}\``);
      }
      if (item.search_query || (item.competitor_results_count ?? 0) > 0) {
        lines.push(
          `- **${t("ranking.competitorSearch")}** ${item.search_query ? `"${item.search_query}"` : "—"} (${item.competitor_results_count ?? 0})`
        );
      }
      lines.push("");

      const avg = averageFiveDims(item.reports ?? []);
      lines.push(`#### ${t("ranking.radarSectionTitle")}`);
      lines.push("");
      lines.push(`*${t("ranking.radarScoreTableTitle")}*`);
      lines.push("");
      if (avg) {
        lines.push(`| ${t("ranking.dimInnovation")} | ${t("ranking.dimTechnical")} | ${t("ranking.dimBusiness")} | ${t("ranking.dimUx")} | ${t("ranking.dimFeasibility")} |`);
        lines.push("| --- | --- | --- | --- | --- |");
        lines.push(
          `| ${avg["创新性"].toFixed(1)} | ${avg["技术实现"].toFixed(1)} | ${avg["商业价值"].toFixed(1)} | ${avg["用户体验"].toFixed(1)} | ${avg["落地可行性"].toFixed(1)} |`
        );
        lines.push("");
        lines.push(`*${t("ranking.radarFootnote")}*`);
      } else {
        lines.push(`*${t("my.noDimensionData")}*`);
      }
      lines.push("");
      lines.push(`#### ${t("ranking.exportModelReports")}`);
      lines.push("");
      for (const r of item.reports ?? []) {
        const head =
          r.error != null && r.error !== ""
            ? `##### ${r.model_name} — **error:** ${r.error}`
            : `##### ${r.model_name} — ${t("ranking.exportPerModelScore")}: ${r.score ?? "—"}`;
        lines.push(head);
        lines.push("");
        const body = (r.content ?? "").trim() || "—";
        lines.push(indentAsCodeBlock(body));
        lines.push("");
      }

      const itemTier = letterTierFromReports(item.reports);
      const duelTierOk =
        (itemTier === "S" || itemTier === "A" || itemTier === "B") &&
        snap &&
        tierHasBracketEvidence(snap, itemTier);
      if (snapHasAnyArena && duelTierOk) {
        lines.push(`#### ${t("ranking.duelSectionTitle")}`);
        lines.push("");
        const matches = getDuelMatchesForFileSet(
          fileAliases.get(item.file_name) ?? [item.file_name],
          snap,
          itemTier
        );
        if (matches.length === 0) {
          lines.push(t("ranking.noDuelRationale"));
        } else {
          for (const m of matches) {
            lines.push(`##### ${t("ranking.duelRoundMeta", { n: String(m.round) })} · ${m.title}`);
            if (m.winnerLabel) {
              lines.push(
                `- **${t("ranking.duelWinner")}** ${m.winnerLabel}${m.model ? ` · model: \`${m.model}\`` : ""}`
              );
            }
            lines.push("");
            lines.push(formatDuelMatchMarkdown(m, lang, t));
            lines.push("");
          }
        }
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    });
  }

  return lines.join("\n").trimEnd() + "\n";
}

/** UTF-8 BOM so Windows Notepad / 默认 GBK 的编辑器能识别为 UTF-8，避免中文与 emoji 乱码 */
const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

export function downloadMarkdownFile(filename: string, text: string): void {
  const body = new TextEncoder().encode(text);
  const blob = new Blob([UTF8_BOM, body], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function safeRankingExportFilename(roundId: string): string {
  const safe = roundId.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  return `ranking-${safe || "round"}-${stamp}.md`;
}
