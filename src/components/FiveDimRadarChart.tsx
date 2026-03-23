import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { AuditReport } from "@/lib/api";
import {
  FIVE_DIM_KEYS_ZH,
  averageFiveDims,
  type FiveDimKeyZh,
} from "@/lib/dimensionTier";
import { useI18n } from "@/lib/i18n";

const DIM_LABEL_KEY: Record<FiveDimKeyZh, string> = {
  创新性: "ranking.dimInnovation",
  技术实现: "ranking.dimTechnical",
  商业价值: "ranking.dimBusiness",
  用户体验: "ranking.dimUx",
  落地可行性: "ranking.dimFeasibility",
};

interface Props {
  reports: AuditReport[] | undefined;
}

export default function FiveDimRadarChart({ reports }: Props) {
  const { t } = useI18n();
  const avg = averageFiveDims(reports ?? []);

  if (!avg) {
    return (
      <p className="text-xs text-muted-foreground border border-border/60 bg-muted/20 px-3 py-2 rounded">
        {t("my.noDimensionData")}
      </p>
    );
  }

  const data = FIVE_DIM_KEYS_ZH.map((k) => ({
    subject: t(DIM_LABEL_KEY[k]),
    score: Math.round(avg[k] * 10) / 10,
  }));

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-stretch lg:items-center">
      <div className="w-full lg:w-[58%] h-[min(320px,55vw)] min-h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="72%" data={data}>
            <PolarGrid stroke="hsl(var(--border))" strokeOpacity={0.9} />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 20]}
              tickCount={5}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
            />
            <Radar
              name={t("ranking.radarSeriesName")}
              dataKey="score"
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary))"
              fillOpacity={0.32}
              strokeWidth={2}
            />
            <Tooltip
              formatter={(v: number) => [`${v} / 20`, t("ranking.radarTooltipScore")]}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                fontSize: "12px",
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="w-full lg:flex-1 space-y-1">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          {t("ranking.radarScoreTableTitle")}
        </p>
        <ul className="space-y-2 text-sm">
          {FIVE_DIM_KEYS_ZH.map((k) => (
            <li
              key={k}
              className="flex justify-between gap-3 items-baseline border-b border-border/50 pb-2 last:border-0"
            >
              <span className="text-muted-foreground shrink-0">{t(DIM_LABEL_KEY[k])}</span>
              <span className="font-mono font-semibold text-primary tabular-nums">
                {avg[k].toFixed(1)}
                <span className="text-muted-foreground font-normal text-xs ml-1">/ 20</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">{t("ranking.radarFootnote")}</p>
      </div>
    </div>
  );
}
