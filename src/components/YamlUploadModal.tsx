import { useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { parseAndValidateYAML, uploadRules, type ValidationResult, type RuleSet } from "@/lib/rulesApi";

interface Props {
  onClose: () => void;
  onUploaded: () => void;
}

export default function YamlUploadModal({ onClose, onUploaded }: Props) {
  const { t } = useI18n();
  const [rawYAML, setRawYAML] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [preview, setPreview] = useState<RuleSet | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleValidate = useCallback((text: string) => {
    setRawYAML(text);
    if (!text.trim()) {
      setValidation(null);
      setPreview(null);
      return;
    }
    const { parsed, validation: v } = parseAndValidateYAML(text);
    setValidation(v);
    setPreview(parsed);
  }, []);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      handleValidate(text);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".yaml") || file.name.endsWith(".yml"))) {
      handleFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleSave = async () => {
    if (!validation?.valid) return;
    setSaving(true);
    try {
      const result = await uploadRules(rawYAML);
      if (result.validation.valid) {
        onUploaded();
      } else {
        setValidation(result.validation);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-primary/40 shadow-[0_0_40px_hsl(var(--primary)/0.15)] w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-border">
          <h2 className="text-lg font-bold text-primary">📤 {t("rules.uploadTitle")}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed p-8 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
          >
            <p className="text-muted-foreground text-sm mb-2">{t("rules.dropHere")}</p>
            <label className="text-xs border border-primary/40 px-4 py-2 text-primary hover:bg-primary/10 transition-colors cursor-pointer inline-block">
              {t("rules.browseFiles")}
              <input type="file" accept=".yaml,.yml" className="hidden" onChange={handleFileInput} />
            </label>
          </div>

          {/* Textarea paste */}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">{t("rules.pasteYAML")}</label>
            <textarea
              value={rawYAML}
              onChange={(e) => handleValidate(e.target.value)}
              rows={12}
              className="w-full bg-muted/30 border border-border p-3 text-sm font-mono text-foreground resize-y focus:outline-none focus:border-primary/60"
              placeholder={t("rules.yamlPlaceholder")}
            />
          </div>

          {/* Validation results */}
          {validation && (
            <div className="space-y-2">
              {validation.errors.length > 0 && (
                <div className="border border-destructive/40 bg-destructive/5 p-3">
                  <div className="text-xs font-bold text-destructive mb-1">❌ {t("rules.errors")}</div>
                  {validation.errors.map((e, i) => (
                    <div key={i} className="text-xs text-destructive/80">{e}</div>
                  ))}
                </div>
              )}
              {validation.warnings.length > 0 && (
                <div className="border border-accent/40 bg-accent/5 p-3">
                  <div className="text-xs font-bold text-accent-foreground mb-1">⚠️ {t("rules.warnings")}</div>
                  {validation.warnings.map((w, i) => (
                    <div key={i} className="text-xs text-accent-foreground/80">{w}</div>
                  ))}
                </div>
              )}
              {validation.valid && (
                <div className="border border-primary/40 bg-primary/5 p-3">
                  <div className="text-xs font-bold text-primary">✅ {t("rules.validYAML")}</div>
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="border border-border p-4 space-y-3">
              <h3 className="text-sm font-bold text-foreground">{t("rules.preview")}</h3>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div><span className="text-muted-foreground">Name:</span> <span className="text-foreground">{preview.name}</span></div>
                <div><span className="text-muted-foreground">Version:</span> <span className="font-mono text-foreground">{preview.version}</span></div>
                <div><span className="text-muted-foreground">Dimensions:</span> <span className="text-foreground">{preview.dimensions?.length ?? 0}</span></div>
              </div>
              {preview.dimensions && (
                <div className="flex flex-wrap gap-2">
                  {preview.dimensions.map((d) => (
                    <span key={d.key} className="text-xs border border-border px-2 py-1 text-muted-foreground">
                      {d.name}: {d.weight}%
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-border">
          <button onClick={onClose} className="text-xs border border-border px-4 py-2 text-muted-foreground hover:text-foreground transition-colors">
            {t("rounds.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={!validation?.valid || saving}
            className="text-xs bg-primary text-primary-foreground px-5 py-2 font-bold tracking-wider hover:shadow-[0_0_15px_hsl(var(--primary)/0.5)] transition-all disabled:opacity-50"
          >
            {saving ? t("rules.saving") : t("rules.saveVersion")}
          </button>
        </div>
      </div>
    </div>
  );
}
