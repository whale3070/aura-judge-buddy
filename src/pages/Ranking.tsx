import { useState, useEffect, useMemo } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  fetchRankingsAPI,
  fetchFileTitlesAPI,
  fetchFileGithubUrlsAPI,
  fetchFileProjectTitlesAPI,
  fetchRuleVersionsAPI,
  roundNavSuffix,
  sanitizeRoundIdParam,
  type SavedResult,
  type RuleVersionMeta,
} from "@/lib/apiClient";
import RankingByTierPanel from "@/components/RankingByTierPanel";
import DuelLegacySnapshotBanner from "@/components/DuelLegacySnapshotBanner";
import RankingRuleFilterBar from "@/components/RankingRuleFilterBar";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import {
  ALL_RULES_FILTER_VALUE,
  buildRuleFilterOptions,
  filterRankingsByRule,
} from "@/lib/rankingRuleFilter";
import {
  buildRankingMarkdownExport,
  downloadMarkdownFile,
  safeRankingExportFilename,
} from "@/lib/rankingMarkdownExport";
import { toast } from "sonner";

export default function Ranking() {
  const { t, lang } = useI18n();
  const [searchParams] = useSearchParams();
  const roundQ = searchParams.get("round_id");
  const roundIdRequired = sanitizeRoundIdParam(roundQ);
  const [rankings, setRankings] = useState<SavedResult[]>([]);
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [fileGithubMap, setFileGithubMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [ruleFilterOverride, setRuleFilterOverride] = useState<string | undefined>(undefined);
  const [versionMetas, setVersionMetas] = useState<RuleVersionMeta[]>([]);

  useEffect(() => {
    setRuleFilterOverride(undefined);
  }, [roundIdRequired]);

  useEffect(() => {
    if (!roundIdRequired) return;
    setLoading(true);
    Promise.all([
      fetchRankingsAPI(roundIdRequired),
      fetchFileTitlesAPI(roundIdRequired),
      fetchFileGithubUrlsAPI(roundIdRequired),
      fetchFileProjectTitlesAPI(roundIdRequired),
      fetchRuleVersionsAPI(roundIdRequired).catch(() => ({ versions: [] })),
    ])
      .then(([r, titles, githubMap, projectTitles, ver]) => {
        setRankings(r);
        // 后端 submission 项目名优先于 Supabase file-titles
        setTitleMap({ ...titles, ...projectTitles });
        setFileGithubMap(githubMap);
        setVersionMetas(ver.versions ?? []);
      })
      .finally(() => setLoading(false));
  }, [roundIdRequired]);

  const ruleOptions = useMemo(() => buildRuleFilterOptions(rankings, versionMetas), [rankings, versionMetas]);

  const effectiveRuleFilterId = useMemo(() => {
    if (ruleOptions.length === 0) return ALL_RULES_FILTER_VALUE;
    const ok = ruleFilterOverride != null && ruleOptions.some((o) => o.value === ruleFilterOverride);
    if (ok) return ruleFilterOverride!;
    // 默认「全部规则」：分档项目数与管理员控制台（全量 ranking）一致；单选某规则仅用于同口径对比
    return ALL_RULES_FILTER_VALUE;
  }, [ruleFilterOverride, ruleOptions]);

  const filteredRankings = useMemo(() => {
    if (ruleOptions.length === 0) return rankings;
    return filterRankingsByRule(rankings, effectiveRuleFilterId);
  }, [rankings, effectiveRuleFilterId, ruleOptions.length]);

  const emptyHint =
    !loading && rankings.length > 0 && filteredRankings.length === 0 ? t("ranking.emptyRuleFiltered") : undefined;

  const handleDownloadMarkdown = () => {
    if (filteredRankings.length === 0) {
      toast.error(t("ranking.exportEmpty"));
      return;
    }
    const selectedOpt = ruleOptions.find((o) => o.value === effectiveRuleFilterId);
    const pageUrl = typeof window !== "undefined" ? window.location.href : "";
    const md = buildRankingMarkdownExport({
      lang,
      t,
      roundId: roundIdRequired,
      pageUrl,
      rankings: filteredRankings,
      allRankingsForAliases: rankings,
      titleMap,
      fileGithubMap,
      ruleFilterOption: selectedOpt,
    });
    downloadMarkdownFile(safeRankingExportFilename(roundIdRequired), md);
  };

  if (!roundIdRequired) {
    return <Navigate to="/rounds" replace />;
  }

  const navSuffix = roundNavSuffix(roundIdRequired);

  return (
    <div className="min-h-screen bg-background p-5 relative overflow-hidden">
      <div className="max-w-[1100px] mx-auto border border-primary/40 p-8 shadow-[0_0_30px_hsl(var(--primary)/0.1)] bg-card relative">
        <div className="flex justify-center gap-3 mb-6 flex-wrap">
          <Link to={`/submit${navSuffix}`} className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
            {t("nav.submit")}
          </Link>
          <Link to={`/judge${navSuffix}`} className="text-xs border border-primary/40 px-3 py-1.5 text-primary hover:bg-primary/10 transition-colors">
            {t("nav.judge")}
          </Link>
          <button
            type="button"
            onClick={handleDownloadMarkdown}
            disabled={loading || filteredRankings.length === 0}
            className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            {t("ranking.downloadMarkdown")}
          </button>
          <LanguageToggle />
        </div>
        <h1 className="text-center text-2xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)] mb-2">
          {t("ranking.title")}
        </h1>
        <p className="text-center text-[11px] font-mono text-accent mb-1">
          round_id={roundIdRequired}
        </p>
        <p className="text-center text-xs text-muted-foreground mb-4">
          {t("ranking.note")}
        </p>
        <RankingRuleFilterBar
          value={effectiveRuleFilterId}
          onChange={setRuleFilterOverride}
          options={ruleOptions}
          disabled={loading}
        />
        <DuelLegacySnapshotBanner expectedRoundId={roundIdRequired} />
        <RankingByTierPanel
          roundId={roundIdRequired}
          allRankingsForAliases={rankings}
          rankings={filteredRankings}
          loading={loading}
          titleMap={titleMap}
          fileGithubMap={fileGithubMap}
          emptyHint={emptyHint}
        />
      </div>
    </div>
  );
}
