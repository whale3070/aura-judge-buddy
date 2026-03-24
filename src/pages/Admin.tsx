import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  fetchRankings,
  fetchSubmissions,
  fetchAdminConfig,
  fetchFileTitles,
  deleteSubmission,
  type RankingItem,
  type SubmissionItem,
  type BuilderFilter,
} from "@/lib/api";
import { effectiveRoundIdFromSearchParam, roundNavSuffix } from "@/lib/apiClient";
import { toast } from "sonner";
import JudgeDetail from "@/components/JudgeDetail";
import GradeRankingPanel from "@/components/GradeRankingPanel";
import DuelLegacySnapshotBanner from "@/components/DuelLegacySnapshotBanner";
import BatchGithubIngestPanel from "@/components/BatchGithubIngestPanel";
import { useWallet } from "@/hooks/useWallet";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import { letterTierFromReports, type LetterTier } from "@/lib/dimensionTier";

const TIER_RANK: Record<LetterTier, number> = { S: 5, A: 4, B: 3, C: 2, D: 1, "?": 0 };

function buildRankingByFileName(rankings: RankingItem[]): Map<string, RankingItem> {
  const m = new Map<string, RankingItem>();
  for (const item of rankings) {
    const fn = (item.file_name ?? "").trim();
    if (!fn) continue;
    const prev = m.get(fn);
    if (!prev || item.avg_score > prev.avg_score) {
      m.set(fn, item);
    }
  }
  return m;
}

/** 与排行页一致：用该提交关联的 readme 文件名在 ranking 中找报告，取多文件中最优档。 */
function bestLetterTierForSubmission(s: SubmissionItem, rankByFile: Map<string, RankingItem>): LetterTier | null {
  const files = s.md_files ?? [];
  if (files.length === 0) return null;
  let best: LetterTier | null = null;
  let bestRank = -1;
  for (const f of files) {
    const item = rankByFile.get(f);
    if (!item) continue;
    const tier = letterTierFromReports(item.reports);
    const r = TIER_RANK[tier];
    if (r > bestRank) {
      bestRank = r;
      best = tier;
    }
  }
  return best;
}

