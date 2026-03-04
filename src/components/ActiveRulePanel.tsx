import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { fetchActiveRulesAPI, type RuleVersionMeta } from "@/lib/apiClient";
import { parseAndValidateYAML, type RuleSet } from "@/lib/rulesApi";

export default function ActiveRulePanel() {
  const { t } = useI18n();
  const [meta, setMeta] = useState<RuleVersionMeta | null>(null);
  const [ruleSet, setRuleSet] = useState<RuleSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchActiveRulesAPI();
      setMeta(res.meta);
      if (res.rawYAML) {
        const { parsed } = parseAndValidateYAML(res.rawYAML);
        setRuleSet(parsed);
      } else {
        setRuleSet(null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRules(); }, []);

  return (
    <div className="border border-primary/30 bg-primary/5 p-5 mb-5">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t("rules.activeRulesetPanel")}</div>
          {loading ? (
            <div className="text-sm text-muted-foreground">{t("admin.loadingSub")}</div>
          ) : error ? (
            <div className="text-sm text-destructive">{error}</div>
          ) : meta ? (
            <>
              <div className="font-bold text-foreground">
                {meta.name || ruleSet?.name || meta.file_name}{" "}
                <span className="text-xs font-mono text-muted-foreground">v{meta.version || ruleSet?.version || "?"}</span>
              </div>
              {ruleSet?.ecosystemModules && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t("rules.ecosystemModules")}: {ruleSet.ecosystemModules.filter(m => m.enabled).map(m => m.name).join(", ") || "None"}
                </div>
              )}
              <div className="text-xs text-muted-foreground/60 font-mono mt-0.5">
                ID: {meta.id} · SHA256: {meta.sha256.substring(0, 16)}...
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">{t("rules.noActiveRules")}</div>
          )}
        </div>
        <button onClick={loadRules} className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
          🔄 {t("rules.reloadRules")}
        </button>
      </div>
    </div>
  );
}
