import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import {
  defaultDimensions,
  defaultGradeBands,
  defaultPitch,
  type HackathonRound,
} from "@/lib/hackathonRounds";
import { fetchAdminConfigAPI, fetchRoundsListAPI, type RoundListEntry } from "@/lib/apiClient";
import RoundJudgesTab from "./RoundJudgesTab";
import { ArrowLeft, Pencil, Users, FileText, Scale, Download, BarChart3, Clock, CheckCircle, AlertCircle, Loader2, ExternalLink, Layers } from "lucide-react";
const tabs = ["overview", "projects", "judges", "rules", "exports"] as const;
type Tab = (typeof tabs)[number];

const tabIcons: Record<Tab, React.ElementType> = {
  overview: BarChart3,
  projects: FileText,
  judges: Users,
  rules: Scale,
  exports: Download,
};

function entryToDisplayRound(entry: RoundListEntry): HackathonRound {
  const judged = Math.min(entry.audited_file_count, entry.submission_count);
  const pending = Math.max(0, entry.submission_count - judged);
  const status: HackathonRound["status"] =
    entry.submission_count === 0 ? "draft" : pending === 0 ? "closed" : "judging";
  return {
    id: entry.id,
    name: entry.id,
    description: `提交 ${entry.submission_count} · 已审计文档 ${entry.audited_file_count}（按裁决 JSON 中 file_name 去重）`,
    mode: "online",
    timezone: "UTC",
    startAt: "",
    endAt: "",
    status,
    projectCount: entry.submission_count,
    judgedCount: judged,
    pendingCount: pending,
    rules: {
      scoringDimensions: [...defaultDimensions],
      gradeBands: [...defaultGradeBands],
    },
    pitch: { ...defaultPitch },
  };
}

export default function RoundDetail() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [entry, setEntry] = useState<RoundListEntry | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);
    fetchRoundsListAPI()
      .catch(() => ({ rounds: [] as RoundListEntry[], default_round_id: "" }))
      .then((roundsRes) => {
        if (cancelled) return;
        const row = roundsRes.rounds.find((r) => r.id === id);
        setEntry(row ?? { id, submission_count: 0, audited_file_count: 0 });
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadErr(e.message || "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Round not found.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading…
      </div>
    );
  }

  if (loadErr || !entry) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-2 text-destructive p-6 text-center">
        {loadErr || "无法加载轮次"}
        <button
          type="button"
          onClick={() => navigate("/rounds")}
          className="text-xs text-primary border border-primary px-3 py-1 mt-2"
        >
          返回列表
        </button>
      </div>
    );
  }

  const round = entryToDisplayRound(entry);

  return (
    <div className="min-h-screen bg-background p-5">
      <div className="max-w-[1200px] mx-auto border border-primary/40 p-8 bg-card shadow-[0_0_30px_hsl(var(--primary)/0.1)]">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate("/rounds")}
              className="text-muted-foreground hover:text-primary transition-colors mt-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-display font-bold text-primary font-mono">{round.name}</h1>
              {round.description && (
                <p className="text-xs text-muted-foreground mt-1 max-w-xl">{round.description}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap justify-end">
            <LanguageToggle />
            <Link
              to={`/submit?round_id=${encodeURIComponent(id)}`}
              className="flex items-center gap-1.5 text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              <FileText className="w-3.5 h-3.5" /> {t("rounds.gotoSubmit")}
            </Link>
            <Link
              to={`/ranking?round_id=${encodeURIComponent(id)}`}
              className="flex items-center gap-1.5 text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5" /> {t("rounds.gotoRanking")}
            </Link>
            <Link
              to={`/rounds/${encodeURIComponent(id)}/tracks`}
              className="flex items-center gap-1.5 text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              <Layers className="w-3.5 h-3.5" /> {t("rounds.gotoTracks")}
            </Link>
            <button
              onClick={() => navigate(`/rounds/${encodeURIComponent(id)}/edit`)}
              className="flex items-center gap-1.5 text-xs border border-accent/40 px-3 py-1.5 text-accent hover:bg-accent/10 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> {t("rounds.edit")}
            </button>
          </div>
        </div>

        <div className="flex gap-0 mb-6 border-b border-border overflow-x-auto">
          {tabs.map((tb) => {
            const Icon = tabIcons[tb];
            return (
              <button
                key={tb}
                onClick={() => setTab(tb)}
                className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold tracking-wider transition-colors whitespace-nowrap ${
                  tab === tb ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t(`rounds.tab_${tb}`)}
              </button>
            );
          })}
        </div>

        {tab === "overview" && <OverviewTab round={round} />}
        {tab === "projects" && <ProjectsTab roundId={id} />}
        {tab === "judges" && <RoundJudgesTab roundId={id} />}
        {tab === "rules" && <RulesPageTab />}
        {tab === "exports" && <PlaceholderTab title={t("rounds.tab_exports")} desc={t("rounds.exportsPlaceholder")} />}
      </div>
    </div>
  );
}

