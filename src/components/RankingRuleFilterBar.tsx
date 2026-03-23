import { useI18n } from "@/lib/i18n";
import {
  ALL_RULES_FILTER_VALUE,
  LEGACY_RULE_FILTER_VALUE,
  type RuleFilterOption,
} from "@/lib/rankingRuleFilter";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  value: string;
  onChange: (ruleId: string) => void;
  options: RuleFilterOption[];
  disabled?: boolean;
}

function optionTriggerLabel(o: RuleFilterOption, t: (k: string) => string): string {
  if (o.value === ALL_RULES_FILTER_VALUE) return t("ranking.ruleAllRulesOption");
  if (o.value === LEGACY_RULE_FILTER_VALUE) return t("ranking.ruleLegacyOption");
  return o.label ? `${o.label} — ${o.value}` : o.value;
}

export default function RankingRuleFilterBar({ value, onChange, options, disabled }: Props) {
  const { t } = useI18n();

  const selected = options.find((o) => o.value === value);

  return (
    <div className="mb-4 border border-border bg-muted/20 px-4 py-3 space-y-2">
      <Label className="text-xs font-bold text-foreground/90 tracking-wide">{t("ranking.ruleRubric")}</Label>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{t("ranking.ruleFilterHint")}</p>
      <Select value={value} onValueChange={onChange} disabled={disabled || options.length === 0}>
        <SelectTrigger className="w-full max-w-3xl font-mono text-xs h-auto min-h-10 py-2 text-left">
          <SelectValue placeholder={t("ranking.rulePlaceholder")} />
        </SelectTrigger>
        <SelectContent className="max-w-[min(100vw-2rem,42rem)]">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs font-mono">
              {optionTriggerLabel(o, t)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected &&
        selected.value !== LEGACY_RULE_FILTER_VALUE &&
        selected.value !== ALL_RULES_FILTER_VALUE && (
        <p className="text-[10px] text-muted-foreground font-mono break-all">
          {t("ranking.ruleSelectedMeta", {
            id: selected.value,
            sha: selected.sha256 ? `${selected.sha256.slice(0, 18)}…` : "—",
          })}
        </p>
      )}
    </div>
  );
}
