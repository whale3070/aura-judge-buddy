import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import {
  fetchJudgesPanelAPI,
  getAdminWallet,
  postJudgesAutoAssignAPI,
  putJudgesPanelAPI,
  type JudgePanelRow,
} from "@/lib/apiClient";
import { randomUUIDCompat } from "@/lib/utils";
import { Users, Loader2, Plus, Trash2, Save, Shuffle, ExternalLink, Copy, AlertCircle } from "lucide-react";

type JudgeRow = JudgePanelRow & { rowKey: string };

function judgesWithRowKeys(judges: JudgePanelRow[]): JudgeRow[] {
  return judges.map((j) => ({ ...j, rowKey: randomUUIDCompat() }));
}

export default function RoundJudgesTab({ roundId }: { roundId: string }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<JudgeRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [submissionTotal, setSubmissionTotal] = useState(0);
  const [updatedAt, setUpdatedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setErr(null);
    return fetchJudgesPanelAPI(roundId)
      .then((data) => {
        setRows(
          data.judges?.length ? judgesWithRowKeys(data.judges) : [{ id: "", name: "", rowKey: randomUUIDCompat() }]
        );
        setCounts(data.counts ?? {});
        setSubmissionTotal(data.submission_total ?? 0);
        setUpdatedAt(data.updated_at ?? "");
      })
      .catch((e: Error) => {
        setErr(e.message || "load failed");
      })
      .finally(() => setLoading(false));
  }, [roundId]);

  useEffect(() => {
    if (!getAdminWallet()) {
      setLoading(false);
      setErr(t("judges.adminWalletRequired"));
      return;
    }
    reload();
  }, [reload, t]);

  const workspaceHref = (judgeId: string) =>
    `/rounds/${encodeURIComponent(roundId)}/judge/${encodeURIComponent(judgeId)}`;

  const copyWorkspaceUrl = (judgeId: string) => {
    const url = `${window.location.origin}${workspaceHref(judgeId)}`;
    void navigator.clipboard.writeText(url).catch(() => {
      window.prompt(t("judges.copyUrlFallback"), url);
    });
  };

  const onSave = async () => {
    const judges = rows
      .map((r) => ({ id: r.id.trim(), name: r.name.trim() }))
      .filter((r) => r.id.length > 0);
    if (judges.length === 0) {
      setErr(t("judges.needOneJudgeId"));
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await putJudgesPanelAPI(roundId, judges);
      await reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onAutoAssign = async () => {
    setAssigning(true);
    setErr(null);
    try {
      const res = await postJudgesAutoAssignAPI(roundId);
      setCounts(res.counts ?? {});
      setSubmissionTotal(res.submission_total ?? 0);
      await reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAssigning(false);
    }
  };

  const addRow = () => setRows((prev) => [...prev, { id: "", name: "", rowKey: randomUUIDCompat() }]);
  const removeRow = (rowKey: string) => setRows((prev) => prev.filter((r) => r.rowKey !== rowKey));

  if (!getAdminWallet()) {
    return (
      <div className="border border-border border-dashed p-8 bg-muted/5 space-y-2">
        <div className="flex items-start gap-2 text-destructive text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{t("judges.adminWalletRequired")}</p>
        </div>
        <p className="text-xs text-muted-foreground">{t("judges.setWalletHint")}</p>
      </div>
    );
  }

  return (
    <div className="border border-border p-8 bg-muted/5 space-y-6">
      <div className="flex items-start gap-3">
        <Users className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-foreground/90">{t("judges.panelTitle")}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">{t("judges.panelDesc")}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {t("judges.submissionTotal")}: {submissionTotal}
            {updatedAt ? ` · ${t("judges.updatedAt")} ${updatedAt}` : ""}
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          …
        </div>
      )}

      {err && (
        <div className="text-xs text-destructive border border-destructive/30 px-3 py-2 bg-destructive/5">{err}</div>
      )}

      {!loading && (
        <>
          <div className="overflow-x-auto border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="p-2 font-bold w-[140px]">{t("judges.colJudgeId")}</th>
                  <th className="p-2 font-bold">{t("judges.colJudgeName")}</th>
                  <th className="p-2 font-bold w-[100px]">{t("judges.colAssigned")}</th>
                  <th className="p-2 font-bold w-[200px]">{t("judges.colActions")}</th>
                  <th className="p-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowKey} className="border-b border-border/80">
                    <td className="p-2 align-top">
                      <input
                        className="w-full bg-background border border-border px-2 py-1 font-mono"
                        value={row.id}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) => (r.rowKey === row.rowKey ? { ...r, id: e.target.value } : r))
                          )
                        }
                        placeholder="j1"
                      />
                    </td>
                    <td className="p-2 align-top">
                      <input
                        className="w-full bg-background border border-border px-2 py-1"
                        value={row.name}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) => (r.rowKey === row.rowKey ? { ...r, name: e.target.value } : r))
                          )
                        }
                        placeholder={t("judges.namePlaceholder")}
                      />
                    </td>
                    <td className="p-2 align-top text-muted-foreground tabular-nums">
                      {row.id.trim() ? counts[row.id.trim()] ?? 0 : "—"}
                    </td>
                    <td className="p-2 align-top">
                      {row.id.trim() ? (
                        <div className="flex flex-wrap gap-1">
                          <Link
                            to={workspaceHref(row.id.trim())}
                            className="inline-flex items-center gap-1 border border-border px-2 py-1 hover:text-primary"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {t("judges.openWorkspace")}
                          </Link>
                          <button
                            type="button"
                            onClick={() => copyWorkspaceUrl(row.id.trim())}
                            className="inline-flex items-center gap-1 border border-border px-2 py-1 hover:text-primary"
                          >
                            <Copy className="w-3 h-3" />
                            {t("judges.copyLink")}
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2 align-top">
                      <button
                        type="button"
                        onClick={() => removeRow(row.rowKey)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                        aria-label={t("judges.removeRow")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1.5 text-xs border border-border px-3 py-2 hover:border-primary"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("judges.addJudge")}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {t("judges.saveJudges")}
            </button>
            <button
              type="button"
              onClick={onAutoAssign}
              disabled={assigning}
              className="inline-flex items-center gap-1.5 text-xs font-bold border border-accent/50 text-accent px-4 py-2 hover:bg-accent/10 disabled:opacity-50"
            >
              {assigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shuffle className="w-3.5 h-3.5" />}
              {t("judges.autoAssign")}
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-2xl">{t("judges.assignAlgoNote")}</p>
        </>
      )}
    </div>
  );
}
