import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import {
  mockRounds,
  defaultDimensions,
  defaultGradeBands,
  defaultPitch,
  type HackathonRound,
  type ScoringDimension,
  type GradeBand,
  type PitchConfig,
  type RoundMode,
  type RoundStatus,
} from "@/lib/hackathonRounds";
import { ArrowLeft, Plus, Trash2, AlertCircle, Check } from "lucide-react";

const modes: RoundMode[] = ["online", "offline", "hybrid"];
const statuses: RoundStatus[] = ["draft", "open", "judging", "closed", "archived"];

export default function RoundForm() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";
  const existing = !isNew ? mockRounds.find((r) => r.id === id) : undefined;

  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [mode, setMode] = useState<RoundMode>(existing?.mode ?? "online");
  const [timezone, setTimezone] = useState(existing?.timezone ?? "Asia/Hong_Kong");
  const [startAt, setStartAt] = useState(existing?.startAt ?? "");
  const [endAt, setEndAt] = useState(existing?.endAt ?? "");
  const [status, setStatus] = useState<RoundStatus>(existing?.status ?? "draft");

  const [dimensions, setDimensions] = useState<ScoringDimension[]>(
    existing?.rules.scoringDimensions ?? [...defaultDimensions]
  );
  const [gradeBands, setGradeBands] = useState<GradeBand[]>(
    existing?.rules.gradeBands ?? [...defaultGradeBands]
  );
  const [pitch, setPitch] = useState<PitchConfig>(
    existing?.pitch ?? { ...defaultPitch }
  );

  const totalWeight = useMemo(
    () => dimensions.reduce((s, d) => s + d.weight, 0),
    [dimensions]
  );
  const weightValid = totalWeight === 100;

  const updateDim = (i: number, field: keyof ScoringDimension, val: string | number) => {
    setDimensions((prev) =>
      prev.map((d, idx) => (idx === i ? { ...d, [field]: field === "weight" ? Number(val) : val } : d))
    );
  };
  const removeDim = (i: number) => setDimensions((prev) => prev.filter((_, idx) => idx !== i));
  const addDim = () => setDimensions((prev) => [...prev, { name: "", weight: 0 }]);

  const updateBand = (i: number, field: "min" | "max", val: number) => {
    setGradeBands((prev) =>
      prev.map((b, idx) => (idx === i ? { ...b, [field]: val } : b))
    );
  };

  const updatePitchSub = (i: number, field: "name" | "weight", val: string | number) => {
    setPitch((prev) => ({
      ...prev,
      subScores: prev.subScores.map((s, idx) =>
        idx === i ? { ...s, [field]: field === "weight" ? Number(val) : val } : s
      ),
    }));
  };

  const handleSave = () => {
    alert(isNew ? "Round created (mock)" : "Round updated (mock)");
    navigate("/rounds");
  };

  return (
    <div className="min-h-screen bg-background p-5">
      <div className="max-w-[900px] mx-auto border border-primary/40 p-8 bg-card shadow-[0_0_30px_hsl(var(--primary)/0.1)]">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/rounds")} className="text-muted-foreground hover:text-primary transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-display font-bold text-primary">
              {isNew ? t("rounds.createTitle") : t("rounds.editTitle")}
            </h1>
          </div>
          <LanguageToggle />
        </div>

        {/* Basic Info */}
        <Section title={t("rounds.basicInfo")}>
          <Field label={t("rounds.fieldName")}>
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Avalanche Summit 2026" />
          </Field>
          <Field label={t("rounds.fieldDesc")}>
            <textarea className="field-input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Round description..." />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label={t("rounds.fieldMode")}>
              <select className="field-input" value={mode} onChange={(e) => setMode(e.target.value as RoundMode)}>
                {modes.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </Field>
            <Field label={t("rounds.fieldTimezone")}>
              <input className="field-input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </Field>
            <Field label={t("rounds.fieldStatus")}>
              <select className="field-input" value={status} onChange={(e) => setStatus(e.target.value as RoundStatus)}>
                {statuses.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("rounds.fieldStart")}>
              <input className="field-input" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </Field>
            <Field label={t("rounds.fieldEnd")}>
              <input className="field-input" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </Field>
          </div>
        </Section>

        {/* Judging Rules */}
        <Section title={t("rounds.judgingRules")}>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t("rounds.scoringDimensions")}</span>
              <span className={`text-xs font-mono flex items-center gap-1 ${weightValid ? "text-primary" : "text-destructive"}`}>
                {weightValid ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                {totalWeight}% / 100%
              </span>
            </div>
            {dimensions.map((d, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className="field-input flex-1"
                  value={d.name}
                  onChange={(e) => updateDim(i, "name", e.target.value)}
                  placeholder="Dimension name"
                />
                <div className="relative w-24">
                  <input
                    className="field-input w-full pr-6 text-right"
                    type="number"
                    min={0}
                    max={100}
                    value={d.weight}
                    onChange={(e) => updateDim(i, "weight", e.target.value)}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                </div>
                <button onClick={() => removeDim(i)} className="text-destructive hover:text-destructive/80 p-1 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button onClick={addDim} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors mt-1">
              <Plus className="w-3.5 h-3.5" /> {t("rounds.addDimension")}
            </button>
          </div>
        </Section>

        {/* Grade Bands */}
        <Section title={t("rounds.gradeBandsTitle")}>
          <div className="space-y-2">
            {gradeBands.map((b, i) => (
              <div key={i} className="flex gap-3 items-center">
                <span className="w-10 text-center font-bold text-foreground/90 text-lg">{b.grade}</span>
                <input
                  className="field-input w-20 text-center"
                  type="number"
                  min={0}
                  max={100}
                  value={b.min}
                  onChange={(e) => updateBand(i, "min", Number(e.target.value))}
                />
                <span className="text-muted-foreground">–</span>
                <input
                  className="field-input w-20 text-center"
                  type="number"
                  min={0}
                  max={100}
                  value={b.max}
                  onChange={(e) => updateBand(i, "max", Number(e.target.value))}
                />
              </div>
            ))}
          </div>
        </Section>

        {/* Pitch Evaluation */}
        <Section title={t("rounds.pitchTitle")}>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setPitch((p) => ({ ...p, enabled: !p.enabled }))}
              className={`w-10 h-5 rounded-full relative transition-colors ${pitch.enabled ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-background border border-border transition-all ${pitch.enabled ? "left-5" : "left-0.5"}`} />
            </button>
            <span className="text-sm text-foreground/80">{t("rounds.enablePitch")}</span>
          </div>
          {pitch.enabled && (
            <div className="space-y-3 border-l-2 border-primary/30 pl-4">
              <Field label={t("rounds.pitchWeight")}>
                <div className="relative w-24">
                  <input
                    className="field-input w-full pr-6 text-right"
                    type="number"
                    min={0}
                    max={100}
                    value={pitch.weight}
                    onChange={(e) => setPitch((p) => ({ ...p, weight: Number(e.target.value) }))}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                </div>
              </Field>
              <span className="text-xs text-muted-foreground">{t("rounds.pitchSubScores")}</span>
              {pitch.subScores.map((s, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    className="field-input flex-1"
                    value={s.name}
                    onChange={(e) => updatePitchSub(i, "name", e.target.value)}
                  />
                  <div className="relative w-20">
                    <input
                      className="field-input w-full pr-6 text-right"
                      type="number"
                      min={0}
                      max={100}
                      value={s.weight}
                      onChange={(e) => updatePitchSub(i, "weight", e.target.value)}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Actions */}
        <div className="flex gap-3 mt-8">
          <button
            onClick={handleSave}
            className="bg-primary text-primary-foreground font-bold py-2.5 px-8 text-sm tracking-wider hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] transition-all"
          >
            {isNew ? t("rounds.saveCreate") : t("rounds.saveUpdate")}
          </button>
          <button
            onClick={() => navigate("/rounds")}
            className="border border-border text-muted-foreground font-bold py-2.5 px-8 text-sm hover:text-foreground transition-colors"
          >
            {t("rounds.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-bold text-primary/80 tracking-wider uppercase mb-4 border-b border-border pb-2">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}