export default function Admin() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const hash = searchParams.get("h") ?? undefined;
  const roundQ = searchParams.get("round_id");
  const effectiveRound = effectiveRoundIdFromSearchParam(roundQ);
  const wallet = useWallet();

  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [rankingsLoading, setRankingsLoading] = useState(true);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [adminHash, setAdminHash] = useState<string | null>(null);
  const [adminWallet, setAdminWallet] = useState<string>("");
  const [configLoading, setConfigLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [tab, setTab] = useState<"rankings" | "submissions">("rankings");
  const [builderFilter, setBuilderFilter] = useState<BuilderFilter>("all");
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!wallet.address) return;
    fetchAdminConfig()
      .then((cfg) => {
        setAdminHash(cfg.admin_hash ?? "");
        setAdminWallet((cfg.admin_wallet ?? "").toLowerCase());
      })
      .catch(() => {
        setAdminHash("");
        setAdminWallet("");
      });
  }, [wallet.address]);

  useEffect(() => {
    fetchAdminConfig()
      .then((cfg) => {
        setAdminHash(cfg.admin_hash ?? "");
        setAdminWallet((cfg.admin_wallet ?? "").toLowerCase());
      })
      .finally(() => setConfigLoading(false));
  }, []);

  const hashOk = adminHash ? hash === adminHash : true;
  const isAdmin = !!wallet.address && !!adminWallet && wallet.address.toLowerCase() === adminWallet;
  // 与后端一致：未配置 AURA_ADMIN_WALLET 时任意连接钱包即可查看列表；已配置时需匹配管理员
  const canViewSubmissions = !!wallet.address && (!adminWallet || wallet.address.toLowerCase() === adminWallet);
  const navigate = useNavigate();

  useEffect(() => {
    if (!configLoading && !hashOk) {
      navigate("/rounds", { replace: true });
    }
  }, [configLoading, hashOk, navigate]);

  useEffect(() => {
    if (!hashOk) {
      setRankingsLoading(false);
      return;
    }
    setRankingsLoading(true);
    Promise.all([fetchRankings(roundQ), fetchFileTitles(roundQ)])
      .then(([r, t]) => {
        setRankings(r);
        setTitleMap(t);
      })
      .finally(() => setRankingsLoading(false));
  }, [hashOk, roundQ]);

  useEffect(() => {
    if (!hashOk || !canViewSubmissions || !wallet.address) {
      setSubmissionsLoading(false);
      return;
    }
    setSubmissionsLoading(true);
    fetchSubmissions(wallet.address, builderFilter, roundQ)
      .then(setSubmissions)
      .finally(() => setSubmissionsLoading(false));
  }, [hashOk, canViewSubmissions, wallet.address, builderFilter, roundQ]);

  /** 排名区主标题：优先用提交记录里的项目名称，对应每条 readme 文件名 */
  const rankingTitleMap = useMemo(() => {
    const m: Record<string, string> = { ...titleMap };
    for (const s of submissions) {
      const label =
        (s.project_title || "").trim() ||
        (s.one_liner || "").trim().slice(0, 80) ||
        `项目 ${s.id}`;
      for (const f of s.md_files || []) {
        if (f) m[f] = label;
      }
    }
    return m;
  }, [titleMap, submissions]);

  if (configLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">LOADING...</div>;
  }

  if (!hashOk) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">{t("admin.redirecting")}</div>;
  }

  return (
    <div className="min-h-screen bg-background p-5">
      <div className="max-w-[1200px] mx-auto border border-primary/40 p-8 bg-card shadow-[0_0_30px_hsl(var(--primary)/0.1)]">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)]">
              🛡️ ADMIN CONSOLE
            </h1>
            {effectiveRound && (
              <p className="text-[11px] font-mono text-muted-foreground mt-1">
                round_id={effectiveRound}（{t("admin.roundScopeHint")}）
              </p>
            )}
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <LanguageToggle />
            <Link
              to={`/submit${roundNavSuffix(roundQ)}`}
              className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              {t("nav.submit")}
            </Link>
            <Link
              to={`/ranking${roundNavSuffix(roundQ)}`}
              className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              {t("nav.ranking")}
            </Link>
            <Link to="/rounds" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
              {t("nav.rounds")}
            </Link>
            <Link to="/rules" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
              {t("nav.rules")}
            </Link>
            <Link
              to={`/judge${roundNavSuffix(roundQ)}`}
              className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              {t("nav.judge")}
            </Link>
            {isAdmin && wallet.address ? (
              <span className="text-xs text-muted-foreground font-mono">
                {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
              </span>
            ) : (
              <button
                onClick={wallet.connect}
                disabled={wallet.connecting}
                className="text-xs border border-primary/40 px-3 py-1.5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {wallet.connecting ? t("admin.connecting") : t("admin.connectWallet")}
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-0 mb-6 border-b border-border">
          {(["rankings", "submissions"] as const).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`px-5 py-2.5 text-sm font-bold tracking-wider transition-colors ${
                tab === tb ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tb === "rankings" ? t("admin.rankings") : t("admin.submissions")}
            </button>
          ))}
        </div>

        {tab === "rankings" && (
          <>
            <DuelLegacySnapshotBanner expectedRoundId={effectiveRound ?? ""} />
            <GradeRankingPanel
              rankings={rankings}
              loading={rankingsLoading}
              titleMap={rankingTitleMap}
              adminWallet={wallet.address ?? null}
              roundId={effectiveRound}
              showDuelPanel={false}
            />
          </>
        )}

        {tab === "submissions" && (
          canViewSubmissions ? (
            <>
              <div className="flex gap-0 mb-2 border-b border-border">
                {(["all", "beginner", "longterm", "org"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setBuilderFilter(f)}
                    className={`px-4 py-2 text-xs font-bold tracking-wider transition-colors ${
                      builderFilter === f ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f === "all"
                      ? t("admin.filterAll")
                      : f === "beginner"
                        ? t("admin.filterBeginner")
                        : f === "longterm"
                          ? t("admin.filterLongterm")
                          : t("admin.filterOrg")}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-4 max-w-3xl">{t("admin.builderFilterSelfHostedNote")}</p>
              <BatchGithubIngestPanel
                roundId={effectiveRound}
                adminWallet={wallet.address!}
                onQueued={() => {
                  fetchSubmissions(wallet.address!, builderFilter, roundQ).then(setSubmissions);
                }}
              />
              <SubmissionsTab
                rankings={rankings}
                submissions={submissions}
                loading={submissionsLoading}
                onViewFile={setSelectedFile}
                adminWallet={wallet.address!}
                queryRoundId={roundQ}
                onDeleted={(delId) => setSubmissions((prev) => prev.filter((s) => s.id !== delId))}
                canDelete={canViewSubmissions}
                onRankingsRefresh={() => {
                  if (!hashOk) return;
                  Promise.all([fetchRankings(roundQ), fetchFileTitles(roundQ)]).then(([r, t]) => {
                    setRankings(r);
                    setTitleMap(t);
                  });
                }}
              />
            </>
          ) : (
            <div className="border border-border p-8 bg-muted/20 text-center">
              <p className="text-muted-foreground mb-4">{t("admin.walletRequired")}</p>
              <button
                onClick={wallet.connect}
                disabled={wallet.connecting}
                className="bg-primary text-primary-foreground font-bold py-2 px-6 text-sm tracking-wider hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] transition-all disabled:opacity-50"
              >
                {wallet.connecting ? t("admin.connecting") : t("admin.connectBtn")}
              </button>
              {wallet.error && <p className="mt-2 text-xs text-destructive">{wallet.error}</p>}
            </div>
          )
        )}

        {tab === "submissions" && selectedFile && (
          <JudgeDetail
            fileName={selectedFile}
            roundId={roundQ}
            onClose={() => setSelectedFile(null)}
            onReauditDone={() => {
              Promise.all([fetchRankings(roundQ), fetchFileTitles(roundQ)]).then(([r, t]) => {
                setRankings(r);
                setTitleMap(t);
              });
            }}
          />
        )}
      </div>
    </div>
  );
}

