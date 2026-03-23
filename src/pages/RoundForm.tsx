import { useState, useMemo, useEffect } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import {
  defaultDimensions,
  defaultGradeBands,
  defaultPitch,
  type ScoringDimension,
  type GradeBand,
  type PitchConfig,
  type RoundMode,
  type RoundStatus,
} from "@/lib/hackathonRounds";
import {
  createRoundAPI,
  updateRoundAPI,
  fetchRoundDetailAPI,
  fetchRuleVersionsAPI,
  getRuleDownloadURL,
  type RuleVersionMeta,
} from "@/lib/apiClient";
import { parseAndValidateYAML } from "@/lib/rulesApi";
import { ArrowLeft, Plus, Trash2, AlertCircle, Check, Loader2 } from "lucide-react";

const modes: RoundMode[] = ["online", "offline", "hybrid"];
const statuses: RoundStatus[] = ["draft", "open", "judging", "closed", "archived"];

const roundIdPattern = /^[a-zA-Z0-9._-]{1,80}$/;

export default function RoundForm() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = location.pathname === "/rounds/new" || id === "new";

  const [roundId, setRoundId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<RoundMode>("online");
  const [timezone, setTimezone] = useState("Asia/Hong_Kong");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [status, setStatus] = useState<RoundStatus>("draft");
  const [loading, setLoading] = useState(() => !isNew && Boolean(id));
  const [saving, setSaving] = useState(false);

  const [dimensions, setDimensions] = useState<ScoringDimension[]>([...defaultDimensions]);
  const [gradeBands, setGradeBands] = useState<GradeBand[]>([...defaultGradeBands]);
  const [pitch, setPitch] = useState<PitchConfig>({ ...defaultPitch });

  const [ruleVersions, setRuleVersions] = useState<RuleVersionMeta[]>([]);
  const [rulesListLoading, setRulesListLoading] = useState(false);
  const [selectedRuleVersionId, setSelectedRuleVersionId] = useState("");
  const [ruleYamlLoading, setRuleYamlLoading] = useState(false);

  useEffect(() => {
    if (isNew || !id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchRoundDetailAPI(id)
      .then((data) => {
        if (cancelled) return;
        const m = data.meta;
        if (m) {
          setName(m.name ?? "");
          setDescription(m.description ?? "");
          if (m.mode && modes.includes(m.mode as RoundMode)) setMode(m.mode as RoundMode);
          setTimezone(m.timezone ?? "Asia/Hong_Kong");
          setStartAt(m.start_at ?? "");
          setEndAt(m.end_at ?? "");
          if (m.status && statuses.includes(m.status as RoundStatus)) setStatus(m.status as RoundStatus);
          if (m.rules?.scoring_dimensions?.length) {
            setDimensions(m.rules.scoring_dimensions.map((d) => ({ name: d.name, weight: d.weight })));
          }
          if (m.rules?.grade_bands?.length) {
            setGradeBands(m.rules.grade_bands.map((b) => ({ grade: b.grade, min: b.min, max: b.max })));
          }
          if (m.pitch) {
            setPitch({
              enabled: m.pitch.enabled,
              weight: m.pitch.weight,
              subScores: m.pitch.sub_scores?.length
                ? m.pitch.sub_scores.map((s) => ({ name: s.name, weight: s.weight }))
                : [...defaultPitch.subScores],
            });
          }
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("加载轮次失败，请确认 API 与 round_id");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  useEffect(() => {
    if (!isNew) return;
    let cancelled = false;
    setRulesListLoading(true);
    fetchRuleVersionsAPI(null)
      .then((res) => {
        if (cancelled) return;
        const list = (res.versions ?? []).filter((v) => !v.is_orphan);
        setRuleVersions(list);
      })
      .catch(() => {
        if (!cancelled) toast.error("无法加载规则版本列表，请检查 API");
      })
      .finally(() => {
        if (!cancelled) setRulesListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isNew]);

  useEffect(() => {
    if (!isNew || !selectedRuleVersionId) return;
    let cancelled = false;
    setRuleYamlLoading(true);
    (async () => {
      try {
        const res = await fetch(getRuleDownloadURL(selectedRuleVersionId));
        if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
        const raw = await res.text();
        if (cancelled) return;
        const { parsed, validation } = parseAndValidateYAML(raw);
        if (!parsed) {
          toast.error(validation.errors[0] ?? "规则 YAML 无效");
          return;
        }
        setDimensions(parsed.dimensions.map((d) => ({ name: d.name, weight: d.weight })));
        const bands = parsed.gradingBands?.length
          ? parsed.gradingBands.map((g) => ({ grade: g.grade, min: g.min, max: g.max }))
          : [...defaultGradeBands];
        setGradeBands(bands);
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "加载规则失败";
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setRuleYamlLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, selectedRuleVersionId]);

  const totalWeight = useMemo(() => dimensions.reduce((s, d) => s + d.weight, 0), [dimensions]);
  const weightValid = totalWeight === 100;

  const updateDim = (i: number, field: keyof ScoringDimension, val: string | number) => {
    setDimensions((prev) =>
      prev.map((d, idx) => (idx === i ? { ...d, [field]: field === "weight" ? Number(val) : val } : d))
    );
  };
  const removeDim = (i: number) => setDimensions((prev) => prev.filter((_, idx) => idx !== i));
  const addDim = () => setDimensions((prev) => [...prev, { name: "", weight: 0 }]);

  const updateBand = (i: number, field: "min" | "max", val: number) => {
    setGradeBands((prev) => prev.map((b, idx) => (idx === i ? { ...b, [field]: val } : b)));
  };

  const updatePitchSub = (i: number, field: "name" | "weight", val: string | number) => {
    setPitch((prev) => ({
      ...prev,
      subScores: prev.subScores.map((s, idx) =>
        idx === i ? { ...s, [field]: field === "weight" ? Number(val) : val } : s
      ),
    }));
  };

  function buildMetaPayload(): Record<string, unknown> {
    const rules: Record<string, unknown> = {
      scoring_dimensions: dimensions.map((d) => ({ name: d.name, weight: d.weight })),
      grade_bands: gradeBands.map((b) => ({ grade: b.grade, min: b.min, max: b.max })),
    };
    if (isNew && selectedRuleVersionId.trim()) {
      rules.rule_version_id = selectedRuleVersionId.trim();
    }
    return {
      name,
      description,
      mode,
      timezone,
      start_at: startAt,
      end_at: endAt,
      status,
      rules,
      pitch: {
        enabled: pitch.enabled,
        weight: pitch.weight,
        sub_scores: pitch.subScores.map((s) => ({ name: s.name, weight: s.weight })),
      },
    };
  }

  const handleSave = async () => {
    if (isNew) {
      if (!selectedRuleVersionId.trim()) {
        toast.error(t("rounds.pickRuleFirst"));
        return;
      }
    }
    if (!weightValid) {
      toast.error("维度权重之和须为 100%");
      return;
    }
    if (isNew) {
      const rid = roundId.trim();
      if (!rid) {
        toast.error("请填写轮次 ID（英文/数字，用于目录名）");
        return;
      }
      if (!roundIdPattern.test(rid)) {
        toast.error("轮次 ID 仅允许字母、数字、. _ -，最长 80 字符");
        return;
      }
    }
    setSaving(true);
    try {
      if (isNew) {
        const rid = roundId.trim();
        await createRoundAPI({ id: rid, ...buildMetaPayload() });
        toast.success("轮次已创建");
        navigate(`/rounds/${encodeURIComponent(rid)}`);
      } else if (id) {
        await updateRoundAPI(id, buildMetaPayload());
        toast.success("已保存");
        navigate(`/rounds/${encodeURIComponent(id)}`);
      } else {
        toast.error("无法保存：未识别新建/编辑模式（请从 /rounds/new 或 /rounds/:id/edit 进入）");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "保存失败";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-5">
      <div className="max-w-[900px] mx-auto border border-primary/40 p-8 bg-card shadow-[0_0_30px_hsl(var(--primary)/0.1)]">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/rounds")}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-display font-bold text-primary">
              {isNew ? t("rounds.createTitle") : t("rounds.editTitle")}
            </h1>
          </div>
          <LanguageToggle />
        </div>

        <p className="text-[11px] text-muted-foreground mb-6 border border-border border-dashed p-3">
          保存会请求 <code className="text-xs">POST/PUT /api/rounds</code>。生产环境需在 .env 配置{" "}
          <code className="text-xs">AURA_ADMIN_WALLET</code>，并在本站在管理页保存过管理员钱包后会自动带上{" "}
          <code className="text-xs">X-Admin-Wallet</code>；未配置钱包的开发环境通常仍可创建。
        </p>

        <Section title={t("rounds.basicInfo")}>
          {isNew && (
            <Field label="轮次 ID (round_id)">
              <input
                className="field-input font-mono"
                value={roundId}
                onChange={(e) => setRoundId(e.target.value)}
                placeholder="e.g. spring-2025 / r2"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                将创建目录 submissions/&lt;id&gt;、word/&lt;id&gt;、judge-result/&lt;id&gt;
              </p>
            </Field>
          )}
          <Field label={t("rounds.fieldName")}>
            <input
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Avalanche Summit 2026"
            />
          </Field>
          <Field label={t("rounds.fieldDesc")}>
            <textarea
              className="field-input min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Round description..."
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label={t("rounds.fieldMode")}>
              <select className="field-input" value={mode} onChange={(e) => setMode(e.target.value as RoundMode)}>
                {modes.map((m) => (
                  <option key={m} value={m}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("rounds.fieldTimezone")}>
              <input className="field-input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </Field>
            <Field label={t("rounds.fieldStatus")}>
              <select className="field-input" value={status} onChange={(e) => setStatus(e.target.value as RoundStatus)}>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("rounds.fieldStart")}>
              <input
                className="field-input"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </Field>
            <Field label={t("rounds.fieldEnd")}>
              <input
                className="field-input"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </Field>
          </div>
        </Section>

        {isNew ? (
          <Section title={t("rounds.judgingRules")}>
            <div className="space-y-4">
              <Field label={t("rounds.selectRuleVersion")}>
                {rulesListLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    …
                  </div>
                ) : (
                  <select
                    className="field-input"
                    value={selectedRuleVersionId}
                    onChange={(e) => setSelectedRuleVersionId(e.target.value)}
                  >
                    <option value="">{t("rounds.selectRulePlaceholder")}</option>
                    {ruleVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {(v.name || v.id) + (v.version ? ` · v${v.version}` : "")} — {v.id}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{t("rounds.ruleFromYamlHint")}</p>
              <Link
                to="/rules"
                className="inline-flex text-xs border border-primary/40 px-3 py-1.5 text-primary hover:bg-primary/10 transition-colors"
              >
                {t("rounds.openRulesToAdd")}
              </Link>
              {ruleYamlLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t("rounds.ruleYamlLoading")}
                </div>
              )}
              <div className="space-y-2 border border-border/60 rounded p-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("rounds.scoringDimensions")}</span>
                  <span
                    className={`text-xs font-mono flex items-center gap-1 ${weightValid ? "text-primary" : "text-destructive"}`}
                  >
                    {weightValid ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {totalWeight}% / 100%
                  </span>
                </div>
                {!selectedRuleVersionId ? (
                  <p className="text-xs text-muted-foreground py-2">{t("rounds.pickRuleFirst")}</p>
                ) : (
                  dimensions.map((d, i) => (
                    <div key={i} className="flex gap-2 items-center text-sm">
                      <span className="field-input flex-1 bg-background/50 text-foreground/90">{d.name}</span>
                      <span className="w-16 text-right text-muted-foreground tabular-nums">{d.weight}%</span>
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-2 border border-border/60 rounded p-3 bg-muted/20">
                <span className="text-xs text-muted-foreground">{t("rounds.gradeBandsTitle")}</span>
                {!selectedRuleVersionId ? null : (
                  <div className="space-y-1.5">
                    {gradeBands.map((b, i) => (
                      <div key={i} className="flex gap-3 items-center text-sm text-foreground/85">
                        <span className="w-8 font-bold">{b.grade}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {b.min} – {b.max}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Section>
        ) : (
          <>
            <Section title={t("rounds.judgingRules")}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("rounds.scoringDimensions")}</span>
                  <span
                    className={`text-xs font-mono flex items-center gap-1 ${weightValid ? "text-primary" : "text-destructive"}`}
                  >
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
                    <button
                      type="button"
                      onClick={() => removeDim(i)}
                      className="text-destructive hover:text-destructive/80 p-1 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addDim}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors mt-1"
                >
                  <Plus className="w-3.5 h-3.5" /> {t("rounds.addDimension")}
                </button>
              </div>
            </Section>

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
          </>
        )}

        <Section title={t("rounds.pitchTitle")}>
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              onClick={() => setPitch((p) => ({ ...p, enabled: !p.enabled }))}
              className={`w-10 h-5 rounded-full relative transition-colors ${pitch.enabled ? "bg-primary" : "bg-muted"}`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-background border border-border transition-all ${pitch.enabled ? "left-5" : "left-0.5"}`}
              />
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

        <div className="flex gap-3 mt-8">
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="bg-primary text-primary-foreground font-bold py-2.5 px-8 text-sm tracking-wider hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] transition-all disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isNew ? t("rounds.saveCreate") : t("rounds.saveUpdate")}
          </button>
          <button
            type="button"
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
      <h2 className="text-sm font-bold text-primary/80 tracking-wider uppercase mb-4 border-b border-border pb-2">{title}</h2>
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
