import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

function renderFatal(message: string) {
  const el = document.getElementById("root");
  if (!el) return;
  el.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050505;color:#b8ffb8;padding:24px;font-family:monospace;">
      <div style="max-width:920px;border:1px solid #2a2a2a;padding:16px;white-space:pre-wrap;line-height:1.5;">
        <div style="font-weight:700;color:#7CFF7C;margin-bottom:8px;">AURA FRONTEND BOOTSTRAP ERROR</div>
        <div>${message}</div>
        <div style="margin-top:10px;color:#9a9a9a;">Try hard refresh (Ctrl+F5). If this persists, send this message to developer.</div>
      </div>
    </div>
  `;
}

window.addEventListener("error", (ev) => {
  if (!ev?.message) return;
  renderFatal(`window.error: ${ev.message}`);
});

window.addEventListener("unhandledrejection", (ev) => {
  const reason = (ev as PromiseRejectionEvent).reason;
  const msg = typeof reason === "string" ? reason : reason?.message || JSON.stringify(reason);
  renderFatal(`unhandledrejection: ${msg}`);
});

try {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("missing #root");
  createRoot(rootEl).render(<App />);
  // If app fails before first paint and leaves the root empty, show a visible hint instead of a black screen.
  setTimeout(() => {
    if ((rootEl.innerHTML || "").trim() === "") {
      renderFatal("React app did not render any visible content.");
    }
  }, 3000);
} catch (e: any) {
  renderFatal(e?.message || String(e));
}
