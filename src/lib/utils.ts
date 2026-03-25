import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** HTTP 等非安全上下文中无 crypto.randomUUID；批量评审等 UI 需可用 ID。 */
export function randomUUIDCompat(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (ch) =>
    (Number(ch) ^ (Math.random() * 16) >> (Number(ch) / 4)).toString(16)
  );
}
