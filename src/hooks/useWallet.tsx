import { useEffect, useState } from "react";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on?: (event: string, handler: (...args: any[]) => void) => void;
      removeListener?: (event: string, handler: (...args: any[]) => void) => void;
    };
  }
}

const ADMIN_WALLET = (import.meta.env.VITE_ADMIN_WALLET || "").toLowerCase();

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setError("未检测到钱包，请安装 MetaMask 或兼容钱包。");
      return;
    }
    setError(null);
    setConnecting(true);
    try {
      const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
      const addr = accounts[0] ?? null;
      setAddress(addr);
    } catch (e: any) {
      setError(e?.message || "连接钱包失败");
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const handler = (accounts: string[]) => {
      setAddress(accounts[0] ?? null);
    };
    window.ethereum.on?.("accountsChanged", handler);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handler);
    };
  }, []);

  const isAdmin = !!address && !!ADMIN_WALLET && address.toLowerCase() === ADMIN_WALLET;

  return {
    address,
    isAdmin,
    connecting,
    error,
    connect,
  };
}