function SubmissionsTab({
  rankings,
  submissions,
  loading,
  onViewFile,
  adminWallet,
  queryRoundId,
  onDeleted,
  canDelete = true,
  onRankingsRefresh,
}: {
  rankings: RankingItem[];
  submissions: SubmissionItem[];
  loading: boolean;
  onViewFile: (f: string) => void;
  adminWallet: string;
  queryRoundId?: string | null;
  onDeleted: (id: string) => void;
  canDelete?: boolean;
  onRankingsRefresh?: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const rankByFile = useMemo(() => buildRankingByFileName(rankings), [rankings]);

  const hasRepoURL = (s: SubmissionItem) => Boolean((s.github_url ?? "").trim());

  const submissionDisplayTitle = (s: SubmissionItem) => {
    const tier = bestLetterTierForSubmission(s, rankByFile);
    if (tier === null) return s.project_title;
    return `${t("admin.projectGradeBracket", { tier })}${s.project_title}`;
  };

  const handleDelete = async (id: string, title: string) => {
    const msg = t("admin.confirmDelete", { title });
    if (!confirm(msg)) return;
    setDeleting(id);
    try {
      await deleteSubmission(id, adminWallet, queryRoundId);
      onDeleted(id);
    } catch (e: any) {
      alert(e.message || "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <div className="text-muted-foreground text-sm">{t("admin.loadingSub")}</div>;
  if (submissions.length === 0) return <div className="text-muted-foreground text-sm">{t("admin.noSub")}</div>;

  /** 后端在配置 GITHUB_TOKEN 后返回 github_account_years；未返回时表示尚未补全。 */
  const accountYearsLabel = (s: SubmissionItem) => {
    const years = s.github_account_years;
    if (typeof years === "number" && !Number.isNaN(years)) {
      return t("admin.accountYearsValue", { n: String(years) });
    }
    const status = (s.github_enrich_status ?? "").toLowerCase();
    if (status) {
      if (status === "rate_limited") return t("admin.accountYearsRateLimited");
      if (status === "unauthorized") return t("admin.accountYearsUnauthorized");
      if (status === "not_found") return t("admin.accountYearsNotFound");
      if (status === "network") return t("admin.accountYearsNetwork");
      if (status === "invalid_url") return t("admin.accountYearsInvalidUrl");
      if (status !== "success") return t("admin.accountYearsLookupFailed");
    }
    if (s.github_username) return t("admin.accountYearsFetching");
    if (hasRepoURL(s)) return t("admin.accountYearsRepoNoAge");
    return t("admin.accountYearsNoGitHub");
  };

  const builderTag = (s: SubmissionItem) => {
    const ownerType = (s.github_repo_owner_type ?? "").toLowerCase().trim();
    if (ownerType === "organization") return null;
    const years = s.github_account_years;
    if (typeof years !== "number" || Number.isNaN(years)) return null;
    if (years <= 1) return t("admin.builderTagBeginner");
    if (years >= 3) return t("admin.builderTagLongterm");
    return null;
  };

  const ownerTypeTag = (s: SubmissionItem) => {
    const ownerType = (s.github_repo_owner_type ?? "").toLowerCase().trim();
    if (ownerType === "organization") return t("admin.ownerTypeOrg");
    if (ownerType === "user") return t("admin.ownerTypeUser");
    return null;
  };

  return (
    <div className="space-y-3">
      {submissions.map((s) => (
        <div key={s.id} className="border border-border bg-muted/20">
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              className="flex-1 min-w-0 flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors gap-3"
            >
              <div className="min-w-0">
                <div className="font-bold text-foreground/90 truncate">{submissionDisplayTitle(s)}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{s.one_liner}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap" title={t("admin.accountYears")}>
                  {accountYearsLabel(s)}
                </span>
                {ownerTypeTag(s) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium border border-border">
                    {ownerTypeTag(s)}
                  </span>
                )}
                {builderTag(s) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                    {builderTag(s)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(s.created_at).toLocaleString()}
                </span>
              </div>
            </button>
            {canDelete && (
              <div className="flex items-center gap-1.5 shrink-0 mx-2">
                <button
                  type="button"
                  onClick={() => handleDelete(s.id, submissionDisplayTitle(s))}
                  disabled={deleting === s.id}
                  className="text-xs border border-destructive/40 px-2.5 py-1 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                >
                  {deleting === s.id ? t("admin.deleting") : t("admin.delete")}
                </button>
              </div>
            )}
          </div>

          {expanded === s.id && (
            <div className="p-4 border-t border-border space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground text-xs">GitHub</span>
                  {hasRepoURL(s) ? (
                    <a
                      href={s.github_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-primary hover:underline truncate"
                    >
                      {s.github_url}
                    </a>
                  ) : (
                    <span className="block text-muted-foreground truncate">—</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Demo</span>
                  <a href={s.demo_url} target="_blank" rel="noreferrer" className="block text-primary hover:underline truncate">{s.demo_url || "—"}</a>
                </div>
              </div>
              {s.why_this_chain && (
                <div>
                  <span className="text-muted-foreground text-xs">{t("admin.legacyFormNote")}</span>
                  <p className="text-foreground/80 text-xs mt-1">{s.why_this_chain}</p>
                </div>
              )}
              {!!s.github_enrich_error && (
                <div>
                  <span className="text-muted-foreground text-xs">GitHub API</span>
                  <p className="text-destructive text-xs mt-1 break-words">{s.github_enrich_error}</p>
                </div>
              )}
              {s.md_files && s.md_files.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-xs">{t("admin.relatedDocs")} ({s.md_files.length})</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {s.md_files.map((f) => (
                      <button key={f} onClick={() => onViewFile(f)} className="text-xs border border-primary/30 px-2 py-1 text-primary hover:bg-primary/10 transition-colors">
                        📄 {f}
                      </button>
                    ))
                    }
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
