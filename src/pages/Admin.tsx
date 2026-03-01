import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { fetchRankings, fetchSubmissions, fetchAdminConfig, type RankingItem, type SubmissionItem } from "@/lib/api";
import JudgeDetail from "@/components/JudgeDetail";
import { useWallet } from "@/hooks/useWallet";

type SortKey = "rank" | "score" | "time" | "name";
type SortDir = "asc" | "desc";

export default function Admin() {
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
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [tab, setTab] = useState<"rankings" | "submissions">("rankings");

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

  // 排名接口公开，有 hash 即可加载
  useEffect(() => {
    if (!hashOk) {
      setRankingsLoading(false);
      return;
    }
    setRankingsLoading(true);
    fetchRankings()
      .then(setRankings)
      .finally(() => setRankingsLoading(false));
  }, [hashOk]);

  // 提交列表需管理员钱包
  useEffect(() => {
    if (!hashOk || !isAdmin || !wallet.address) {
      setSubmissionsLoading(false);
      return;
    }
    setSubmissionsLoading(true);
    fetchSubmissions(wallet.address)
      .then(setSubmissions)
      .finally(() => setSubmissionsLoading(false));
  }, [hashOk, isAdmin, wallet.address]);

  const filtered = useMemo(() => {
    let items = [...rankings];
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((r) => r.file_name.toLowerCase().includes(q));
    }
    items.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "score") cmp = a.avg_score - b.avg_score;
      else if (sortKey === "time") cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      else if (sortKey === "name") cmp = a.file_name.localeCompare(b.file_name);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return items;
  }, [rankings, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === "desc" ? " ▼" : " ▲") : "";

  // Find submission for a given ranking file
  const findSubmission = (fileName: string) =>
    submissions.find((s) => s.md_files?.includes(fileName));

  if (configLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        LOADING...
      </div>
    );
  }

  if (!hashOk) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        正在跳转到首页…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-5">
      <div className="max-w-[1200px] mx-auto border border-primary/40 p-8 bg-card shadow-[0_0_30px_hsl(var(--primary)/0.1)]">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)]">
            🛡️ ADMIN CONSOLE
          </h1>
          <div className="flex gap-3 items-center flex-wrap">
            <Link to="/submit" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
              首页 / 项目提交
            </Link>
            <Link to="/ranking" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
              项目排名
            </Link>
            <Link to="/judge" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
              裁决系统
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
                {wallet.connecting ? "连接中…" : "连接钱包"}
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-6 border-b border-border">
          {(["rankings", "submissions"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-bold tracking-wider transition-colors ${
                tab === t
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "rankings" ? "📊 项目排名" : "📋 提交管理"}
            </button>
          ))}
        </div>

        {tab === "rankings" && (
          <>
            {/* Search + stats */}
            <div className="flex gap-3 mb-4 items-center">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索文件名..."
                className="field-input max-w-xs"
              />
              <span className="text-xs text-muted-foreground">
                共 {filtered.length} / {rankings.length} 项
              </span>
            </div>

            {/* Rankings table */}
            <div className="border border-border overflow-x-auto mb-4">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="p-3 text-left text-muted-foreground w-16 cursor-pointer select-none" onClick={() => toggleSort("rank")}>
                      #{sortIcon("rank")}
                    </th>
                    <th className="p-3 text-left text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("name")}>
                      文件名{sortIcon("name")}
                    </th>
                    <th className="p-3 text-left text-muted-foreground w-28 cursor-pointer select-none" onClick={() => toggleSort("score")}>
                      平均分{sortIcon("score")}
                    </th>
                    <th className="p-3 text-left text-muted-foreground w-48 cursor-pointer select-none" onClick={() => toggleSort("time")}>
                      时间{sortIcon("time")}
                    </th>
                    <th className="p-3 text-left text-muted-foreground w-24">关联项目</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingsLoading ? (
                    <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">加载中...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">无数据</td></tr>
                  ) : (
                    filtered.map((item, i) => {
                      const sub = findSubmission(item.file_name);
                      const isSelected = selectedFile === item.file_name;
                      return (
                        <tr
                          key={item.file_name}
                          onClick={() => setSelectedFile(isSelected ? null : item.file_name)}
                          className={`border-b border-border/50 cursor-pointer transition-colors ${
                            isSelected ? "bg-primary/[0.08] border-l-2 border-l-primary" : "hover:bg-muted/30"
                          }`}
                        >
                          <td className="p-3 text-muted-foreground">{i + 1}</td>
                          <td className="p-3 text-foreground/90 font-mono text-xs">{item.file_name}</td>
                          <td className={`p-3 font-bold ${
                            item.avg_score >= 80 ? "text-primary" : item.avg_score < 60 ? "text-destructive" : "text-warning"
                          }`}>
                            {item.avg_score.toFixed(1)}
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">{new Date(item.timestamp).toLocaleString()}</td>
                          <td className="p-3">
                            {sub ? (
                              <span className="text-xs text-secondary" title={sub.project_title}>✓</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Detail panel */}
            {selectedFile && (
              <JudgeDetail fileName={selectedFile} onClose={() => setSelectedFile(null)} />
            )}
          </>
        )}

        {tab === "submissions" && (
          isAdmin ? (
            <SubmissionsTab submissions={submissions} loading={submissionsLoading} onViewFile={setSelectedFile} />
          ) : (
            <div className="border border-border p-8 bg-muted/20 text-center">
              <p className="text-muted-foreground mb-4">查看提交列表需连接管理员钱包</p>
              <button
                onClick={wallet.connect}
                disabled={wallet.connecting}
                className="bg-primary text-primary-foreground font-bold py-2 px-6 text-sm tracking-wider hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] transition-all disabled:opacity-50"
              >
                {wallet.connecting ? "连接中…" : "连接钱包 (CONNECT WALLET)"}
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
  submissions,
  loading,
  onViewFile,
}: {
  submissions: SubmissionItem[];
  loading: boolean;
  onViewFile: (f: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) return <div className="text-muted-foreground text-sm">加载中...</div>;
  if (submissions.length === 0) return <div className="text-muted-foreground text-sm">暂无提交</div>;

  return (
    <div className="space-y-3">
      {submissions.map((s) => (
        <div key={s.id} className="border border-border bg-muted/20">
          <button
            onClick={() => setExpanded(expanded === s.id ? null : s.id)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
          >
            <div className="min-w-0">
              <div className="font-bold text-foreground/90 truncate">{s.project_title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.one_liner}</div>
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap ml-3">
              {new Date(s.created_at).toLocaleString()}
            </div>
          </button>

          {expanded === s.id && (
            <div className="p-4 border-t border-border space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground text-xs">GitHub</span>
                  <a href={s.github_url} target="_blank" rel="noreferrer" className="block text-primary hover:underline truncate">
                    {s.github_url}
                  </a>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Demo</span>
                  <a href={s.demo_url} target="_blank" rel="noreferrer" className="block text-primary hover:underline truncate">
                    {s.demo_url || "—"}
                  </a>
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
                  <span className="text-muted-foreground text-xs">关联文档 ({s.md_files.length})</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {s.md_files.map((f) => (
                      <button
                        key={f}
                        onClick={() => onViewFile(f)}
                        className="text-xs border border-primary/30 px-2 py-1 text-primary hover:bg-primary/10 transition-colors"
                      >
                        📄 {f}
                      </button>
                    ))}
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
