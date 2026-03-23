import { useI18n, LanguageToggle } from "@/lib/i18n";

export default function Landing() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background p-5 relative overflow-hidden">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-transparent to-primary/[0.03] animate-scanline" />
      </div>

      <div className="max-w-[800px] mx-auto relative z-10">
        <div className="border border-primary/40 p-8 shadow-[0_0_30px_hsl(var(--primary)/0.1)] bg-card">
          <div className="flex justify-end mb-4">
            <LanguageToggle />
          </div>

          <h1 className="text-center text-3xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)] mb-2">
            {t("landing.title")}
          </h1>
          <p className="text-center text-sm text-muted-foreground mb-8 pb-4 border-b border-border">
            {t("landing.subtitle")}
          </p>

          <section className="mb-8">
            <h2 className="text-lg font-bold text-foreground border-l-4 border-primary pl-3 mb-3">
              {t("landing.whatIs")}
            </h2>
            <p className="text-sm text-foreground/90 leading-relaxed">{t("landing.whatIsDesc")}</p>
            <p className="text-sm text-muted-foreground mt-2">{t("landing.whatIsNote")}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-lg font-bold text-foreground border-l-4 border-primary pl-3 mb-3">
              {t("landing.goals")}
            </h2>
            <ul className="text-sm text-foreground/90 space-y-2 list-disc list-inside">
              {(["goal1", "goal2", "goal3", "goal4", "goal5"] as const).map((k) => (
                <li key={k}>{t(`landing.${k}`)}</li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-lg font-bold text-foreground border-l-4 border-primary pl-3 mb-3">
              {t("landing.afterSubmit")}
            </h2>
            <p className="text-sm text-foreground/90 mb-3">{t("landing.afterSubmitDesc")}</p>
            <ol className="text-sm text-foreground/90 space-y-2 list-decimal list-inside">
              {(["step1", "step2", "step3", "step4", "step5"] as const).map((k) => (
                <li key={k}>{t(`landing.${k}`)}</li>
              ))}
            </ol>
            <p className="text-sm text-muted-foreground mt-3">{t("landing.afterSubmitNote")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
