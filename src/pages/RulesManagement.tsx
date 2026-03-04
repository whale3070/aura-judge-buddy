import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import {
  fetchActiveRules,
  fetchRuleVersions,
  activateRules,
  deleteRuleVersion,
  downloadYAML,
  type RuleVersion,
} from "@/lib/rulesApi";
import YamlUploadModal from "@/components/YamlUploadModal";
import RuleDetailView from "@/components/RuleDetailView";

export default function RulesManagement() {
  const { t } = useI18n();
  const [active, setActive] = useState<RuleVersion | null>(null);
  const [versions, setVersions] = useState<RuleVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [viewDetail, setViewDetail] = useState<RuleVersion | null>(null);
  const [tab, setTab] = useState<"dashboard" | "versions">("dashboard");

  const load = async () => {
    setLoading(true);
    const [a, v] = await Promise.all([fetchActiveRules(), fetchRuleVersions()]);
    setActive(a);
    setVersions(v);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleActivate = async (id: string) => {
    await activateRules(id);
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("rules.confirmDelete"))) return;
    await deleteRuleVersion(id);
    await load();
  };

  if (viewDetail) {
    return <RuleDetailView version={viewDetail} onBack={() => setViewDetail(null)} />;
  }

  return (
    <div className="min-h-screen bg-background p-5">
      <div className="max-w-[1200px] mx-auto border border-primary/40 p-8 bg-card shadow-[0_0_30px_hsl(var(--primary)/0.1)]">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)]">
            🧩 {t("rules.title")}
          </h1>
          <div className="flex gap-3 items-center flex-wrap">
            <LanguageToggle />
            <Link to="/submit" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">{t("nav.submit")}</Link>
            <Link to="/ranking" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">{t("nav.ranking")}</Link>
            <Link to="/rounds" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">{t("nav.rounds")}</Link>
            <Link to="/judge" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">{t("nav.judge")}</Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-6 border-b border-border">
          {(["dashboard", "versions"] as const).map((tb) => (
            <button key={tb} onClick={() => setTab(tb)} className={`px-5 py-2.5 text-sm font-bold tracking-wider transition-colors ${tab === tb ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>
              {tb === "dashboard" ? t("rules.tabDashboard") : t("rules.tabVersions")}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-muted-foreground text-sm py-8 text-center">{t("admin.loadingSub")}</div>
        ) : tab === "dashboard" ? (
          <DashboardTab active={active} onUpload={() => setShowUpload(true)} onViewDetail={() => active && setViewDetail(active)} />
        ) : (
          <VersionsTab
            versions={versions}
            onActivate={handleActivate}
            onDelete={handleDelete}
            onView={setViewDetail}
            onDownload={(v) => downloadYAML(v.rawYAML, `${v.name}-${v.version}.yaml`)}
          />
        )}
      </div>

      {showUpload && (
        <YamlUploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={async () => { setShowUpload(false); await load(); }}
        />
      )}
    </div>
  );
}

function DashboardTab({ active, onUpload, onViewDetail }: { active: RuleVersion | null; onUpload: () => void; onViewDetail: () => void }) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      {/* Active Ruleset Card */}
      <div className="border border-primary/30 bg-primary/5 p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t("rules.activeRuleset")}</div>
            <h2 className="text-xl font-bold text-foreground">{active?.parsed.name ?? "—"}</h2>
          </div>
          <span className="text-xs bg-primary/20 text-primary px-2.5 py-1 font-mono">ACTIVE</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm mb-4">
          <div>
            <span className="text-muted-foreground text-xs">{t("rules.version")}</span>
            <div className="font-mono text-foreground">{active?.parsed.version ?? "—"}</div>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">{t("rules.updatedAt")}</span>
            <div className="font-mono text-foreground">{active?.parsed.updatedAt ?? "—"}</div>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">{t("rules.dimensions")}</span>
            <div className="font-mono text-foreground">{active?.parsed.dimensions.length ?? 0}</div>
          </div>
        </div>

        {/* Ecosystem modules */}
        {active?.parsed.ecosystemModules && (
          <div className="mb-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{t("rules.ecosystemModules")}</div>
            <div className="flex gap-2 flex-wrap">
              {active.parsed.ecosystemModules.map((m) => (
                <span key={m.key} className={`text-xs px-2.5 py-1 border font-mono ${m.enabled ? "border-primary/40 text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
                  {m.name}: {m.enabled ? "✅ ON" : "❌ OFF"}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onUpload} className="text-xs border border-primary/40 px-4 py-2 text-primary hover:bg-primary/10 transition-colors">
            {t("rules.uploadYAML")}
          </button>
          <button onClick={onUpload} className="text-xs border border-primary/40 px-4 py-2 text-primary hover:bg-primary/10 transition-colors">
            {t("rules.replaceYAML")}
          </button>
          <button onClick={onViewDetail} className="text-xs border border-border px-4 py-2 text-muted-foreground hover:text-primary transition-colors">
            {t("rules.viewDetail")}
          </button>
        </div>
      </div>

      {/* Quick dimension overview */}
      {active && (
        <div className="border border-border p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">{t("rules.dimensionOverview")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {active.parsed.dimensions.map((d) => (
              <div key={d.key} className="border border-border/60 p-3 bg-muted/20">
                <div className="text-xs text-muted-foreground">{d.name}</div>
                <div className="text-lg font-bold text-primary">{d.weight}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VersionsTab({
  versions,
  onActivate,
  onDelete,
  onView,
  onDownload,
}: {
  versions: RuleVersion[];
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  onView: (v: RuleVersion) => void;
  onDownload: (v: RuleVersion) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      {versions.map((v) => (
        <div key={v.id} className={`border p-4 flex items-center justify-between ${v.active ? "border-primary/40 bg-primary/5" : "border-border bg-muted/10"}`}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground/90 truncate">{v.name}</span>
              {v.active && <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 font-mono shrink-0">ACTIVE</span>}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              v{v.version} · {t("rules.uploadedBy")} {v.uploadedBy} · {new Date(v.uploadedAt).toLocaleString()}
            </div>
          </div>
          <div className="flex gap-2 shrink-0 ml-3">
            <button onClick={() => onView(v)} className="text-xs border border-border px-2.5 py-1 text-muted-foreground hover:text-primary transition-colors">{t("rules.view")}</button>
            {!v.active && (
              <button onClick={() => onActivate(v.id)} className="text-xs border border-primary/40 px-2.5 py-1 text-primary hover:bg-primary/10 transition-colors">{t("rules.activate")}</button>
            )}
            <button onClick={() => onDownload(v)} className="text-xs border border-border px-2.5 py-1 text-muted-foreground hover:text-primary transition-colors">⬇ YAML</button>
            {!v.active && (
              <button onClick={() => onDelete(v.id)} className="text-xs border border-destructive/40 px-2.5 py-1 text-destructive hover:bg-destructive/10 transition-colors">{t("admin.delete")}</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
