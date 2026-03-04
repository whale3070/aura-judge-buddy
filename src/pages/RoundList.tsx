import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import { mockRounds, type HackathonRound, type RoundStatus } from "@/lib/hackathonRounds";
import { Calendar, Plus, Eye, Pencil, Globe, MapPin, Wifi } from "lucide-react";

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

export default function RoundList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [rounds] = useState<HackathonRound[]>(mockRounds);

  return (
    <div className="min-h-screen bg-background p-5">
      <div className="max-w-[1200px] mx-auto border border-primary/40 p-8 bg-card shadow-[0_0_30px_hsl(var(--primary)/0.1)]">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)] flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            {t("rounds.title")}
          </h1>
          <div className="flex gap-3 items-center flex-wrap">
            <LanguageToggle />
            <Link to="/" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
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

        {/* Table */}
        <div className="border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-3 text-muted-foreground font-bold text-xs tracking-wider">{t("rounds.colName")}</th>
                <th className="text-left p-3 text-muted-foreground font-bold text-xs tracking-wider">{t("rounds.colMode")}</th>
                <th className="text-left p-3 text-muted-foreground font-bold text-xs tracking-wider">{t("rounds.colStart")}</th>
                <th className="text-left p-3 text-muted-foreground font-bold text-xs tracking-wider">{t("rounds.colEnd")}</th>
                <th className="text-left p-3 text-muted-foreground font-bold text-xs tracking-wider">{t("rounds.colStatus")}</th>
                <th className="text-center p-3 text-muted-foreground font-bold text-xs tracking-wider">{t("rounds.colProjects")}</th>
                <th className="text-center p-3 text-muted-foreground font-bold text-xs tracking-wider">{t("rounds.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r) => {
                const ModeIcon = modeIcons[r.mode];
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => navigate(`/rounds/${r.id}`)}
                  >
                    <td className="p-3 font-bold text-foreground/90">{r.name}</td>
                    <td className="p-3">
                      <span className="flex items-center gap-1.5 text-muted-foreground text-xs capitalize">
                        <ModeIcon className="w-3.5 h-3.5" />
                        {r.mode}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs font-mono whitespace-nowrap">
                      {new Date(r.startAt).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs font-mono whitespace-nowrap">
                      {new Date(r.endAt).toLocaleDateString()}
                    </td>
                    <td className="p-3"><StatusBadge status={r.status} /></td>
                    <td className="p-3 text-center text-foreground/80 font-mono">{r.projectCount}</td>
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => navigate(`/rounds/${r.id}`)}
                          className="p-1.5 border border-border hover:border-primary hover:text-primary text-muted-foreground transition-colors"
                          title="View"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => navigate(`/rounds/${r.id}/edit`)}
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
      </div>
    </div>
  );
}
