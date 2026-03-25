import { API_BASE, withRoundQuery } from "@/lib/apiClient";
import {
  duelBracketLocalStorageKey,
  loadDuelBracketSnapshot,
  type DuelBracketSnapshot,
} from "@/lib/duelBracketStorage";

function notifyDuelSnapshotUpdated(): void {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("aura-duel-snapshot-updated"));
    }
  } catch {
    /* ignore */
  }
}

function withTrackOnPath(path: string, trackId?: string | null): string {
  const t = (trackId ?? "").trim();
  if (!t) return path;
  return `${path}${path.includes("?") ? "&" : "?"}track_id=${encodeURIComponent(t)}`;
}

export async function fetchDuelBracketSnapshotFromServer(
  roundId: string,
  trackId?: string | null
): Promise<DuelBracketSnapshot | null> {
  const rid = roundId.trim();
  if (!rid) return null;
  let res: Response;
  try {
    const path = withTrackOnPath(withRoundQuery("/api/duel-bracket-snapshot", rid), trackId);
    res = await fetch(`${API_BASE}${path}`);
  } catch {
    return null;
  }
  if (res.status === 404) return null;
  if (!res.ok) return null;
  try {
    const data = (await res.json()) as DuelBracketSnapshot;
    if (!data?.poolTier || !Array.isArray(data.matches) || !Array.isArray(data.rankedFileNames)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/** 若服务端快照更新则不覆盖较新的本地数据；写入后派发 aura-duel-snapshot-updated */
export async function syncDuelBracketFromServer(roundId: string, trackId?: string | null): Promise<void> {
  const rid = roundId.trim();
  if (!rid) return;
  const tid = (trackId ?? "").trim();
  const server = await fetchDuelBracketSnapshotFromServer(rid, tid || undefined);
  if (!server) return;
  const local = loadDuelBracketSnapshot(rid, tid || undefined);
  const serverT = Date.parse(server.savedAt || "") || 0;
  const localT = local ? Date.parse(local.savedAt || "") || 0 : 0;
  if (!local || serverT >= localT) {
    try {
      const st = (server.trackId ?? "").trim() || tid;
      const key = duelBracketLocalStorageKey(rid, st || null);
      localStorage.setItem(key, JSON.stringify(server));
      notifyDuelSnapshotUpdated();
    } catch {
      /* quota / private mode */
    }
  }
}

export async function putDuelBracketSnapshotToServer(
  adminWallet: string,
  roundId: string,
  snap: DuelBracketSnapshot
): Promise<void> {
  const rid = roundId.trim();
  if (!rid) throw new Error("round_id required");
  const path = withTrackOnPath(withRoundQuery("/api/duel-bracket-snapshot", rid), snap.trackId ?? null);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Wallet": adminWallet,
    },
    body: JSON.stringify(snap),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "写入服务端擂台存证失败");
  }
}

export async function deleteDuelBracketSnapshotFromServer(
  adminWallet: string,
  roundId: string,
  trackId?: string | null
): Promise<void> {
  const rid = roundId.trim();
  if (!rid) return;
  const path = withTrackOnPath(withRoundQuery("/api/duel-bracket-snapshot", rid), trackId);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { "X-Admin-Wallet": adminWallet },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "删除服务端擂台存证失败");
  }
}
