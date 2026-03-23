import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import {
  fetchActiveRulesAPI,
  fetchRuleVersionsAPI,
  activateRulesAPI,
  deleteRuleVersionAPI,
  getRuleDownloadURL,
  getAdminWallet,
  setAdminWallet,
  roundNavSuffix,
  type RuleVersionMeta,
  type ActiveRuleResponse,
} from "@/lib/apiClient";
import { parseAndValidateYAML, type RuleSet } from "@/lib/rulesApi";
import YamlUploadModal from "@/components/YamlUploadModal";
import RuleDetailView from "@/components/RuleDetailView";
import { toast } from "sonner";

export default function RulesManagement() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const roundQ = searchParams.get("round_id");
  const navSuffix = roundNavSuffix(roundQ);
  const [activeMeta, setActiveMeta] = useState<RuleVersionMeta | null>(null);
  const [activeRuleSet, setActiveRuleSet] = useState<RuleSet | null>(null);
  const [versions, setVersions] = useState<RuleVersionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [viewDetailYAML, setViewDetailYAML] = useState<{ meta: RuleVersionMeta; parsed: RuleSet; rawYAML: string } | null>(null);
  const [tab, setTab] = useState<"dashboard" | "versions">("dashboard");
  const [wallet, setWallet] = useState(getAdminWallet() || "");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [activeRes, versionsRes] = await Promise.all([
        fetchActiveRulesAPI(),
        fetchRuleVersionsAPI(roundQ),
      ]);
      setActiveMeta(activeRes.meta);
      if (activeRes.rawYAML) {
        const { parsed } = parseAndValidateYAML(activeRes.rawYAML);
        setActiveRuleSet(parsed);
      } else {
        setActiveRuleSet(null);
      }
      setVersions(versionsRes.versions || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [roundQ]);

  const handleSaveWallet = () => {
    setAdminWallet(wallet.trim());
    toast.success(t("rules.walletSaved"));
  };

  const handleActivate = async (id: string) => {
    try {
      await activateRulesAPI(id, roundQ);
      toast.success(t("rules.activated"));
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "ADMIN_WALLET_REQUIRED") {
        toast.error(t("rules.walletRequired"));
      } else {
        toast.error(msg || "Error");
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("rules.confirmDelete"))) return;
    try {
      await deleteRuleVersionAPI(id);
      toast.success(t("rules.deleted"));
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "ADMIN_WALLET_REQUIRED") {
        toast.error(t("rules.walletRequired"));
      } else {
        toast.error(msg || "Error");
      }
    }
  };

  const handleDownload = (id: string) => {
    window.open(getRuleDownloadURL(id), "_blank");
  };

  const handleViewDetail = async (meta: RuleVersionMeta) => {
    if (meta.is_orphan) {
      toast.error(t("rules.orphanNoYaml"));
      return;
    }
    if (meta.is_active && activeRuleSet) {
      const activeRes: ActiveRuleResponse = await fetchActiveRulesAPI();
      const { parsed } = parseAndValidateYAML(activeRes.rawYAML);
      if (parsed) {
        setViewDetailYAML({ meta, parsed, rawYAML: activeRes.rawYAML });
      }
      return;
    }
    try {
      const url = getRuleDownloadURL(meta.id);
      const res = await fetch(url);
      const rawYAML = await res.text();
      const { parsed } = parseAndValidateYAML(rawYAML);
      if (parsed) {
        setViewDetailYAML({ meta, parsed, rawYAML });
      } else {
        toast.error("Failed to parse YAML");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  if (viewDetailYAML) {
    const fakeVersion = {
      id: viewDetailYAML.meta.id,
      name: viewDetailYAML.parsed.name || viewDetailYAML.meta.name || "",
      version: viewDetailYAML.parsed.version || viewDetailYAML.meta.version || "",
      uploadedBy: viewDetailYAML.meta.uploaded_by || "unknown",
      uploadedAt: viewDetailYAML.meta.uploaded_at,
      active: viewDetailYAML.meta.is_active,
      rawYAML: viewDetailYAML.rawYAML,
      parsed: viewDetailYAML.parsed,
    };
    return <RuleDetailView version={fakeVersion} onBack={() => setViewDetailYAML(null)} />;
  }

  return (
    <div className="min-h-screen bg-background p-5">
      <div className="max-w-[1200px] mx-auto border border-primary/40 p-8 bg-card shadow-[0_0_30px_hsl(var(--primary)/0.1)]">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)]">
            🧩 {t("rules.title")}
          </h1>
          <div className="flex gap-3 items-center flex-wrap">
            <LanguageToggle />
            <Link
              to={`/submit${navSuffix}`}
              className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              {t("nav.submit")}
            </Link>
            <Link
              to={`/ranking${navSuffix}`}
              className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              {t("nav.ranking")}
            </Link>
            <Link to="/rounds" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
              {t("nav.rounds")}
            </Link>
            <Link
              to={`/judge${navSuffix}`}
              className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              {t("nav.judge")}
            </Link>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground border border-border/60 bg-muted/20 px-3 py-2 mb-6 leading-relaxed">
          {t("rules.versionMergeHint")}
        </p>

        <div className="border border-border p-4 mb-6 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-muted-foreground whitespace-nowrap">{t("rules.adminWallet")}:</label>
            <input
              type="text"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="0x..."
              className="flex-1 min-w-[200px] bg-muted/30 border border-border px-3 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary/60"
            />
            <button
              type="button"
              onClick={handleSaveWallet}
              className="text-xs border border-primary/40 px-3 py-1.5 text-primary hover:bg-primary/10 transition-colors"
            >
              {t("rules.saveWallet")}
            </button>
          </div>
          <p className="text-xs text-muted-foreground/80">{t("rules.walletHint")}</p>
        </div>

        <div className="flex gap-0 mb-6 border-b border-border">
          {(["dashboard", "versions"] as const).map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              className={`px-5 py-2.5 text-sm font-bold tracking-wider transition-colors ${
                tab === tb ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tb === "dashboard" ? t("rules.tabDashboard") : t("rules.tabVersions")}
            </button>
          ))}
        </div>

        {error && <div className="border border-destructive/40 bg-destructive/5 p-3 mb-4 text-sm text-destructive">{error}</div>}

        {loading ? (
          <div className="text-muted-foreground text-sm py-8 text-center">{t("admin.loadingSub")}</div>
        ) : tab === "dashboard" ? (
          <DashboardTab
            activeMeta={activeMeta}
            activeRuleSet={activeRuleSet}
            onUpload={() => setShowUpload(true)}
            onViewDetail={() => activeMeta && handleViewDetail(activeMeta)}
          />
        ) : (
          <VersionsTab
            versions={versions}
            onActivate={handleActivate}
            onDelete={handleDelete}
            onView={handleViewDetail}
            onDownload={(v) => handleDownload(v.id)}
          />
        )}
      </div>

      {showUpload && (
        <YamlUploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={async () => {
            setShowUpload(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function DashboardTab({
  activeMeta,
  activeRuleSet,
  onUpload,
  onViewDetail,
}: {
  activeMeta: RuleVersionMeta | null;
  activeRuleSet: RuleSet | null;
  onUpload: () => void;
  onViewDetail: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div className="border border-primary/30 bg-primary/5 p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t("rules.activeRuleset")}</div>
            <h2 className="text-xl font-bold text-foreground">
              {activeMeta ? activeMeta.name || activeRuleSet?.name || activeMeta.file_name : t("rules.noActiveRules")}
            </h2>
          </div>
          {activeMeta && <span className="text-xs bg-primary/20 text-primary px-2.5 py-1 font-mono">ACTIVE</span>}
        </div>
        {activeMeta && (
          <div className="grid grid-cols-3 gap-4 text-sm mb-4">
            <div>
              <span className="text-muted-foreground text-xs">{t("rules.version")}</span>
              <div className="font-mono text-foreground">{activeMeta.version || activeRuleSet?.version || "—"}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">{t("rules.updatedAt")}</span>
              <div className="font-mono text-foreground">{new Date(activeMeta.uploaded_at).toLocaleString()}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">{t("rules.dimensions")}</span>
              <div className="font-mono text-foreground">{activeRuleSet?.dimensions?.length ?? 0}</div>
            </div>
          </div>
        )}

        {activeRuleSet?.ecosystemModules && (
          <div className="mb-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{t("rules.ecosystemModules")}</div>
            <div className="flex gap-2 flex-wrap">
              {activeRuleSet.ecosystemModules.map((m) => (
                <span
                  key={m.key}
                  className={`text-xs px-2.5 py-1 border font-mono ${
                    m.enabled ? "border-primary/40 text-primary bg-primary/10" : "border-border text-muted-foreground"
                  }`}
                >
                  {m.name}: {m.enabled ? "✅ ON" : "❌ OFF"}
                </span>
              ))}
            </div>
          </div>
        )}

        {activeMeta && <div className="text-xs text-muted-foreground mb-4 font-mono">SHA256: {activeMeta.sha256}</div>}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onUpload} className="text-xs border border-primary/40 px-4 py-2 text-primary hover:bg-primary/10 transition-colors">
            {t("rules.uploadYAML")}
          </button>
          {activeMeta && (
            <button type="button" onClick={onViewDetail} className="text-xs border border-border px-4 py-2 text-muted-foreground hover:text-primary transition-colors">
              {t("rules.viewDetail")}
            </button>
          )}
        </div>
      </div>

      {activeRuleSet && (
        <div className="border border-border p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">{t("rules.dimensionOverview")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {activeRuleSet.dimensions.map((d) => (
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
  versions: RuleVersionMeta[];
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  onView: (v: RuleVersionMeta) => void;
  onDownload: (v: RuleVersionMeta) => void;
}) {
  const { t } = useI18n();

  if (versions.length === 0) {
    return <div className="text-muted-foreground text-sm py-8 text-center">{t("rules.noVersions")}</div>;
  }

  return (
    <div className="space-y-3">
      {versions.map((v) => (
        <div
          key={v.id}
          className={`border p-4 flex flex-wrap items-center justify-between gap-3 ${
            v.is_active ? "border-primary/40 bg-primary/5" : "border-border bg-muted/10"
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-foreground/90 truncate">{v.name || v.file_name}</span>
              {v.is_active && <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 font-mono shrink-0">ACTIVE</span>}
              {v.is_orphan && (
                <span className="text-[10px] border border-border text-muted-foreground px-2 py-0.5 shrink-0">{t("rules.orphanBadge")}</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {v.version && `v${v.version} · `}
              {t("rules.uploadedBy")} {v.uploaded_by || "unknown"} · {new Date(v.uploaded_at).toLocaleString()}
            </div>
            {v.sha256 ? (
              <div className="text-xs text-muted-foreground/60 font-mono mt-0.5 truncate">SHA256: {v.sha256}</div>
            ) : null}
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => onView(v)} className="text-xs border border-border px-2.5 py-1 text-muted-foreground hover:text-primary transition-colors">
              {t("rules.view")}
            </button>
            {!v.is_active && !v.is_orphan && (
              <button type="button" onClick={() => onActivate(v.id)} className="text-xs border border-primary/40 px-2.5 py-1 text-primary hover:bg-primary/10 transition-colors">
                {t("rules.activate")}
              </button>
            )}
            {!v.is_orphan && (
              <button type="button" onClick={() => onDownload(v)} className="text-xs border border-border px-2.5 py-1 text-muted-foreground hover:text-primary transition-colors">
                ⬇ YAML
              </button>
            )}
            {!v.is_active && !v.is_orphan && (
              <button type="button" onClick={() => onDelete(v.id)} className="text-xs border border-destructive/40 px-2.5 py-1 text-destructive hover:bg-destructive/10 transition-colors">
                {t("admin.delete")}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
