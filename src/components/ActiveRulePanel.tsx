import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { fetchActiveRules, generateMockAIScores, type RuleVersion, type MockAIScore } from "@/lib/rulesApi";

export default function ActiveRulePanel() {
  const { t } = useI18n();
  const [active, setActive] = useState<RuleVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [mockScores, setMockScores] = useState<MockAIScore | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadRules = async () => {
    setLoading(true);
    const r = await fetchActiveRules();
    setActive(r);
    setLoading(false);
  };

  useEffect(() => { loadRules(); }, []);

  const handleGenerate = () => {
    if (!active) return;
    setGenerating(true);
    setTimeout(() => {
      setMockScores(generateMockAIScores(active.parsed));
      setGenerating(false);
    }, 800);
  };

  const gradeColor = (g: string) => {
    if (g === "S") return "text-primary";
    if (g === "A") return "text-primary/80";
    if (g === "B") return "text-accent-foreground";
    return "text-destructive";
  };

  return (
    <div className="border border-primary/30 bg-primary/5 p-5 mb-5">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t("rules.activeRulesetPanel")}</div>
          {loading ? (
            <div className="text-sm text-muted-foreground">{t("admin.loadingSub")}</div>
          ) : active ? (
            <>
              <div className="font-bold text-foreground">{active.parsed.name} <span className="text-xs font-mono text-muted-foreground">v{active.parsed.version}</span></div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {t("rules.ecosystemModules")}: {active.parsed.ecosystemModules.filter(m => m.enabled).map(m => m.name).join(", ") || "None"}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">{t("rules.noActiveRules")}</div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={loadRules} className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
            🔄 {t("rules.reloadRules")}
          </button>
          <button
            onClick={handleGenerate}
            disabled={!active || generating}
            className="text-xs border border-primary/40 px-3 py-1.5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            {generating ? "⏳..." : `🤖 ${t("rules.mockAIScore")}`}
          </button>
        </div>
      </div>

      {/* Mock AI Scores */}
      {mockScores && (
        <div className="border-t border-border pt-3 mt-3 space-y-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("rules.aiScoreResult")}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {mockScores.dimensionScores.map((d) => (
              <div key={d.key} className="border border-border/60 p-2 bg-muted/20">
                <div className="text-xs text-muted-foreground truncate">{d.name}</div>
                <div className="text-sm font-bold text-foreground">{d.score} <span className="text-xs text-muted-foreground font-normal">({d.weight}%)</span></div>
              </div>
            ))}
          </div>
          {mockScores.ecosystemScores.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {mockScores.ecosystemScores.map((d) => (
                <div key={d.key} className="border border-primary/20 p-2 bg-primary/5">
                  <div className="text-xs text-muted-foreground truncate">{d.name}</div>
                  <div className="text-sm font-bold text-foreground">{d.score} <span className="text-xs text-muted-foreground font-normal">({d.weight}%)</span></div>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-4 pt-1">
            <div className="text-sm">
              <span className="text-muted-foreground">{t("rules.aiWeightedScore")}:</span>{" "}
              <span className="font-bold text-foreground text-lg">{mockScores.weightedScore}</span>
            </div>
            <div className={`text-2xl font-bold ${gradeColor(mockScores.grade)}`}>
              {mockScores.grade}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
