# Aura Judgement System

**Versioned, multi-model AI review + auditable rankings for hackathons and agent-era developer workflows.**

Built for the [**Identity AI Hackathon**](https://identityhub.app/contests/ai-hackathon) (**$20,000** pool) — track: **Agent Infrastructure** (**$10,000**): tooling and primitives for the next generation of AI applications on TON (wallet-aware admin flows, reproducible scoring pipelines, developer-facing APIs, and coordination primitives for fair, large-scale evaluation).

---

## Public homepage — [http://198.55.109.102:3000/](http://198.55.109.102:3000/)

The live `/` route shows the marketing narrative below (plus a language toggle and an optional long-form case-study article at the bottom). The **static shell** shipped with the production build is `dist/index.html` (hashed JS/CSS filenames change each `npm run build`).

### `dist/index.html` (production entry)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Aura Judgement System</title>
    <meta name="description" content="Aura — hackathon project pre-review and multi-model audit with versioned YAML rules." />
    <meta name="author" content="Aura" />

    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/favicon-32.png" />

    <meta property="og:type" content="website" />
    <meta property="og:title" content="Aura Judgement System" />
    <meta property="og:description" content="Hackathon pre-review, versioned rules, and auditable AI scoring." />

    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Aura Judgement System" />
    <meta name="twitter:description" content="Hackathon pre-review, versioned rules, and auditable AI scoring." />
    <script type="module" crossorigin src="/assets/index-zMqoGA3b.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-ShKo0-3Z.css">
  </head>

  <body>
    <div id="root"></div>
  </body>
</html>
```

*(After rebuild, replace the `index-*.js` / `index-*.css` names with the files emitted under `dist/assets/`.)*

### Landing copy (English — same text as the SPA)

**⚖️ Aura Judgment System**  
*Aura Judgement System — Hackathon Project Scoring · Full-Process AI Judging Engine*

**What is it**  
Aura Judgment System is a full-process automated review system for hackathons and tech competitions. Built with "Golang + Layered AI": automatic quantitative scoring, multi-model review, ranking & attestation. Fully automated from submission to scoring — efficient, cost-effective, and traceable.

*In one sentence: AI reads all project docs and scores them, letting judges focus on decisions that truly need human judgment, never missing hidden gems.*

**Goals**

1. Boost review efficiency: Hundreds of projects per hackathon, auto-screened and scored, judges focus on top & disputed entries.
2. More objective scoring: Multi-dimensional quantification + cross-model scoring, reducing bias and fatigue, more explainable results.
3. Discover dark horses: Technically strong but poorly presented projects are identified through document & data analysis.
4. Reduce costs: Layered AI (low-cost models for screening + premium models for deep review), total cost stays manageable.
5. Fair & transparent: Open rules, traceable process, scores & reports are attestable.

**What happens after submission**  
After submitting your project online (form + optional docs + GitHub link), the system automatically completes:

1. **Auto-clone repo:** If a GitHub link is provided, the system clones and parses `.md` documents.
2. **AI auto-review:** Multi-dimensional scoring (innovation, feasibility, completeness, etc.) with multi-model (e.g. DeepSeek) parallel/layered review.
3. **Generate review reports:** Each document gets detailed comments & a 0–100 score, with auto-calculated averages.
4. **Join rankings:** Your project enters the leaderboard, sorted by score among all reviewed projects, publicly viewable.
5. **Attestation & tracing:** Scores are saved as JSON attestations for later review, export, or roadshow/final review reference.

*In short: Submit → Auto-parse & review → Get scores, reports & rankings, no manual initial review needed.*

### 首页文案（中文 — 与线上切换语言一致）

**⚖️ 阿乌拉裁决系统**  
*Aura Judgement System — 黑客松项目量化评分 · 全流程智能裁决引擎*

**系统是什么**  
阿乌拉裁决系统是一套面向黑客松 / 科创大赛的全流程自动化评审系统。用「Golang + 分层 AI」实现：项目材料自动量化打分、多模型评审、排名与存证，从提交到出分全自动，效率提升、成本可控、结果可追溯。

*一句话：用 AI 自动看完项目文档并打分，让评委把时间花在真正需要人工判断的地方，绝不漏掉优质黑马项目。*

**目标是什么**

1. 提升评审效率：一场黑客松几百个项目，系统自动初筛与打分，评委聚焦高分与争议项。
2. 评分更客观：多维度量化 + 多模型交叉评分，减少人情分、疲劳分，结果更可解释。
3. 发现黑马项目：技术强但表达弱的项目，通过文档与数据指标被系统识别出来。
4. 降低成本：分层 AI（低成本模型初筛 + 高价值模型深度评审），总成本可控。
5. 公平透明：规则公开、过程可追溯，评分与报告可存证。

**提交项目后会给出什么**  
当你通过本站在线提交项目（填写表单 + 可选上传文档 + GitHub 链接）后，系统会自动完成以下流程：

1. 自动拉取仓库：若填写了 GitHub 链接，系统会 clone 仓库并解析其中的 .md 文档。
2. AI 自动评审：对项目文档进行多维度打分（技术创新性、可行性、完成度等），支持多模型（如 DeepSeek 等）并行或分层评审。
3. 生成评审报告：每个文档得到详细评语与 0–100 分，并自动计算平均分。
4. 参与排名：你的项目会进入「项目排名」榜单，与其它已评审项目按分数排序，公开可查。
5. 存证与追溯：评分结果以 JSON 存证保存，可后续复核、导出或用于路演/终审参考。

*简而言之：提交 → 自动解析与评审 → 得到分数、报告与排名，全程无需人工介入初审。*

### Long-form article on the same page

Below the main card, the production homepage can render **「从昙花一现到长效落地：Aura 系统重构黑客松项目评估逻辑——基于实测项目数据的对比分析」** (human vs Aura five-dimension comparison on a real hackathon sample). Source: `src/components/PolkadotHackathonArticle.tsx`.

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
