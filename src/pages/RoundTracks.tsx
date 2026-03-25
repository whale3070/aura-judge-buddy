import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import { fetchRoundTracksAPI, putRoundTracksAPI, type RoundTrackEntry } from "@/lib/apiClient";

const TRACK_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function emptyRow(): RoundTrackEntry {
  return { id: "", name: "", description: "", prize_pool: "" };
}

export default function RoundTracks() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<RoundTrackEntry[]>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    fetchRoundTracksAPI(id)
      .then((tracks) => {
        if (!cancelled) setRows(tracks.map((r) => ({ ...r })));
      })
      .catch(() => {
        if (!cancelled) {
          toast.error(t("rounds.tracksLoadError"));
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  const updateRow = useCallback((i: number, patch: Partial<RoundTrackEntry>) => {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }, []);

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, j) => j !== i));

  const validate = (): string | null => {
    const ids = new Set<string>();
    for (const r of rows) {
      const tid = r.id.trim();
      if (!tid) return t("rounds.tracksErrEmptyId");
      if (!TRACK_ID_RE.test(tid)) return t("rounds.tracksErrBadId");
      if (ids.has(tid)) return t("rounds.tracksErrDupId");
      ids.add(tid);
      if (!r.name.trim()) return t("rounds.tracksErrEmptyName");
    }
    return null;
  };

  const handleSave = async () => {
    if (!id) return;
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    const payload: RoundTrackEntry[] = rows.map((r) => ({
      id: r.id.trim(),
      name: r.name.trim(),
      description: (r.description ?? "").trim() || undefined,
      prize_pool: (r.prize_pool ?? "").trim() || undefined,
    }));
    setSaving(true);
    try {
      const saved = await putRoundTracksAPI(id, payload);
      setRows(saved.map((r) => ({ ...r })));
      toast.success(t("rounds.tracksSaved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("rounds.tracksSaveError"));
    } finally {
      setSaving(false);
    }
  };

  if (!id) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Round not found.</div>
    );
  }

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
        <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => navigate(`/rounds/${encodeURIComponent(id)}`)}
              className="text-muted-foreground hover:text-primary transition-colors mt-1"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-display font-bold text-primary">{t("rounds.tracksTitle")}</h1>
              <p className="text-xs font-mono text-muted-foreground mt-1">round_id={id}</p>
              <p className="text-xs text-muted-foreground mt-2 max-w-2xl leading-relaxed">{t("rounds.tracksIntro")}</p>
            </div>
          </div>
          <LanguageToggle />
        </div>

        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground border border-dashed border-border p-4 mb-4 bg-muted/5">{t("rounds.tracksEmptyHint")}</p>
        )}

        <div className="space-y-4 mb-6">
          {rows.map((row, i) => (
            <div
              key={`${i}-${row.id}`}
              className="border border-border p-4 bg-muted/5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
            >
              <label className="sm:col-span-3 flex flex-col gap-1 text-[11px]">
                <span className="text-muted-foreground font-bold uppercase tracking-wider">{t("rounds.tracksId")}</span>
                <input
                  value={row.id}
                  onChange={(e) => updateRow(i, { id: e.target.value })}
                  className="w-full border border-border bg-background px-2 py-2 text-sm font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="sm:col-span-3 flex flex-col gap-1 text-[11px]">
                <span className="text-muted-foreground font-bold uppercase tracking-wider">{t("rounds.tracksName")}</span>
                <input
                  value={row.name}
                  onChange={(e) => updateRow(i, { name: e.target.value })}
                  className="w-full border border-border bg-background px-2 py-2 text-sm"
                />
              </label>
              <label className="sm:col-span-4 flex flex-col gap-1 text-[11px]">
                <span className="text-muted-foreground font-bold uppercase tracking-wider">{t("rounds.tracksDesc")}</span>
                <input
                  value={row.description ?? ""}
                  onChange={(e) => updateRow(i, { description: e.target.value })}
                  className="w-full border border-border bg-background px-2 py-2 text-sm"
                />
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1 text-[11px]">
                <span className="text-muted-foreground font-bold uppercase tracking-wider">{t("rounds.tracksPrize")}</span>
                <input
                  value={row.prize_pool ?? ""}
                  onChange={(e) => updateRow(i, { prize_pool: e.target.value })}
                  className="w-full border border-border bg-background px-2 py-2 text-sm"
                />
              </label>
              <div className="sm:col-span-12 flex justify-end sm:justify-start sm:col-start-12 sm:row-start-1 sm:w-auto w-full">
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="inline-flex items-center gap-1 text-xs border border-destructive/40 text-destructive px-3 py-2 hover:bg-destructive/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t("rounds.tracksRemove")}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-2 text-xs font-bold border border-border px-4 py-2.5 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("rounds.tracksAdd")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 text-xs font-bold bg-primary text-primary-foreground px-4 py-2.5 hover:shadow-[0_0_20px_hsl(var(--primary)/0.5)] transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t("rounds.tracksSave")}
          </button>
        </div>
      </div>
    </div>
  );
}
