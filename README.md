# Aura Judgement System

**Versioned, multi-model AI review + auditable rankings for hackathons and agent-era developer workflows.**

Built for the [**Identity AI Hackathon**](https://identityhub.app/contests/ai-hackathon) (**$20,000** pool) — track: **Agent Infrastructure** (**$10,000**): tooling and primitives for the next generation of AI applications on TON (wallet-aware admin flows, reproducible scoring pipelines, developer-facing APIs, and coordination primitives for fair, large-scale evaluation).

---

## Why this matters (Agent Infrastructure angle)

Agent ecosystems need **shared ground truth**: the same inputs, the same published rules, and comparable scores across many projects and models. Aura provides:

- A **YAML rules engine** (versioned, downloadable, activatable per round) so “what the AI was told to judge” is not a black box.
- **Multi-model audits** with structured outputs and persisted **judge-result artifacts** (JSON) for replay and dispute handling.
- **Public ranking surfaces** (tier bands, optional arena duels) so teams and sponsors see outcomes under a **single transparent pipeline** — infrastructure judges can inspect end-to-end.

This is **infrastructure for evaluation and coordination**, not a one-off chat demo.

---

## Live demo (AI1 round)

| Surface | URL | Notes |
|--------|-----|--------|
| **Public rankings** | [Ranking · `round_id=AI1`](http://198.55.109.102:3000/ranking?round_id=AI1) | Five-dimension radar, S/A/B/C/D/? tiers, optional duel notes, Markdown export. |
| **Organizer console** | [Admin · `round_id=AI1`](http://198.55.109.102:3000/?h=vngLjNR0WeHzV57ubom8&round_id=AI1) | Requires admin wallet + access parameter `h` as deployed; rotate `h` for production. |

---

## What we shipped (product map)

### Frontend (`aura-judge-buddy`)

- **Landing** — round-aware entry and contest context.
- **Submit** — project submission flow aligned with backend `POST /api/submit`.
- **Judge** — trigger audits, view per-file results, rule version context.
- **Admin** — submissions, rounds, YAML rules upload/activate, judges panel, **S/A/B pool duels** (manual or auto bracket), GitHub metadata helpers.
- **Ranking** — rule-version filter, tier grouping (collapsible), per-project **five-dimension radar** (0–20 per dimension, averaged across models), **arena duel rationale** when a bracket snapshot exists, UTF-8 **Markdown export** for reports.
- **i18n** — Chinese / English toggles on key flows.

### Backend (Aura Go API, served beside the SPA)

Representative routes (see `aura/main.go`):

- `POST /api/audit` — run AI audit against stored README/content and save structured results.
- `GET /api/ranking`, `GET /api/judge-result`, `GET /api/results` — aggregate and per-file outcomes.
- `GET/POST` rules — ` /api/rules/active`, `/api/rules/versions`, upload & activate (admin).
- `POST /api/duel` (admin) — pairwise five-dimension duel between two submissions.
- `GET/PUT/DELETE /api/duel-bracket-snapshot` — persist bracket snapshots under `submissions/<round_id>/.aura_duel_bracket_snapshot.json` so **public ranking can sync** without the organizer’s browser.
- `POST /api/submit`, round & submission management, file content/GitHub URL helpers.

**Admin authentication** uses configured admin wallet header (`X-Admin-Wallet`) where enforced — aligns with **wallet-native** operator workflows on TON-era stacks.

---

## Architecture (high level)

```text
┌─────────────────────────────────────────────────────────────┐
│  React + Vite + TypeScript + shadcn/ui + Tailwind           │
│  (ranking, admin, submit, judge, rules, duels)              │
└───────────────────────────┬─────────────────────────────────┘
                            │  HTTP (VITE_API_BASE → Aura Go API
                            │  or Supabase Edge proxy)
┌───────────────────────────▼─────────────────────────────────┐
│  Aura Go service — YAML rules, audits, ranking, duels, files  │
│  + on-disk artifacts (judge-result, submissions, snapshots)  │
└─────────────────────────────────────────────────────────────┘
```

---

## Local development

**Prerequisites:** Node.js 18+, npm, and a running Aura API (or `VITE_API_BASE` pointing at your instance).

```bash
git clone <this-repo-url>
cd aura-judge-buddy
npm install
npm run dev
```

Configure API origin (critical for self-hosted backend):

```bash
# .env.local example
VITE_API_BASE=http://127.0.0.1:8888
# Optional default round when URL omits round_id
# VITE_ROUND_ID=your_round
```

```bash
npm run build   # production bundle → dist/
```

---

## Repository layout

| Path | Role |
|------|------|
| `src/pages/` | Routed screens (Admin, Ranking, Submit, Judge, …). |
| `src/components/` | UI panels (tiers, duels, radar charts, rule bars, …). |
| `src/lib/` | API client, i18n, duel/bracket storage & remote sync, markdown export. |
| `../` (Go backend, same monorepo as `aura-judge-buddy`) | `main.go`, rules persistence, duel snapshot files per `round_id`. |

---

## Fit to “Agent Infrastructure” (judging rubric hooks)

- **Developer tools** — Versioned YAML rules, documented HTTP API, reproducible JSON judge artifacts.
- **Coordination** — Multi-model aggregation, tiering, optional **arena bracket** with server-side snapshot for consistent public display.
- **Wallet-aware ops** — Admin flows gated by wallet header / deployment policy, suitable for TON-native operator models.
- **Transparency** — Same `round_id` links organizer console and public leaderboard; exportable Markdown for post-event reporting.

---

## 中文摘要（评委速览）

**Aura 裁决系统** 面向黑客松与大规模项目评审：后端 **Go** 提供可版本化的 **YAML 规则**、**多模型 AI 审计**、结构化 **存证 JSON**；前端 **React + Vite** 提供提交、管理台、**五维雷达与 S/A/B/C/D 分档排名**、可选 **擂台对决**（结果可同步服务端供公开排名页读取）。本项目参赛语境为 [**Identity AI Hackathon**](https://identityhub.app/contests/ai-hackathon) 的 **Agent Infrastructure** 赛道（TON 生态 AI 代理基础设施：可审计评审流水线、协调与公开榜单、钱包相关管理接口）。**演示**：[管理页](http://198.55.109.102:3000/?h=vngLjNR0WeHzV57ubom8&round_id=AI1)、[本轮排名](http://198.55.109.102:3000/ranking?round_id=AI1)。

---

## License / attribution

Project scaffold and UI stack include **Vite**, **TypeScript**, **React**, **shadcn/ui**, and **Tailwind CSS**. Hackathon positioning and deployment URLs are specific to the Identity AI Hackathon submission described above.
