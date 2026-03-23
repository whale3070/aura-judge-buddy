import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import { fetchRoundsListAPI, type RoundListEntry } from "@/lib/apiClient";
import type { RoundMode, RoundStatus } from "@/lib/hackathonRounds";
import { Calendar, Plus, Eye, Pencil, Globe, MapPin, Wifi, Loader2 } from "lucide-react";

const VALID_LIST_STATUS: RoundStatus[] = ["draft", "open", "judging", "closed", "archived"];

function isSavedRoundStatus(s: string): s is RoundStatus {
  return (VALID_LIST_STATUS as readonly string[]).includes(s);
}

function isRoundMode(m: string | undefined): m is RoundMode {
  return m === "online" || m === "offline" || m === "hybrid";
}

const statusConfig: Record<RoundStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "border-muted-foreground text-muted-foreground" },
  open: { label: "Open", className: "border-primary text-primary" },
  judging: { label: "Judging", className: "border-accent text-accent" },
  closed: { label: "Closed", className: "border-destructive text-destructive" },
  archived: { label: "Archived", className: "border-border text-muted-foreground" },
};

const modeIcons = {
  online: Globe,
  offline: MapPin,
  hybrid: Wifi,
};

function StatusBadge({ status }: { status: RoundStatus }) {
  const cfg = statusConfig[status];
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider border px-2 py-0.5 ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function inferStatus(e: RoundListEntry): RoundStatus {
  const judged = Math.min(e.audited_file_count, e.submission_count);
  const pending = Math.max(0, e.submission_count - judged);
  if (e.submission_count === 0) return "draft";
  if (pending === 0) return "closed";
  return "judging";
}

/** 优先展示管理员在表单中保存的状态；未设置时按提交/审计进度推断 */
function displayStatus(e: RoundListEntry): RoundStatus {
  const s = e.status?.trim();
  if (s && isSavedRoundStatus(s)) return s;
  return inferStatus(e);
}

function displayTime(v: string | undefined): string {
  const t = v?.trim();
  return t || "—";
}

export default function RoundList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [rounds, setRounds] = useState<RoundListEntry[]>([]);
  const [defaultRoundId, setDefaultRoundId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 每次进入 /rounds 都重新拉取（从编辑页返回时 location.key 会变）
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRoundsListAPI()
      .then((res) => {
        if (cancelled) return;
        setRounds(res.rounds ?? []);
        setDefaultRoundId(res.default_round_id ?? "");
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || "Failed to load rounds");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [location.key]);

  const sortedRounds = useMemo(() => {
    const list = [...rounds];
    if (!defaultRoundId) {
      return list.sort((a, b) => a.id.localeCompare(b.id));
    }
    return list.sort((a, b) => {
      if (a.id === defaultRoundId) return -1;
      if (b.id === defaultRoundId) return 1;
      return a.id.localeCompare(b.id);
    });
  }, [rounds, defaultRoundId]);

  return (
    <div className="min-h-screen bg-background p-5">
      <div className="max-w-[1200px] mx-auto border border-primary/40 p-8 bg-card shadow-[0_0_30px_hsl(var(--primary)/0.1)]">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)] flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            {t("rounds.title")}
          </h1>
          <div className="flex gap-3 items-center flex-wrap">
            <LanguageToggle />
            <Link
              to="/"
              className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              {t("nav.home")}
            </Link>
            <button
              onClick={() => navigate("/rounds/new")}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground font-bold px-4 py-1.5 hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("rounds.create")}
            </button>
          </div>
        </div>

        {defaultRoundId ? (
          <p className="text-[11px] text-muted-foreground mb-2 font-mono">
            default_round_id: {defaultRoundId}
          </p>
        ) : null}

        {!loading && !error && rounds.length > 0 && (
          <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed border border-border/60 border-dashed px-3 py-2 bg-muted/10">
            {t("rounds.submissionCountExplain")}
          </p>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        )}

        {error && (
          <div className="border border-destructive/50 text-destructive text-sm p-4 mb-4">
            {error}
            <span className="block text-xs text-muted-foreground mt-2">
              确认已设置 VITE_API_BASE 指向 Aura 后端，且服务已部署包含 GET /api/rounds。
            </span>
          </div>
        )}

        {!loading && !error && rounds.length === 0 && (
          <div className="border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
            暂无轮次目录。在服务器上创建{" "}
            <code className="text-xs bg-muted px-1">submissions/&lt;round_id&gt;</code> 后刷新，或先提交一次项目以自动创建目录。
          </div>
        )}

        {!loading && sortedRounds.length > 0 && (
          <div className="border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 text-muted-foreground font-bold text-xs tracking-wider">
                    {t("rounds.colName")}
                  </th>
                  <th className="text-left p-3 text-muted-foreground font-bold text-xs tracking-wider">
                    {t("rounds.colMode")}
                  </th>
                  <th className="text-left p-3 text-muted-foreground font-bold text-xs tracking-wider">
                    {t("rounds.colStart")}
                  </th>
                  <th className="text-left p-3 text-muted-foreground font-bold text-xs tracking-wider">
                    {t("rounds.colEnd")}
                  </th>
                  <th className="text-left p-3 text-muted-foreground font-bold text-xs tracking-wider">
                    {t("rounds.colStatus")}
                  </th>
                  <th className="text-center p-3 text-muted-foreground font-bold text-xs tracking-wider">
                    {t("rounds.colProjects")}
                  </th>
                  <th className="text-center p-3 text-muted-foreground font-bold text-xs tracking-wider">
                    {t("rounds.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRounds.map((r) => {
                  const status = displayStatus(r);
                  const mode: RoundMode = isRoundMode(r.mode) ? r.mode : "online";
                  const ModeIcon = modeIcons[mode];
                  const isDefaultDataRound = Boolean(defaultRoundId && r.id === defaultRoundId);
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => navigate(`/rounds/${encodeURIComponent(r.id)}`)}
                    >
                      <td className="p-3 font-bold text-foreground/90">
                        <span className="flex flex-wrap items-center gap-2">
                          {r.name?.trim() || r.id}
                          {isDefaultDataRound ? (
                            <span className="text-[9px] font-normal font-mono uppercase tracking-wider border border-primary/40 text-primary px-1.5 py-0.5">
                              {t("rounds.badgeDefaultRound")}
                            </span>
                          ) : null}
                        </span>
                        {r.name?.trim() ? (
                          <span className="text-[10px] font-mono text-muted-foreground">{r.id}</span>
                        ) : null}
                      </td>
                      <td className="p-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground text-xs capitalize">
                          <ModeIcon className="w-3.5 h-3.5" />
                          {mode}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs font-mono whitespace-nowrap">
                        {displayTime(r.start_at)}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs font-mono whitespace-nowrap">
                        {displayTime(r.end_at)}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="p-3 text-center text-foreground/80 font-mono">{r.submission_count}</td>
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => navigate(`/rounds/${encodeURIComponent(r.id)}`)}
                            className="p-1.5 border border-border hover:border-primary hover:text-primary text-muted-foreground transition-colors"
                            title="View"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => navigate(`/rounds/${encodeURIComponent(r.id)}/edit`)}
                            className="p-1.5 border border-border hover:border-accent hover:text-accent text-muted-foreground transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
