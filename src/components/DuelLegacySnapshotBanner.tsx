import { useEffect, useMemo, useState } from "react";
import {
  DUEL_BRACKET_STORAGE_KEY,
  loadDuelBracketSnapshot,
  clearDuelBracketSnapshot,
  isLegacyUnscopedBracketSnapshot,
} from "@/lib/duelBracketStorage";
import { useI18n } from "@/lib/i18n";
import { getAdminWallet } from "@/lib/apiClient";
import { deleteDuelBracketSnapshotFromServer } from "@/lib/duelBracketRemote";
import { Button } from "@/components/ui/button";

interface Props {
  /** 当前页轮次（与 ?round_id= 一致）；为空则不提示 */
  expectedRoundId: string;
  /** 多赛道时与 ?track= 一致；用于分桶读存证 */
  expectedTrackId?: string;
}

export default function DuelLegacySnapshotBanner({ expectedRoundId, expectedTrackId }: Props) {
  const { t } = useI18n();
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const bump = () => setEpoch((e) => e + 1);
    window.addEventListener("aura-duel-snapshot-updated", bump);
    const onStorage = (ev: StorageEvent) => {
      if (ev.key?.startsWith(DUEL_BRACKET_STORAGE_KEY)) bump();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("aura-duel-snapshot-updated", bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const want = expectedRoundId.trim();
  const snap = useMemo(() => {
    void epoch;
    const tid = (expectedTrackId ?? "").trim();
    return loadDuelBracketSnapshot(want, tid || undefined);
  }, [want, expectedTrackId, epoch]);
  const visible = want !== "" && isLegacyUnscopedBracketSnapshot(snap);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-3 rounded-md border border-amber-500/45 bg-amber-500/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-xs text-amber-100/90 leading-relaxed pr-2">
        {t("ranking.unscopedBracketWarn", { round: want })}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 border-amber-500/60 text-amber-100 hover:bg-amber-500/20 hover:text-amber-50"
        onClick={() => {
          const tid = (expectedTrackId ?? "").trim();
          clearDuelBracketSnapshot(want, tid || undefined);
          const w = getAdminWallet()?.trim();
          if (w) void deleteDuelBracketSnapshotFromServer(w, want, tid || undefined).catch(() => {});
        }}
      >
        {t("ranking.unscopedBracketClear")}
      </Button>
    </div>
  );
}
