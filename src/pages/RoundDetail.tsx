import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import { mockRounds } from "@/lib/hackathonRounds";
import { ArrowLeft, Pencil, Users, FileText, Scale, Download, BarChart3, Clock, CheckCircle, AlertCircle } from "lucide-react";

const tabs = ["overview", "projects", "judges", "rules", "exports"] as const;
type Tab = typeof tabs[number];

const tabIcons: Record<Tab, React.ElementType> = {
  overview: BarChart3,
  projects: FileText,
  judges: Users,
  rules: Scale,
  exports: Download,
};

// Mock leaderboard
const mockLeaderboard = [
  { rank: 1, name: "DeFi Bridge Pro", score: 92 },
  { rank: 2, name: "NFT Marketplace X", score: 88 },
  { rank: 3, name: "DAO Governance Toolkit", score: 85 },
  { rank: 4, name: "Cross-Chain Oracle", score: 81 },
  { rank: 5, name: "Yield Aggregator Plus", score: 78 },
];

export default function RoundDetail() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const round = mockRounds.find((r) => r.id === id);
  const [tab, setTab] = useState<Tab>("overview");

  if (!round) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Round not found.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-5">
      <div className="max-w-[1200px] mx-auto border border-primary/40 p-8 bg-card shadow-[0_0_30px_hsl(var(--primary)/0.1)]">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-start gap-3">
            <button onClick={() => navigate("/rounds")} className="text-muted-foreground hover:text-primary transition-colors mt-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-display font-bold text-primary">{round.name}</h1>
              {round.description && <p className="text-xs text-muted-foreground mt-1 max-w-xl">{round.description}</p>}
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <LanguageToggle />
            <button
              onClick={() => navigate(`/rounds/${id}/edit`)}
              className="flex items-center gap-1.5 text-xs border border-accent/40 px-3 py-1.5 text-accent hover:bg-accent/10 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> {t("rounds.edit")}
            </button>
          </div>
        </div>

        {/* Tabs */}
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

        {/* Tab Content */}
        {tab === "overview" && <OverviewTab round={round} />}
        {tab === "projects" && <PlaceholderTab title={t("rounds.tab_projects")} desc={t("rounds.projectsPlaceholder")} />}
        {tab === "judges" && <PlaceholderTab title={t("rounds.tab_judges")} desc={t("rounds.judgesPlaceholder")} />}
        {tab === "rules" && <RulesTab round={round} />}
        {tab === "exports" && <PlaceholderTab title={t("rounds.tab_exports")} desc={t("rounds.exportsPlaceholder")} />}
      </div>
    </div>
  );
}

function OverviewTab({ round }: { round: typeof mockRounds[0] }) {
  const { t } = useI18n();

  const stats = [
    { label: t("rounds.totalProjects"), value: round.projectCount, icon: FileText, color: "text-primary" },
    { label: t("rounds.judgedProjects"), value: round.judgedCount, icon: CheckCircle, color: "text-primary" },
    { label: t("rounds.pendingReviews"), value: round.pendingCount, icon: Clock, color: round.pendingCount > 0 ? "text-accent" : "text-primary" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
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

      {/* Progress */}
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

      {/* Leaderboard Preview */}
      <div className="border border-border bg-muted/10">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-bold text-foreground/90">{t("rounds.leaderboardPreview")}</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left p-3 text-muted-foreground text-xs w-16">#</th>
              <th className="text-left p-3 text-muted-foreground text-xs">{t("rounds.projectName")}</th>
              <th className="text-right p-3 text-muted-foreground text-xs">{t("rounds.score")}</th>
            </tr>
          </thead>
          <tbody>
            {mockLeaderboard.map((p) => (
              <tr key={p.rank} className="border-b border-border/30">
                <td className="p-3 font-mono text-primary/80">{p.rank}</td>
                <td className="p-3 text-foreground/80">{p.name}</td>
                <td className="p-3 text-right font-mono font-bold text-primary">{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RulesTab({ round }: { round: typeof mockRounds[0] }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Scoring Dimensions */}
      <div className="border border-border p-5 bg-muted/10">
        <h3 className="text-sm font-bold text-foreground/90 mb-4">{t("rounds.scoringDimensions")}</h3>
        <div className="space-y-2">
          {round.rules.scoringDimensions.map((d) => (
            <div key={d.name} className="flex justify-between items-center">
              <span className="text-sm text-foreground/80">{d.name}</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${d.weight}%` }} />
                </div>
                <span className="text-xs font-mono text-primary w-8 text-right">{d.weight}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grade Bands */}
      <div className="border border-border p-5 bg-muted/10">
        <h3 className="text-sm font-bold text-foreground/90 mb-4">{t("rounds.gradeBandsTitle")}</h3>
        <div className="space-y-2">
          {round.rules.gradeBands.map((b) => (
            <div key={b.grade} className="flex items-center gap-3">
              <span className="w-8 text-center font-bold text-lg text-primary">{b.grade}</span>
              <div className="flex-1 h-6 bg-muted rounded relative overflow-hidden">
                <div
                  className="h-full bg-primary/20 absolute"
                  style={{ left: `${b.min}%`, width: `${b.max - b.min + 1}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground font-mono w-16 text-right">{b.min}–{b.max}</span>
            </div>
          ))}
        </div>
      </div>
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
