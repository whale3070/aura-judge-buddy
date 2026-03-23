# Aura Judgement System

**Versioned, multi-model AI review + auditable rankings for hackathons and agent-era developer workflows.**

Built for the [**Identity AI Hackathon**](https://identityhub.app/contests/ai-hackathon) (**$20,000 total prize pool**) | Track: **Agent Infrastructure ($10,000)**

Focus: Tooling and primitives for next-gen AI applications on TON — including wallet-aware admin flows, reproducible scoring pipelines, developer-facing APIs, and fair large-scale evaluation coordination primitives.

---

## 📌 Overview

**Aura Judgement System** is a full-process, automated intelligent evaluation engine designed for hackathons, tech competitions and developer project audits. Powered by **Golang + layered multi-model AI**, it replaces inefficient manual preliminary review with quantitative, traceable and objective scoring, helping judges focus on high-value decisions while uncovering high-quality projects that are often overlooked.

**Core Slogan**: Let AI handle bulk document review and scoring, free judges from repetitive work, and never miss potential dark horse projects.

---

## 🌐 Public Homepage & Live Demo

- Official Homepage: [http://198.55.109.102:3000/](http://198.55.109.102:3000/) (supports Chinese/English toggle, built-in case study of manual vs AI review comparison)

- Live Ranking (Round AI1): [http://198.55.109.102:3000/ranking?round_id=AI1](http://198.55.109.102:3000/ranking?round_id=AI1) (5D radar chart, S/A/B/C/D tier display, Markdown export)

- Admin Console (Round AI1): [http://198.55.109.102:3000/?h=vngLjNR0WeHzV57ubom8&round_id=AI1](http://198.55.109.102:3000/?h=vngLjNR0WeHzV57ubom8&amp;round_id=AI1) (requires admin wallet verification)

---

## 🎯 Core Goals

1. **Boost Efficiency**: Automatically screen and score hundreds of hackathon projects, allowing judges to focus on top-tier and disputed entries only

2. **Enhance Objectivity**: Multi-dimensional quantification + cross-model scoring, eliminating human bias, fatigue scoring and unfair factors, with fully explainable results

3. **Discover Dark Horses**: Identify technically superior projects with weak presentation through document and code analysis, avoiding oversight by manual review

4. **Control Costs**: Layered AI architecture (low-cost models for preliminary screening + high-performance models for in-depth review) to optimize overall evaluation costs

5. **Ensure Fairness & Transparency**: Versioned open rules, full-process traceability, and auditable scoring reports

---

## 🔄 Full Project Evaluation Flow

After project submission (online form + optional documents + GitHub repo link), the system runs fully automatically without manual preliminary intervention:

1. **Auto Repository Parsing**: Clone GitHub repos and automatically parse README and other markdown documents

2. **Multi-Model AI Review**: Conduct multi-dimensional scoring (innovation, technical implementation, commercial value, user experience, feasibility, etc.) via parallel or layered AI models (e.g., DeepSeek)

3. **Generate Professional Reports**: Output detailed review comments and 0-100 quantitative scores, with automatic average calculation across models

4. **Public Ranking Display**: Projects are ranked by comprehensive scores, with tiered classification and visual radar charts

5. **Attestation & Traceability**: Scoring results are saved as structured JSON files, supporting later review, export and final judge reference

---

## 🧩 Core Features

### Frontend (aura-judge-buddy | React + Vite + TypeScript)

- **Landing Page**: Contest and round information display, bilingual language switch

- **Project Submission**: Standardized submission flow aligned with backend API, supporting document upload and GitHub link binding

- **Judge Panel**: Trigger AI audits, view single-file review results, check rule versions

- **Admin Console**: Manage submissions and rounds, upload/activate YAML rules, S/A/B tier duel comparison, GitHub metadata analysis

- **Ranking Page**: Multi-dimensional filtering, tier grouping, 5D radar chart visualization, arena duel rationale display, Markdown report export

- **i18n Support**: Full Chinese-English bilingual adaptation for core pages and functions

### Backend (Golang API)

- RESTful API: Project audit, ranking query, result management, rule configuration

- Versioned YAML Rule Engine: Rules are traceable and reproducible, no black-box evaluation

- Multi-model Audit & Result Persistence: Structured JSON artifacts for replay and dispute handling

- Duel & Bracket Management: Pairwise comparison and server-side snapshot synchronization

- Wallet-Aware Admin Auth: X-Admin-Wallet header verification, adapted to TON ecosystem wallet-native workflows

---

## 🏗️ System Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  React + Vite + TypeScript + shadcn/ui + Tailwind CSS        │
│  (Ranking, Admin, Submission, Judge, Rule & Duel Modules)   │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP API Requests
┌───────────────────────────▼─────────────────────────────────┐
│                      Aura Go Backend                         │
│  (YAML Rule Management, AI Audit, Ranking, Duel, Storage)   │
│  + Persistent Artifacts: Judge Results, Submissions, Snapshots│
└─────────────────────────────────────────────────────────────┘
```

---

## 💻 Local Development

### Prerequisites

- Node.js 18+ & npm

- Running Aura Go backend service

### Startup Commands

```bash
git clone <this-repo-url>
cd aura-judge-buddy
npm install
npm run dev
```

### Environment Configuration (.env.local)

```bash
VITE_API_BASE=http://127.0.0.1:8888
# Optional default round ID
# VITE_ROUND_ID=your_round_id
```

### Production Build

```bash
npm run build
# Production files output to dist/ directory
```

---

## 📂 Repository Structure

- `src/pages/`: Core page components (Admin, Ranking, Submit, Judge, etc.)

- `src/components/`: Reusable UI modules (tier display, radar chart, duel panel, etc.)

- `src/lib/`: API client, i18n, data storage, export tools

- Go Backend: Located in the same monorepo, responsible for core logic and data persistence

---

## 🔗 Agent Infrastructure Alignment

As a core project of the Agent Infrastructure track, Aura provides critical evaluation infrastructure for AI agent ecosystems:

- **Consistent Evaluation Standards**: Versioned YAML rules ensure unified scoring logic across models and projects

- **Developer-Friendly Tools**: Open API, reproducible artifacts, standardized data output

- **Coordination Capabilities**: Multi-model result aggregation, public ranking, duel mechanism for project comparison

- **TON Ecosystem Adaptation**: Wallet-aware admin permissions, fully adapted to TON chain developer workflows

---

## 📄 Built-in Case Study

The official homepage includes a long-form analysis article: **从昙花一现到长效落地：Aura 系统重构黑客松项目评估逻辑——基于实测项目数据的对比分析**

This article compares manual review and Aura AI review based on real hackathon data, proving that the system can effectively identify high-value projects with strong落地 feasibility and commercial potential, which are often ignored by manual judges focusing on presentation and creativity.

---

## 📝 License & Acknowledgments

This project uses open-source frameworks including Vite, TypeScript, React, shadcn/ui and Tailwind CSS. Deployment and demo URLs are customized for the Identity AI Hackathon.

---

# 中文版本概要

## 阿乌拉裁决系统

**可版本化、多模型AI评审 + 可审计排名系统，专为黑客松与智能体时代开发者工作流设计**

为[**Identity AI黑客松**](https://identityhub.app/contests/ai-hackathon)打造（总奖金2万美元）| 参赛赛道：**智能体基础设施（1万美元）**

核心定位：为TON生态下一代AI应用提供工具与基础组件，包括钱包感知管理流程、可复现评分流水线、开发者API、公平大规模评审协调基础组件。

### 核心价值

阿乌拉裁决系统是面向黑客松、科创大赛的全流程自动化评审引擎，采用**Golang + 分层多模型AI**架构，实现项目材料自动量化打分、多模型交叉评审、排名与数据存证，解决传统人工评审效率低、主观性强、遗漏优质项目的痛点，让评委专注于核心决策。

### 核心功能

- 自动拉取解析GitHub仓库，全自动初审打分

- 五维评分可视化，S/A/B/C/D分级排名，公开可查

- 规则版本化可追溯，评审结果可存证、可导出

- 支持中英双语，适配TON生态钱包权限管理

- 内置人工与AI评审对比案例，直观体现系统优势
> （注：文档部分内容可能由 AI 生成）
