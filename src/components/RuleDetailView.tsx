import { useI18n, LanguageToggle } from "@/lib/i18n";
import { downloadYAML, type RuleVersion } from "@/lib/rulesApi";

interface Props {
  version: RuleVersion;
  onBack: () => void;
}

export default function RuleDetailView({ version, onBack }: Props) {
  const { t } = useI18n();
  const r = version.parsed;

  return (
    <div className="min-h-screen bg-background p-5">
      <div className="max-w-[1200px] mx-auto border border-primary/40 p-8 bg-card shadow-[0_0_30px_hsl(var(--primary)/0.1)]">
        <div className="flex justify-between items-center mb-6">
          <div>
            <button onClick={onBack} className="text-xs text-muted-foreground hover:text-primary transition-colors mb-2 block">
              ← {t("rules.backToRules")}
            </button>
            <h1 className="text-2xl font-display font-bold text-primary">{r.name}</h1>
            <div className="text-xs text-muted-foreground mt-1">
              v{r.version} · {r.updatedAt} {version.active && <span className="ml-2 bg-primary/20 text-primary px-2 py-0.5 font-mono text-[10px]">ACTIVE</span>}
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <LanguageToggle />
            <button
              onClick={() => downloadYAML(version.rawYAML, `${r.name}-${r.version}.yaml`)}
              className="text-xs border border-primary/40 px-4 py-2 text-primary hover:bg-primary/10 transition-colors"
            >
              ⬇ {t("rules.downloadYAML")}
            </button>
          </div>
        </div>

        {/* Universal Dimensions */}
        <section className="mb-8">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3 border-b border-border pb-2">
            {t("rules.universalDimensions")}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 px-3">Key</th>
                  <th className="py-2 px-3">{t("rules.dimName")}</th>
                  <th className="py-2 px-3">{t("rules.dimWeight")}</th>
                  <th className="py-2 px-3">{t("rules.dimDesc")}</th>
                </tr>
              </thead>
              <tbody>
                {r.dimensions.map((d) => (
                  <tr key={d.key} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">{d.key}</td>
                    <td className="py-2.5 px-3 font-medium text-foreground">{d.name}</td>
                    <td className="py-2.5 px-3"><span className="text-primary font-bold">{d.weight}%</span></td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs">{d.description}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="py-2 px-3" colSpan={2}></td>
                  <td className="py-2 px-3 font-bold text-foreground">{r.dimensions.reduce((s, d) => s + d.weight, 0)}%</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Grading Bands */}
        <section className="mb-8">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3 border-b border-border pb-2">
            {t("rules.gradingBands")}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {r.gradingBands.map((b) => (
              <div key={b.grade} className="border border-border p-4 text-center">
                <div className="text-2xl font-bold text-primary mb-1">{b.grade}</div>
                <div className="text-sm font-mono text-foreground">{b.min}–{b.max}</div>
                <div className="text-xs text-muted-foreground mt-1">{b.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Ecosystem Modules */}
        {r.ecosystemModules && r.ecosystemModules.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3 border-b border-border pb-2">
              {t("rules.ecosystemModules")}
            </h2>
            {r.ecosystemModules.map((m) => (
              <div key={m.key} className={`border p-5 mb-3 ${m.enabled ? "border-primary/30 bg-primary/5" : "border-border bg-muted/10"}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-bold text-foreground">{m.name}</span>
                  <span className={`text-[10px] px-2 py-0.5 font-mono ${m.enabled ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {m.enabled ? "ENABLED" : "DISABLED"}
                  </span>
                </div>
                {m.enabled && m.extraChecks.length > 0 && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b border-border">
                        <th className="py-2 px-3">Key</th>
                        <th className="py-2 px-3">{t("rules.dimName")}</th>
                        <th className="py-2 px-3">{t("rules.dimWeight")}</th>
                        <th className="py-2 px-3">{t("rules.dimDesc")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.extraChecks.map((c) => (
                        <tr key={c.key} className="border-b border-border/50">
                          <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{c.key}</td>
                          <td className="py-2 px-3 font-medium text-foreground">{c.name}</td>
                          <td className="py-2 px-3 text-primary font-bold">{c.weight}%</td>
                          <td className="py-2 px-3 text-muted-foreground text-xs">{c.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Notes */}
        {r.notes && (
          <section>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3 border-b border-border pb-2">
              {t("rules.notes")}
            </h2>
            <pre className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/20 border border-border p-4 font-mono">{r.notes}</pre>
          </section>
        )}
      </div>
    </div>
  );
}
