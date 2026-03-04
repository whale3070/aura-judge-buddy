import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { fetchRankings, fetchSubmissions, fetchAdminConfig, fetchFileTitles, deleteSubmission, type RankingItem, type SubmissionItem } from "@/lib/api";
import JudgeDetail from "@/components/JudgeDetail";
import GradeRankingPanel from "@/components/GradeRankingPanel";
import { useWallet } from "@/hooks/useWallet";
import { useI18n, LanguageToggle } from "@/lib/i18n";

export default function Admin() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const hash = searchParams.get("h") ?? undefined;
  const wallet = useWallet();

  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [rankingsLoading, setRankingsLoading] = useState(true);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [adminHash, setAdminHash] = useState<string | null>(null);
  const [adminWallet, setAdminWallet] = useState<string>("");
  const [configLoading, setConfigLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [tab, setTab] = useState<"rankings" | "submissions">("rankings");
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!wallet.address) return;
    fetchSubmissions(wallet.address)
      .then(setSubmissions)
      .catch(() => setSubmissions([]));
  }, [wallet.address]);

  useEffect(() => {
    if (!wallet.address) return;
    fetchAdminConfig()
      .then((cfg) => {
        setAdminHash(cfg.admin_hash ?? "");
        setAdminWallet((cfg.admin_wallet ?? "").toLowerCase());
      })
      .catch(() => {
        setAdminHash("");
        setAdminWallet("");
      });
  }, [wallet.address]);

  useEffect(() => {
    Promise.all([fetchRankings(), fetchFileTitles()])
      .then(([r, t]) => { setRankings(r); setTitleMap(t); })
      .catch(() => {
        setRankings([]);
        setTitleMap({});
      });
  }, []);

  useEffect(() => {
    fetchAdminConfig()
      .then((cfg) => {
        setAdminHash(cfg.admin_hash ?? "");
        setAdminWallet((cfg.admin_wallet ?? "").toLowerCase());
      })
      .finally(() => setConfigLoading(false));
  }, []);

  const hashOk = adminHash ? hash === adminHash : true;
  const isAdmin = !!wallet.address && !!adminWallet && wallet.address.toLowerCase() === adminWallet;
  const navigate = useNavigate();

  useEffect(() => {
    if (!configLoading && !hashOk) {
      navigate("/submit", { replace: true });
    }
  }, [configLoading, hashOk, navigate]);

  useEffect(() => {
    if (!hashOk) { setRankingsLoading(false); return; }
    setRankingsLoading(true);
    Promise.all([fetchRankings(), fetchFileTitles()])
      .then(([r, t]) => { setRankings(r); setTitleMap(t); })
      .finally(() => setRankingsLoading(false));
  }, [hashOk]);

  useEffect(() => {
    if (!hashOk || !isAdmin || !wallet.address) { setSubmissionsLoading(false); return; }
    setSubmissionsLoading(true);
    fetchSubmissions(wallet.address)
      .then(setSubmissions)
      .finally(() => setSubmissionsLoading(false));
  }, [hashOk, isAdmin, wallet.address]);

  if (configLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">LOADING...</div>;
  }

  if (!hashOk) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">{t("admin.redirecting")}</div>;
  }

  return (
    <div className="min-h-screen bg-background p-5">
      <div className="max-w-[1200px] mx-auto border border-primary/40 p-8 bg-card shadow-[0_0_30px_hsl(var(--primary)/0.1)]">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)]">
            🛡️ ADMIN CONSOLE
          </h1>
          <div className="flex gap-3 items-center flex-wrap">
            <LanguageToggle />
            <Link to="/submit" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
              {t("nav.submit")}
            </Link>
            <Link to="/ranking" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
              {t("nav.ranking")}
            </Link>
            <Link to="/rounds" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
              {t("nav.rounds")}
            </Link>
            <Link to="/judge" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
              {t("nav.judge")}
            </Link>
            {isAdmin && wallet.address ? (
              <span className="text-xs text-muted-foreground font-mono">
                {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
              </span>
            ) : (
              <button
                onClick={wallet.connect}
                disabled={wallet.connecting}
                className="text-xs border border-primary/40 px-3 py-1.5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {wallet.connecting ? t("admin.connecting") : t("admin.connectWallet")}
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-0 mb-6 border-b border-border">
          {(["rankings", "submissions"] as const).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`px-5 py-2.5 text-sm font-bold tracking-wider transition-colors ${
                tab === tb ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tb === "rankings" ? t("admin.rankings") : t("admin.submissions")}
            </button>
          ))}
        </div>

        {tab === "rankings" && (
          <GradeRankingPanel rankings={rankings} loading={rankingsLoading} titleMap={titleMap} />
        )}

        {tab === "submissions" && (
          isAdmin ? (
            <SubmissionsTab submissions={submissions} loading={submissionsLoading} onViewFile={setSelectedFile} adminWallet={wallet.address!} onDeleted={(id) => setSubmissions(prev => prev.filter(s => s.id !== id))} />
          ) : (
            <div className="border border-border p-8 bg-muted/20 text-center">
              <p className="text-muted-foreground mb-4">{t("admin.walletRequired")}</p>
              <button
                onClick={wallet.connect}
                disabled={wallet.connecting}
                className="bg-primary text-primary-foreground font-bold py-2 px-6 text-sm tracking-wider hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] transition-all disabled:opacity-50"
              >
                {wallet.connecting ? t("admin.connecting") : t("admin.connectBtn")}
              </button>
              {wallet.error && <p className="mt-2 text-xs text-destructive">{wallet.error}</p>}
            </div>
          )
        )}

        {tab === "submissions" && selectedFile && (
          <JudgeDetail fileName={selectedFile} onClose={() => setSelectedFile(null)} />
        )}
      </div>
    </div>
  );
}

function SubmissionsTab({
  submissions, loading, onViewFile, adminWallet, onDeleted,
}: {
  submissions: SubmissionItem[];
  loading: boolean;
  onViewFile: (f: string) => void;
  adminWallet: string;
  onDeleted: (id: string) => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string, title: string) => {
    const msg = t("admin.confirmDelete", { title });
    if (!confirm(msg)) return;
    setDeleting(id);
    try {
      await deleteSubmission(id, adminWallet);
      onDeleted(id);
    } catch (e: any) {
      alert(e.message || "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <div className="text-muted-foreground text-sm">{t("admin.loadingSub")}</div>;
  if (submissions.length === 0) return <div className="text-muted-foreground text-sm">{t("admin.noSub")}</div>;

  return (
    <div className="space-y-3">
      {submissions.map((s) => (
        <div key={s.id} className="border border-border bg-muted/20">
          <div className="flex items-center">
            <button
              onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              className="flex-1 flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0">
                <div className="font-bold text-foreground/90 truncate">{s.project_title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.one_liner}</div>
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap ml-3">
                {new Date(s.created_at).toLocaleString()}
              </div>
            </button>
            <button
              onClick={() => handleDelete(s.id, s.project_title)}
              disabled={deleting === s.id}
              className="shrink-0 mx-2 text-xs border border-destructive/40 px-2.5 py-1 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              {deleting === s.id ? t("admin.deleting") : t("admin.delete")}
            </button>
          </div>

          {expanded === s.id && (
            <div className="p-4 border-t border-border space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground text-xs">GitHub</span>
                  <a href={s.github_url} target="_blank" rel="noreferrer" className="block text-primary hover:underline truncate">{s.github_url}</a>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Demo</span>
                  <a href={s.demo_url} target="_blank" rel="noreferrer" className="block text-primary hover:underline truncate">{s.demo_url || "—"}</a>
                </div>
              </div>
              {s.why_this_chain && (
                <div>
                  <span className="text-muted-foreground text-xs">Why this chain</span>
                  <p className="text-foreground/80 text-xs mt-1">{s.why_this_chain}</p>
                </div>
              )}
              {s.md_files && s.md_files.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-xs">{t("admin.relatedDocs")} ({s.md_files.length})</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {s.md_files.map((f) => (
                      <button key={f} onClick={() => onViewFile(f)} className="text-xs border border-primary/30 px-2 py-1 text-primary hover:bg-primary/10 transition-colors">
                        📄 {f}
                      </button>
                    ))
                    }
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