function OverviewTab({ round }: { round: HackathonRound }) {
  const { t } = useI18n();

  const stats = [
    { label: t("rounds.totalProjects"), value: round.projectCount, icon: FileText, color: "text-primary" },
    { label: t("rounds.judgedProjects"), value: round.judgedCount, icon: CheckCircle, color: "text-primary" },
    {
      label: t("rounds.pendingReviews"),
      value: round.pendingCount,
      icon: Clock,
      color: round.pendingCount > 0 ? "text-accent" : "text-primary",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="border border-border p-5 bg-muted/10">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <div className={`text-3xl font-display font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {round.projectCount > 0 && (
        <div className="border border-border p-5 bg-muted/10">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>{t("rounds.judgeProgress")}</span>
            <span>{Math.round((round.judgedCount / round.projectCount) * 100)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(round.judgedCount / round.projectCount) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PlaceholderTab({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="border border-border border-dashed p-12 text-center bg-muted/5">
      <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
      <h3 className="text-sm font-bold text-foreground/70 mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}

/** 跳转至全局规则管理页 /rules（与 RulesManagement 一致） */
function RulesPageTab() {
  const { t } = useI18n();
  return (
    <div className="border border-border p-8 bg-muted/5 space-y-4">
      <div className="flex items-start gap-3">
        <Scale className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-foreground/90">{t("rounds.tab_rules")}</h3>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed max-w-xl">{t("rounds.rulesPageDesc")}</p>
        </div>
      </div>
      <Link
        to="/rules"
        className="inline-flex items-center gap-2 text-xs font-bold bg-primary text-primary-foreground px-4 py-2.5 hover:shadow-[0_0_20px_hsl(var(--primary)/0.5)] transition-all"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        {t("rounds.openRulesPage")}
      </Link>
    </div>
  );
}

/** 管理台链接须同时带 ?h= 与 &round_id=，否则提交列表会按 VITE_ROUND_ID/默认轮次拉取，与当前轮次不一致时显示为 0 */
function ProjectsTab({ roundId }: { roundId: string }) {
  const { t } = useI18n();
  const [adminHash, setAdminHash] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);
    fetchAdminConfigAPI()
      .then((cfg) => {
        if (cancelled) return;
        setAdminHash((cfg.admin_hash ?? "").trim());
      })
      .catch(() => {
        if (!cancelled) setLoadErr(t("rounds.adminConfigLoadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // 后端未配置 admin_hash 时，Admin 页对任意 ?h= 放行；仍须带非空 h 才能进入 RootRoute 的 Admin
  const hParam = adminHash || "1";
  const to = `/?h=${encodeURIComponent(hParam)}&round_id=${encodeURIComponent(roundId)}`;

  return (
    <div className="border border-border p-8 bg-muted/5 space-y-4">
      <div className="flex items-start gap-3">
        <FileText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-foreground/90">{t("rounds.tab_projects")}</h3>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed max-w-xl">{t("rounds.projectsAdminDesc")}</p>
        </div>
      </div>
      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          …
        </div>
      )}
      {loadErr && <p className="text-xs text-destructive">{loadErr}</p>}
      {!loading && (
        <Link
          to={to}
          className="inline-flex items-center gap-2 text-xs font-bold bg-primary text-primary-foreground px-4 py-2.5 hover:shadow-[0_0_20px_hsl(var(--primary)/0.5)] transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {t("rounds.openAdminConsole")}
        </Link>
      )}
    </div>
  );
}
