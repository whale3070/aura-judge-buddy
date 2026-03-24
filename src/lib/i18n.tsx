import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type Lang = "zh" | "en";

const translations = {
  // Landing page
  "landing.title": { zh: "⚖️ 阿乌拉裁决系统", en: "⚖️ Aura Judgment System" },
  "landing.subtitle": { zh: "Aura Judgement System — 黑客松项目量化评分 · 全流程智能裁决引擎", en: "Aura Judgement System — Hackathon Project Scoring · Full-Process AI Judging Engine" },
  "landing.whatIs": { zh: "系统是什么", en: "What is it" },
  "landing.whatIsDesc": {
    zh: "阿乌拉裁决系统是一套面向黑客松 / 科创大赛的全流程自动化评审系统。用「Golang + 分层 AI」实现：项目材料自动量化打分、多模型评审、排名与存证，从提交到出分全自动，效率提升、成本可控、结果可追溯。",
    en: "Aura Judgment System is a full-process automated review system for hackathons and tech competitions. Built with \"Golang + Layered AI\": automatic quantitative scoring, multi-model review, ranking & attestation. Fully automated from submission to scoring — efficient, cost-effective, and traceable.",
  },
  "landing.whatIsNote": {
    zh: "一句话：用 AI 自动看完项目文档并打分，让评委把时间花在真正需要人工判断的地方，绝不漏掉优质黑马项目。",
    en: "In one sentence: AI reads all project docs and scores them, letting judges focus on decisions that truly need human judgment, never missing hidden gems.",
  },
  "landing.goals": { zh: "目标是什么", en: "Goals" },
  "landing.goal1": { zh: "提升评审效率：一场黑客松几百个项目，系统自动初筛与打分，评委聚焦高分与争议项。", en: "Boost review efficiency: Hundreds of projects per hackathon, auto-screened and scored, judges focus on top & disputed entries." },
  "landing.goal2": { zh: "评分更客观：多维度量化 + 多模型交叉评分，减少人情分、疲劳分，结果更可解释。", en: "More objective scoring: Multi-dimensional quantification + cross-model scoring, reducing bias and fatigue, more explainable results." },
  "landing.goal3": { zh: "发现黑马项目：技术强但表达弱的项目，通过文档与数据指标被系统识别出来。", en: "Discover dark horses: Technically strong but poorly presented projects are identified through document & data analysis." },
  "landing.goal4": { zh: "降低成本：分层 AI（低成本模型初筛 + 高价值模型深度评审），总成本可控。", en: "Reduce costs: Layered AI (low-cost models for screening + premium models for deep review), total cost stays manageable." },
  "landing.goal5": { zh: "公平透明：规则公开、过程可追溯，评分与报告可存证。", en: "Fair & transparent: Open rules, traceable process, scores & reports are attestable." },
  "landing.afterSubmit": { zh: "提交项目后会给出什么", en: "What happens after submission" },
  "landing.afterSubmitDesc": { zh: "当你通过本站在线提交项目（填写表单 + 可选上传文档 + GitHub 链接）后，系统会自动完成以下流程：", en: "After submitting your project online (form + optional docs + GitHub link), the system automatically completes:" },
  "landing.step1": { zh: "自动拉取仓库：若填写了 GitHub 链接，系统会 clone 仓库并解析其中的 .md 文档。", en: "Auto-clone repo: If a GitHub link is provided, the system clones and parses .md documents." },
  "landing.step2": { zh: "AI 自动评审：对项目文档进行多维度打分（技术创新性、可行性、完成度等），支持多模型（如 DeepSeek 等）并行或分层评审。", en: "AI auto-review: Multi-dimensional scoring (innovation, feasibility, completeness, etc.) with multi-model (e.g. DeepSeek) parallel/layered review." },
  "landing.step3": { zh: "生成评审报告：每个文档得到详细评语与 0–100 分，并自动计算平均分。", en: "Generate review reports: Each document gets detailed comments & a 0–100 score, with auto-calculated averages." },
  "landing.step4": { zh: "参与排名：你的项目会进入「项目排名」榜单，与其它已评审项目按分数排序，公开可查。", en: "Join rankings: Your project enters the leaderboard, sorted by score among all reviewed projects, publicly viewable." },
  "landing.step5": { zh: "存证与追溯：评分结果以 JSON 存证保存，可后续复核、导出或用于路演/终审参考。", en: "Attestation & tracing: Scores are saved as JSON attestations for later review, export, or roadshow/final review reference." },
  "landing.afterSubmitNote": { zh: "简而言之：提交 → 自动解析与评审 → 得到分数、报告与排名，全程无需人工介入初审。", en: "In short: Submit → Auto-parse & review → Get scores, reports & rankings, no manual initial review needed." },

  // Common nav
  "nav.home": { zh: "← 首页 (HOME)", en: "← Home" },
  "nav.submit": { zh: "← 首页 / 项目提交", en: "← Home / Submit" },
  "nav.ranking": { zh: "项目排名", en: "Rankings" },
  "nav.judge": { zh: "裁决系统", en: "Judgment" },
  "nav.admin": { zh: "管理后台", en: "Admin" },
  "nav.submitProject": { zh: "📋 项目提交 / 首页 (HOME) →", en: "📋 Submit / Home →" },
  "nav.adminPanel": { zh: "🛡️ 管理后台 (ADMIN) →", en: "🛡️ Admin Panel →" },

  // Submit page
  "submit.title": { zh: "📋 PROJECT SUBMISSION", en: "📋 PROJECT SUBMISSION" },
  "submit.subtitle": { zh: "仅需填写项目名称与 GitHub 仓库链接；其余字段与文件均可选填", en: "Only project title and GitHub repo URL are required; other fields and uploads are optional" },
  "submit.roundBanner": { zh: "当前提交归属轮次：{id}", en: "Submitting to round: {id}" },
  "submit.section1": { zh: "必填信息", en: "Required" },
  "submit.projectTitle": { zh: "项目名称 *", en: "Project Title *" },
  "submit.projectTitlePlaceholder": { zh: "例：Aura Judging System", en: "e.g. Aura Judging System" },
  "submit.oneLiner": { zh: "一句话简介（选填）", en: "One-liner (optional)" },
  "submit.oneLinerPlaceholder": { zh: "用一句话描述你的项目", en: "Describe your project in one sentence" },
  "submit.problem": { zh: "解决的问题（选填）", en: "Problem solved (optional)" },
  "submit.problemPlaceholder": { zh: "你的项目解决了什么问题？", en: "What problem does your project solve?" },
  "submit.solution": { zh: "解决方案（选填）", en: "Solution (optional)" },
  "submit.solutionPlaceholder": { zh: "你的解决方案是什么？", en: "What is your solution?" },
  "submit.section2": { zh: "选填信息", en: "Optional" },
  "submit.githubUrl": { zh: "GitHub 仓库链接 *", en: "GitHub Repo URL *" },
  "submit.demoUrl": { zh: "Demo / 演示链接（选填）", en: "Demo URL (optional)" },
  "submit.docsText": { zh: "补充文本（选填）", en: "Additional text (optional)" },
  "submit.docsTextPlaceholder": { zh: "可在此粘贴项目文档、白皮书等文本内容...", en: "Paste project docs, whitepaper, etc." },
  "submit.section3": { zh: "文件上传（选填）", en: "File upload (optional)" },
  "submit.fileNote": { zh: "（PDF 仅做存储，不保证全解析）", en: "(PDF stored only, full parsing not guaranteed)" },
  "submit.uploadBtn": { zh: "+ 点击选择文件 / Click to upload", en: "+ Click to upload files" },
  "submit.submitBtn": { zh: "提交项目 (SUBMIT PROJECT)", en: "Submit Project" },
  "submit.submitting": { zh: "▶ 提交中...", en: "▶ Submitting..." },
  "submit.successMsg": { zh: "提交成功！AI 评审大约需要", en: "Submitted! AI review takes about" },
  "submit.successMin": { zh: "10 分钟", en: "10 minutes" },
  "submit.successWait": { zh: "处理，请耐心等待后再查看评分结果。", en: "to process. Please wait before checking results." },
  "submit.viewMyProject": { zh: "查看我的项目评分与排名 →", en: "View my project scores & rankings →" },
  "submit.fileFilterWarn": { zh: "部分文件格式不支持，已过滤。仅支持 .md .txt .html .pdf", en: "Some file types not supported and were filtered. Only .md .txt .html .pdf accepted." },
  "submit.validateTitle": { zh: "请填写项目名称", en: "Project title is required" },
  "submit.validateOneLiner": { zh: "请填写项目简介", en: "One-liner is required" },
  "submit.validateOneLinerLen": { zh: "项目简介不能超过200字", en: "One-liner cannot exceed 200 characters" },
  "submit.validateProblem": { zh: "请填写要解决的问题", en: "Problem statement is required" },
  "submit.validateSolution": { zh: "请填写解决方案", en: "Solution is required" },
  "submit.validateGithubMissing": { zh: "请填写 GitHub 仓库链接", en: "GitHub repository URL is required" },
  "submit.validateGithub": { zh: "链接需以 http:// 或 https:// 开头", en: "URL must start with http:// or https://" },
  "submit.validateGithubHost": { zh: "请使用 github.com 上的仓库链接", en: "Please use a github.com repository URL" },
  "submit.validateDemo": { zh: "Demo 链接格式不正确", en: "Invalid Demo URL format" },
  "submit.submitFail": { zh: "提交失败，请检查网络或稍后重试", en: "Submission failed. Please check your network or try again later." },
  "submit.submitSuccess": { zh: "🎉 项目提交成功！", en: "🎉 Project submitted successfully!" },

  // Ranking page
  "ranking.title": { zh: "📊 项目排名", en: "📊 Project Rankings" },
  "ranking.note": {
    zh: "按五维分档（S/A/B/C/D/?）展示。若本浏览器已保存并完成过「擂台 · 自动淘汰」同档位池，则同档内按擂台名次排序，并可查看对决理由。否则同档内不按名次排序（按名称排列），点击项目以雷达图查看五维 0–20 分（多模型取平均）。",
    en: "Grouped by five-dimension tiers (S/A/B/C/D). If this browser has a completed arena bracket for the same pool tier, in-tier order follows that bracket and duel notes are available. Otherwise projects are not ranked within a tier (sorted by name); click a card to see a five-dimension 0–20 radar chart (averaged across models).",
  },
  "ranking.tableTitle": { zh: "🏆 终焉大盘：逻辑生存率排行榜", en: "🏆 Final Leaderboard: Logic Survival Rate" },
  "ranking.rank": { zh: "RANK", en: "RANK" },
  "ranking.projectDoc": { zh: "项目文档", en: "Project Doc" },
  "ranking.survivalRate": { zh: "逻辑生存率", en: "Survival Rate" },
  "ranking.timestamp": { zh: "存证时间", en: "Timestamp" },
  "ranking.loading": { zh: "正在同步金库协议历史存证...", en: "Syncing vault protocol attestations..." },
  "ranking.empty": { zh: "VOID_DATA", en: "VOID_DATA" },
  "ranking.ruleRubric": { zh: "排行榜规则筛选", en: "Leaderboard rule filter" },
  "ranking.ruleFilterHint": {
    zh: "默认「全部规则版本」下的分档与管理员控制台一致（同一项目多份存证时按展示名合并、取更高均分）。若只选某一 rule_version_id，则仅展示该规则产生的存证，便于同口径对比分数。",
    en: "Default “All rule versions” matches the admin console tier counts (merge by display name, keep higher avg_score). Pick one rule_version_id to show only attestations under that rubric for apples-to-apples scores.",
  },
  "ranking.rulePlaceholder": { zh: "选择规则版本", en: "Select rule version" },
  "ranking.ruleAllRulesOption": { zh: "全部规则版本（分档与控制台一致）", en: "All rule versions (same tiers as admin)" },
  "ranking.ruleLegacyOption": { zh: "旧数据（存证无 rule_version_id）", en: "Legacy (no rule_version_id in attestation)" },
  "ranking.ruleSelectedMeta": { zh: "ID: {id} · SHA256: {sha}", en: "ID: {id} · SHA256: {sha}" },
  "ranking.tierSection": { zh: "{tier} 档", en: "Tier {tier}" },
  "ranking.tierExpandHint": { zh: "{n} 个项目 · 点击展开", en: "{n} projects · tap to expand" },
  "ranking.tierUnknown": { zh: "未分档（五维未完整解析）", en: "Unclassified (incomplete five-dimension parse)" },
  "ranking.bracketOrderHint": {
    zh: "已应用最近一次擂台淘汰赛顺序：{tier} 档池（数据保存在本浏览器，仅作展示参考）。",
    en: "Arena bracket order applied for pool tier {tier} (saved in this browser for display only).",
  },
  "ranking.noDuelRationale": {
    zh: "暂无与本项目相关的擂台对决记录。请由管理员在同一浏览器完成自动淘汰赛后刷新本页，或本项目未参加该档擂台。",
    en: "No stored duel rationales for this project. Run the auto bracket in this browser as admin, then refresh—or this project was not in that pool.",
  },
  "ranking.duelRoundMeta": { zh: "第 {n} 轮", en: "Round {n}" },
  "ranking.duelWinner": { zh: "胜者", en: "Winner" },
  "ranking.duelReason": { zh: "理由摘要", en: "Rationale" },
  "ranking.sourceRepoLabel": { zh: "该项目源码地址：", en: "Source repository: " },
  "ranking.sourceRepoUnknown": {
    zh: "暂无 GitHub 链接（提交未登记或后端未返回；可配置 GET /api/file-github-urls 映射 readme 文件名 → 仓库 URL）。",
    en: "No GitHub URL (not in submission payload or ranking row). You can expose GET /api/file-github-urls as { \"file.md\": \"https://github.com/...\" }.",
  },
  "ranking.duelSectionTitle": { zh: "擂台对决记录", en: "Arena duel notes" },
  "ranking.duelFiveDimTitle": { zh: "五维胜负（≥3 个维度胜者为本场胜者）", en: "Five-dimension tally (≥3 dimension wins = match winner)" },
  "ranking.duelFiveDimColDim": { zh: "维度", en: "Dimension" },
  "ranking.duelFiveDimColWinner": { zh: "该维胜者（项目）", en: "Winner (project)" },
  "ranking.duelFiveDimScoreAB": { zh: "A 侧 {a} 维 · B 侧 {b} 维", en: "A wins {a} dims · B wins {b} dims" },
  "ranking.duelSideA": { zh: "侧 A", en: "Side A" },
  "ranking.duelSideB": { zh: "侧 B", en: "Side B" },
  "ranking.duelAnalysisTitle": { zh: "逐维对比全文", en: "Full dimension-by-dimension analysis" },
  "ranking.noBracketUiHint": {
    zh: "当前无已完成的擂台淘汰赛存证（或未在本浏览器保存）。同档项目不按名次排序；点击卡片查看五维雷达图与分项分数。",
    en: "No completed arena bracket is stored in this browser. Projects in each tier are not ranked; click a card for the five-dimension radar and per-dimension scores.",
  },
  "ranking.unscopedBracketWarn": {
    zh: "检测到本地擂台存证未标记轮次（旧版数据），无法与当前 round_id「{round}」严格对应，可能与其他轮次串档。若存证已过时或不确定来源，请清除后在本轮重新跑一次自动淘汰赛。",
    en: "The saved arena snapshot has no round_id (legacy). It may not belong to round \"{round}\" and could mix rounds. If it is stale or unclear, clear it and re-run the auto bracket for this round.",
  },
  "ranking.unscopedBracketClear": { zh: "清除擂台存证", en: "Clear arena snapshot" },
  "ranking.radarSectionTitle": { zh: "五维能力雷达图（0–20）", en: "Five-dimension radar (0–20)" },
  "ranking.radarSeriesName": { zh: "均分", en: "Average" },
  "ranking.radarTooltipScore": { zh: "分数", en: "Score" },
  "ranking.radarScoreTableTitle": { zh: "各维度分数", en: "Scores by dimension" },
  "ranking.radarFootnote": {
    zh: "分数由评审正文中解析，多模型结果取算术平均；满分 20。离中心越远表示该维度越高。",
    en: "Scores are parsed from review text and averaged across models; max 20. Farther from the center means stronger on that dimension.",
  },
  "ranking.dimInnovation": { zh: "创新性", en: "Innovation" },
  "ranking.dimTechnical": { zh: "技术实现", en: "Technical" },
  "ranking.dimBusiness": { zh: "商业价值", en: "Business value" },
  "ranking.dimUx": { zh: "用户体验", en: "UX" },
  "ranking.dimFeasibility": { zh: "落地可行性", en: "Feasibility" },
  "ranking.emptyRuleFiltered": {
    zh: "当前所选规则下暂无排名数据。可切换其他规则，或等待使用该规则的评审完成。",
    en: "No ranking rows for the selected rule. Switch rules or wait until audits complete under this rubric.",
  },
  "ranking.downloadMarkdown": { zh: "下载 Markdown 报告", en: "Download Markdown report" },
  "ranking.exportEmpty": { zh: "当前没有可导出的排名数据", en: "No ranking data to export" },
  "ranking.exportPageUrl": { zh: "页面地址", en: "Page URL" },
  "ranking.exportGeneratedAt": { zh: "导出时间（UTC）", en: "Exported at (UTC)" },
  "ranking.exportRuleFilter": { zh: "当前规则筛选", en: "Rule filter" },
  "ranking.exportBracketSavedAt": { zh: "擂台存证时间", en: "Arena snapshot time" },
  "ranking.exportBracketPool": { zh: "档位池", en: "Pool tier" },
  "ranking.exportReadmeFile": { zh: "README 存证文件名", en: "README attestation file" },
  "ranking.exportAvgScore": { zh: "榜单均分", en: "Listed avg score" },
  "ranking.exportRepo": { zh: "源码仓库", en: "Repository" },
  "ranking.exportModelReports": { zh: "各模型完整评审正文", en: "Full text per model" },
  "ranking.exportPerModelScore": { zh: "解析总分（0–100）", en: "Parsed total (0–100)" },

  // MySubmission page
  "my.title": { zh: "我的项目", en: "My Project" },
  "my.note": { zh: "仅你可查看本页的评分与详情，他人无法打开你的项目详情。", en: "Only you can view scores & details on this page. Others cannot access your project details." },
  "my.aiScores": { zh: "我的项目 AI 评分", en: "My Project AI Scores" },
  "my.loadingScores": { zh: "正在加载评分...", en: "Loading scores..." },
  "my.noFiles": { zh: "暂无已评审文档（若刚提交且填写了 GitHub，系统将自动拉取并评审，请稍后刷新）。", en: "No reviewed documents yet. If you just submitted with a GitHub link, the system will auto-clone and review. Please refresh later." },
  "my.avgScore": { zh: "平均分", en: "Avg Score" },
  "my.noScore": { zh: "未出分或加载失败", en: "Score unavailable" },
  "my.showDetail": { zh: "查看评审详情", en: "View review details" },
  "my.hideDetail": { zh: "收起详情", en: "Hide details" },
  "my.dimensionTableTitle": { zh: "各模型维度分数对比", en: "Dimension scores by model" },
  "my.dimensionCol": { zh: "维度", en: "Dimension" },
  "my.varianceCol": { zh: "分差", en: "Spread" },
  "my.needReview": { zh: "需复核", en: "Review" },
  "my.noDimensionData": { zh: "未解析到维度分数（报告格式可能不同）", en: "No dimension scores parsed (report format may vary)" },
  "my.systemRanking": { zh: "查看全场排名", en: "View full leaderboard" },
  "my.rankingNote": {
    zh: "完整分档与榜单在「项目排名」页展示；本页仅保留你本人提交的文档与 AI 评分详情。点击下方按钮将跳转至排名页（自动携带本场 round_id）。",
    en: "Letter tiers and the full leaderboard are on the Rankings page; this page keeps your submitted files and AI score details. The button below opens rankings (round_id is preserved).",
  },
  "my.rankCol": { zh: "#", en: "#" },
  "my.docCol": { zh: "项目文档", en: "Project Doc" },
  "my.scoreCol": { zh: "平均分", en: "Avg Score" },
  "my.timeCol": { zh: "时间", en: "Time" },
  "my.noRanking": { zh: "暂无排名数据", en: "No ranking data" },
  "my.mine": { zh: "(我的)", en: "(mine)" },
  "my.notFound": { zh: "未找到该提交，或链接已失效。", en: "Submission not found or link expired." },
  "my.backToSubmit": { zh: "返回项目提交", en: "Back to submission" },
  "my.loading": { zh: "加载中...", en: "Loading..." },

  // Judge (Index) page
  "judge.singleBtn": { zh: "单文件裁决 (SINGLE EXECUTE)", en: "Single File Judge (EXECUTE)" },
  "judge.singleRunning": { zh: "▶ 裁决中...", en: "▶ Judging..." },
  "judge.singleProgressTitle": { zh: "裁决进行中", en: "Audit in progress" },
  "judge.singleProgressHint": {
    zh: "已选择 {n} 个模型并行评审：服务器正在检索文档、调用模型并写入存证，通常需数十秒至数分钟。进度条为活动指示（非精确百分比），页面未卡死，请稍候。",
    en: "{n} model(s) selected: the server is reading the document, calling providers, and saving results—often tens of seconds to a few minutes. The bar is an activity indicator (not exact %); the page is still working.",
  },
  "judge.selectFileAndModels": { zh: "请先选择目标文档，并至少勾选一个裁决模型。", en: "Select a target document and at least one judge model." },
  "judge.batchBtn": { zh: "批量裁决 (BATCH EXECUTE)", en: "Batch Judge (EXECUTE)" },
  "judge.batchRunning": { zh: "▶ 批量裁决中...", en: "▶ Batch judging..." },
  "judge.stopBtn": { zh: "停止批量 (STOP)", en: "Stop Batch" },
  "judge.waitingInput": { zh: "等待指令流输入...", en: "Waiting for input..." },

  // FileSelector
  "fileSelector.label": { zh: "1. 目标文档 (Target Document Selection)", en: "1. Target Document Selection" },
  "fileSelector.loading": { zh: "正在调取服务器文件列表...", en: "Loading file list from server..." },
  "fileSelector.note": { zh: "单文件裁决仍可用；批量裁决会自动处理", en: "Single file judging still available; batch will auto-process" },
  "fileSelector.noteDir": { zh: "下全部未分析文件。", en: "all unanalyzed files." },

  // ModelSelector
  "modelSelector.label": { zh: "2. 召唤裁决官 (Consulting LLM Clusters)", en: "2. Select LLM Judges" },

  // Custom prompt & rubric
  "judge.customPromptLabel": { zh: "3. 自定义指令（可选）", en: "3. Custom Instruction (Optional)" },
  "judge.customPromptPlaceholder": { zh: "严格按照当前生效规则评分，并重点关注创新性与已有解决方案的差异。", en: "Score strictly based on ACTIVE JUDGING RULES. Pay special attention to novelty vs existing solutions." },
  "judge.customPromptHint": { zh: "留空则使用默认指令。评分依据以当前生效 YAML 规则为准。", en: "Leave empty to use default instruction. Scoring is based on the active YAML rules." },
  "judge.rubricNote": { zh: "📋 评分依据：当前生效规则（YAML）", en: "📋 Rubric: Active Judging Rules (YAML)" },

  // BatchControls
  "batch.dirFilter": { zh: "目录过滤：", en: "Dir filter:" },
  "batch.concurrency": { zh: "并发：", en: "Concurrency:" },
  "batch.stable": { zh: "(稳)", en: "(stable)" },
  "batch.delay": { zh: "间隔(ms)：", en: "Delay(ms):" },
  "batch.collapseAll": { zh: "全部折叠", en: "Collapse All" },
  "batch.expandAll": { zh: "全部展开", en: "Expand All" },
  "batch.clear": { zh: "清空输出", en: "Clear Output" },
  "batch.notStarted": { zh: "批量任务未开始。", en: "Batch not started." },
  "batch.progress": { zh: "进度：", en: "Progress:" },

  // ReportCard
  "report.waiting": { zh: "等待数据...", en: "Waiting for data..." },
  "report.auditInProgress": {
    zh: "本条请求已发出，正在等待后端与模型返回；完成后会自动替换为报告。请勿误以为页面卡死。",
    en: "This request is in flight. Reports will appear here when the backend finishes—please wait; the page is not frozen.",
  },
  "report.judgeNode": { zh: "判官节点:", en: "Judge Node:" },

  // JudgeDetail
  "judgeDetail.title": { zh: "📄 评审详情：", en: "📄 Review Details: " },
  "judgeDetail.close": { zh: "✕ 关闭", en: "✕ Close" },
  "judgeDetail.loading": { zh: "正在加载评审数据...", en: "Loading review data..." },
  "judgeDetail.overallScore": { zh: "综合评分：", en: "Overall Score: " },
  "judgeDetail.reviewTime": { zh: "评审时间：", en: "Review Time: " },

  // Admin page
  "admin.rankings": { zh: "📊 项目排名", en: "📊 Rankings" },
  "admin.submissions": { zh: "📋 提交管理", en: "📋 Submissions" },
  "admin.connectWallet": { zh: "连接钱包", en: "Connect Wallet" },
  "admin.connecting": { zh: "连接中…", en: "Connecting..." },
  "admin.walletRequired": { zh: "查看提交列表需连接管理员钱包", en: "Connect admin wallet to view submissions" },
  "admin.connectBtn": { zh: "连接钱包 (CONNECT WALLET)", en: "Connect Wallet" },
  "admin.loadingSub": { zh: "加载中...", en: "Loading..." },
  "admin.noSub": { zh: "暂无提交", en: "No submissions" },
  "admin.deleting": { zh: "删除中…", en: "Deleting..." },
  "admin.delete": { zh: "🗑 删除", en: "🗑 Delete" },
  "admin.reaudit": { zh: "🤖 再次 AI 评估", en: "🤖 Re-run AI audit" },
  "admin.reauditing": { zh: "AI 评估中…", en: "Auditing…" },
  "admin.reauditNoFile": {
    zh: "尚无 word 关联文档（如 *_00_README.md），无法发起评审。请先完成仓库拉取或上传。",
    en: "No linked word doc (e.g. *_00_README.md). Clone/upload first.",
  },
  "admin.reauditNeedRound": { zh: "请在 URL 中带上 ?round_id= 当前轮次后再试。", en: "Add ?round_id= for this round to the URL first." },
  "admin.reauditConfirmGithub": {
    zh: "将重新从 GitHub 克隆仓库、写入最新 README，再按当前规则进行多模型 AI 评审（可能较久并消耗 API 额度）。是否继续？",
    en: "Re-clone from GitHub, refresh README, then multi-model AI audit (may take a while and use API quota). Continue?",
  },
  "admin.reauditNoGithub": { zh: "该提交无 GitHub 仓库链接，无法从远端拉取。", en: "No GitHub repo URL on this submission." },
  "admin.reauditReadmeOnlyDone": {
    zh: "已重新拉取仓库；判定为 README-only，已写入系统裁定（未调用大模型）。",
    en: "Refetched; README-only — system grade saved (no LLM).",
  },
  "admin.reauditSuccess": { zh: "AI 评审完成，均分约 {score}", en: "Audit finished. Avg score ≈ {score}" },
  "admin.reauditFail": { zh: "AI 评审失败", en: "Audit failed" },
  "admin.confirmDelete": { zh: "确认删除项目「{title}」？此操作不可撤销。", en: "Delete project \"{title}\"? This action cannot be undone." },
  "admin.relatedDocs": { zh: "关联文档", en: "Related Docs" },
  "admin.legacyFormNote": { zh: "历史表单备注", en: "Legacy form note" },
  "admin.projectGradeBracket": { zh: "【{tier}级】", en: "[{tier}] " },
  "admin.redirecting": { zh: "正在跳转到首页…", en: "Redirecting to home..." },
  "admin.roundScopeHint": { zh: "列表与排行按此轮次请求 API", en: "List & rankings use this round in API calls" },
  "admin.filterAll": { zh: "全部", en: "All" },
  "admin.filterBeginner": { zh: "小白", en: "Beginner" },
  "admin.filterLongterm": { zh: "长期 Builder", en: "Long-term Builder" },
  "admin.filterOrg": { zh: "组织", en: "Organization" },
  "admin.accountYears": { zh: "账号年限", en: "Account years" },
  "admin.accountYearsValue": { zh: "{n} 年", en: "{n} yr" },
  "admin.accountYearsFetching": { zh: "获取中", en: "Fetching..." },
  "admin.accountYearsLookupFailed": { zh: "查询失败", en: "Lookup failed" },
  "admin.accountYearsRateLimited": { zh: "查询限流", en: "Rate limited" },
  "admin.accountYearsUnauthorized": { zh: "鉴权失败", en: "Unauthorized" },
  "admin.accountYearsNotFound": { zh: "仓库/账号不存在", en: "Repo/user not found" },
  "admin.accountYearsNetwork": { zh: "网络异常", en: "Network error" },
  "admin.accountYearsInvalidUrl": { zh: "仓库链接无效", en: "Invalid GitHub URL" },
  "admin.accountYearsNoGitHub": { zh: "未填仓库链接", en: "No repo URL" },
  "admin.accountYearsRepoNoAge": {
    zh: "已填仓库（年限未同步）",
    en: "Repo URL on file (account age not from API)",
  },
  "admin.builderFilterSelfHostedNote": {
    zh: "说明：服务端需在环境变量中配置 GITHUB_TOKEN（或 GH_TOKEN / AURA_GITHUB_TOKEN）。配置后每次打开提交列表会最多补全 24 条未缓存记录的账号年限（成功结果缓存 7 天）；「小白」为注册约 1 年及以内，「长期」为约 3 年及以上。",
    en: "Set GITHUB_TOKEN (or GH_TOKEN / AURA_GITHUB_TOKEN) on the server. Each admin list load enriches up to 24 submissions missing cache (success cached 7 days). “Beginner” ≈ ≤1 year since signup; “Long-term” ≈ ≥3 years.",
  },
  "admin.builderTagBeginner": { zh: "小白", en: "Beginner" },
  "admin.builderTagLongterm": { zh: "长期", en: "Long-term" },
  "admin.ownerTypeOrg": { zh: "组织账号", en: "Organization" },
  "admin.ownerTypeUser": { zh: "个人账号", en: "Individual" },
  "admin.batchIngestTitle": { zh: "批量导入 GitHub（生成 word 并可选自动裁决）", en: "Batch GitHub ingest (word + optional auto-audit)" },
  "admin.batchIngestDesc": {
    zh: "每行一个 https://github.com/owner/repo 链接。后台 git clone 后写入 README 到 word 目录；若勾选自动裁决则按 AURA_AUTO_MODELS 调用 LLM（与表单提交一致）。重复仓库可跳过。",
    en: "One GitHub URL per line. Server clones each repo, copies README into word/. Optional auto-audit uses AURA_AUTO_MODELS like form submit. Duplicates can be skipped.",
  },
  "admin.batchIngestPlaceholder": {
    zh: "https://github.com/org/repo-one\nhttps://github.com/org/repo-two",
    en: "https://github.com/org/repo-one\nhttps://github.com/org/repo-two",
  },
  "admin.batchIngestAutoAudit": { zh: "自动 LLM 裁决（服务端）", en: "Auto LLM audit (server)" },
  "admin.batchIngestSkipDup": { zh: "跳过本轮已存在的相同仓库", en: "Skip duplicate repos in this round" },
  "admin.batchIngestConcurrency": { zh: "并发 clone", en: "Clone concurrency" },
  "admin.batchIngestSubmit": { zh: "提交批量任务", en: "Start batch" },
  "admin.batchIngestRunning": { zh: "提交中…", en: "Starting…" },
  "admin.batchIngestNeedRound": {
    zh: "请先在 URL 中加上 ?round_id=当前轮次（例如 AI1），再使用批量导入。",
    en: "Add ?round_id=<your_round> to the page URL (e.g. AI1) before batch ingest.",
  },
  "admin.batchIngestNeedUrls": { zh: "请至少填写一行 GitHub 链接。", en: "Enter at least one GitHub URL." },
  "my.githubAccountYears": { zh: "账号年限：{n} 年", en: "Account years: {n} yr" },
  "my.githubAccountYearsShort": { zh: "{n} 年 builder", en: "{n} yr builder" },

  // Login page
  "login.noAccount": { zh: "没有账号？注册", en: "No account? Register" },
  "login.hasAccount": { zh: "已有账号？登录", en: "Have an account? Login" },

  // Hackathon Rounds
  "rounds.title": { zh: "📅 黑客松轮次管理", en: "📅 Hackathon Rounds" },
  "rounds.create": { zh: "+ 创建新轮次", en: "+ Create New Round" },
  "rounds.colName": { zh: "轮次名称", en: "Round Name" },
  "rounds.colMode": { zh: "模式", en: "Mode" },
  "rounds.colStart": { zh: "开始时间", en: "Start Time" },
  "rounds.colEnd": { zh: "结束时间", en: "End Time" },
  "rounds.colStatus": { zh: "状态", en: "Status" },
  "rounds.colProjects": { zh: "项目数", en: "Projects" },
  "rounds.colActions": { zh: "操作", en: "Actions" },
  "rounds.createTitle": { zh: "创建新轮次", en: "Create New Round" },
  "rounds.editTitle": { zh: "编辑轮次", en: "Edit Round" },
  "rounds.basicInfo": { zh: "基本信息", en: "Basic Info" },
  "rounds.fieldName": { zh: "轮次名称", en: "Round Name" },
  "rounds.fieldDesc": { zh: "描述", en: "Description" },
  "rounds.fieldMode": { zh: "模式", en: "Mode" },
  "rounds.fieldTimezone": { zh: "时区", en: "Timezone" },
  "rounds.fieldStatus": { zh: "状态", en: "Status" },
  "rounds.fieldStart": { zh: "开始时间", en: "Start Time" },
  "rounds.fieldEnd": { zh: "结束时间", en: "End Time" },
  "rounds.judgingRules": { zh: "评审规则", en: "Judging Rules" },
  "rounds.scoringDimensions": { zh: "评分维度", en: "Scoring Dimensions" },
  "rounds.selectRuleVersion": { zh: "选择评审规则", en: "Select judging rules" },
  "rounds.selectRulePlaceholder": { zh: "请选择已上传的规则版本…", en: "Choose an uploaded ruleset…" },
  "rounds.ruleFromYamlHint": { zh: "以下评分维度与等级区间来自该规则 YAML；保存时会写入轮次元数据。", en: "Dimensions and grade bands below come from the rules YAML; they are saved into round metadata." },
  "rounds.ruleYamlLoading": { zh: "正在加载规则 YAML…", en: "Loading rules YAML…" },
  "rounds.pickRuleFirst": { zh: "请先选择一条规则", en: "Please select a ruleset first" },
  "rounds.openRulesToAdd": { zh: "没有合适规则？去规则管理上传新 YAML", en: "Need a different rubric? Open Rules to upload YAML" },
  "rounds.addDimension": { zh: "添加维度", en: "Add Dimension" },
  "rounds.gradeBandsTitle": { zh: "等级区间", en: "Grade Bands" },
  "rounds.pitchTitle": { zh: "路演评审", en: "Pitch Evaluation" },
  "rounds.enablePitch": { zh: "启用路演评审", en: "Enable Pitch Evaluation" },
  "rounds.pitchWeight": { zh: "路演权重", en: "Pitch Weight" },
  "rounds.pitchSubScores": { zh: "子评分项", en: "Sub-scores" },
  "rounds.saveCreate": { zh: "创建轮次", en: "Create Round" },
  "rounds.saveUpdate": { zh: "保存更改", en: "Save Changes" },
  "rounds.cancel": { zh: "取消", en: "Cancel" },
  "rounds.edit": { zh: "编辑", en: "Edit" },
  "rounds.tab_overview": { zh: "概览", en: "Overview" },
  "rounds.tab_projects": { zh: "项目", en: "Projects" },
  "rounds.tab_judges": { zh: "评委", en: "Judges" },
  "rounds.tab_rules": { zh: "规则", en: "Rules" },
  "rounds.tab_exports": { zh: "导出", en: "Exports" },
  "rounds.totalProjects": { zh: "总项目数", en: "Total Projects" },
  "rounds.judgedProjects": { zh: "已评审", en: "Judged" },
  "rounds.pendingReviews": { zh: "待评审", en: "Pending" },
  "rounds.judgeProgress": { zh: "评审进度", en: "Judge Progress" },
  "rounds.projectsPlaceholder": { zh: "项目列表功能即将上线", en: "Project list coming soon" },
  "rounds.projectsAdminDesc": {
    zh: "下方按钮会打开管理台并自动带上本场 round_id，列表与「提交」筛选即对应当前轮次。请连接钱包；若仍为 0，说明磁盘上提交不在该轮次目录（例如仍在 default），需迁移数据。",
    en: "The button opens Admin with this round’s round_id so the submissions tab matches this hackathon. Connect your wallet; if the list is still empty, submissions on disk may live under another round (e.g. default) and need migrating.",
  },
  "rounds.openAdminConsole": { zh: "打开项目管理后台", en: "Open admin console" },
  "rounds.adminConfigLoadError": { zh: "无法读取后台入口配置，请检查 VITE_API_BASE 与网络。", en: "Could not load admin entry config. Check VITE_API_BASE and network." },
  "rounds.rulesPageDesc": {
    zh: "YAML 规则的上传、版本与激活请在「规则管理」全页完成，与全局 /api/rules 一致。",
    en: "Upload, version, and activate YAML rules on the full Rules page (global /api/rules).",
  },
  "rounds.openRulesPage": { zh: "打开规则管理", en: "Open rules management" },
  "rounds.gotoSubmit": { zh: "去提交（本场）", en: "Submit for this round" },
  "rounds.gotoRanking": { zh: "看排行（本场）", en: "Rankings for this round" },
  "rounds.submissionCountExplain": {
    zh: "项目数 = 服务器目录 submissions/<轮次 id>/ 下含有 submission.json 的子文件夹个数。旧数据若已迁到 default，请看列表中带「默认数据轮次」标记的那一行；若希望算在 AI1 等其它 id 下，需在停服务后把该轮次目录下的提交迁过去（仓库 aura/scripts/migrate_round_data.sh）。",
    en: "Project count = number of child folders under submissions/<round_id>/ that contain submission.json. If legacy data lives under default, use the row tagged for the default data round; to attribute counts to AI1 etc., move data between round folders while Aura is stopped (see aura/scripts/migrate_round_data.sh).",
  },
  "rounds.badgeDefaultRound": { zh: "默认数据轮次", en: "Default data round" },
  "rounds.judgesPlaceholder": { zh: "评委管理功能即将上线", en: "Judge management coming soon" },
  "rounds.exportsPlaceholder": { zh: "导出功能即将上线", en: "Export feature coming soon" },

  "judges.adminWalletRequired": {
    zh: "需要管理员钱包：请在规则管理页保存与服务器 AURA_ADMIN_WALLET 一致的钱包地址后再试。",
    en: "Admin wallet required: save the same wallet as server AURA_ADMIN_WALLET (e.g. on the Rules page) and retry.",
  },
  "judges.setWalletHint": {
    zh: "保存后刷新本页即可加载评委配置。评委 id 请使用不易猜测的标识（如随机串），工作台链接仅依赖该 id。",
    en: "Refresh this page after saving. Use hard-to-guess judge IDs; workspace URLs rely only on that ID.",
  },
  "judges.panelTitle": { zh: "评委模板与分配", en: "Judge roster & assignments" },
  "judges.panelDesc": {
    zh: "填写每位评委的 id 与姓名并保存；点击「平均分配」按提交 id 升序将本轮全部项目切块均分给各评委（余数优先分给列表靠前的评委）。配置保存在服务器 submissions/<轮次>/.aura_judge_assignments.json。",
    en: "Save each judge’s id and name, then use Even split to partition all submissions in this round by ascending submission id (remainder slots go to earlier judges). Stored at submissions/<round>/.aura_judge_assignments.json.",
  },
  "judges.submissionTotal": { zh: "本轮项目总数", en: "Submissions in round" },
  "judges.updatedAt": { zh: "最近更新", en: "Updated" },
  "judges.colJudgeId": { zh: "评委 ID", en: "Judge ID" },
  "judges.colJudgeName": { zh: "姓名", en: "Name" },
  "judges.colAssigned": { zh: "已分配", en: "Assigned" },
  "judges.colActions": { zh: "工作台", en: "Workspace" },
  "judges.namePlaceholder": { zh: "显示名", en: "Display name" },
  "judges.openWorkspace": { zh: "打开", en: "Open" },
  "judges.copyLink": { zh: "复制链接", en: "Copy link" },
  "judges.removeRow": { zh: "删除行", en: "Remove row" },
  "judges.addJudge": { zh: "添加评委", en: "Add judge" },
  "judges.saveJudges": { zh: "保存评委", en: "Save judges" },
  "judges.autoAssign": { zh: "平均分配项目", en: "Even split assignments" },
  "judges.assignAlgoNote": {
    zh: "新增或删除提交后，可再次点击「平均分配」覆盖当前划分（按最新项目列表重算）。",
    en: "After submissions change, run Even split again to recompute from the latest list (overwrites current mapping).",
  },
  "judges.needOneJudgeId": { zh: "至少填写一行有效的评委 ID。", en: "Enter at least one valid judge ID." },
  "judges.copyUrlFallback": { zh: "复制此链接", en: "Copy this URL" },
  "judges.workspaceTitle": { zh: "评委工作台", en: "Judge workspace" },
  "judges.roundLabel": { zh: "轮次", en: "Round" },
  "judges.workspaceCount": { zh: "已分配项目数：{count}", en: "Assigned projects: {count}" },
  "judges.workspaceEmpty": { zh: "暂无分配项目，请管理员保存评委后执行平均分配。", en: "No projects assigned yet. Ask an admin to save judges and run even split." },
  "judges.colProject": { zh: "项目", en: "Project" },
  "judges.colLinks": { zh: "链接", en: "Links" },
  "judges.submissionPage": { zh: "提交详情页", en: "Submission page" },
  "judges.humanReviewHint": {
    zh: "在此填写人工评语与 0–100 分（可只填其一）；保存后写入服务器该轮次目录下的 .aura_human_reviews.json。清空评语与分数并保存可删除本条记录。",
    en: "Add a written review and/or a human score from 0–100 (either is optional). Saved to .aura_human_reviews.json under this round on the server. Clear both and save to remove the record.",
  },
  "judges.humanComment": { zh: "人工评语", en: "Written review" },
  "judges.humanScore": { zh: "人工打分", en: "Human score" },
  "judges.commentPlaceholder": { zh: "针对本项目的评语…", en: "Your comments on this project…" },
  "judges.scoreHint": { zh: "留空表示不打分；支持小数。", en: "Leave empty for no score; decimals allowed." },
  "judges.saveReview": { zh: "保存评语与分数", en: "Save review & score" },
  "judges.saving": { zh: "保存中…", en: "Saving…" },
  "judges.reviewSaved": { zh: "已保存", en: "Saved" },
  "judges.saveError": { zh: "保存失败", en: "Save failed" },
  "judges.scoreRangeError": { zh: "分数须在 0–100 之间", en: "Score must be between 0 and 100" },
  "judges.scoreInvalid": { zh: "分数格式无效", en: "Invalid score" },
  "judges.lastSaved": { zh: "上次保存", en: "Last saved" },
  "judges.resetDraft": { zh: "还原", en: "Reset" },
  "nav.rounds": { zh: "📅 轮次管理", en: "📅 Rounds" },
  "nav.tracks": { zh: "赛道管理", en: "Tracks" },
  "nav.rules": { zh: "🧩 规则管理", en: "🧩 Rules" },

  // Rules Management
  "rules.title": { zh: "YAML 规则管理", en: "YAML Rules Management" },
  "rules.tabDashboard": { zh: "📊 仪表盘", en: "📊 Dashboard" },
  "rules.tabVersions": { zh: "📋 版本历史", en: "📋 Versions" },
  "rules.activeRuleset": { zh: "当前生效规则集", en: "Active Ruleset" },
  "rules.activeRulesetPanel": { zh: "当前生效评审规则", en: "Active Judging Rules" },
  "rules.version": { zh: "版本", en: "Version" },
  "rules.updatedAt": { zh: "更新时间", en: "Updated At" },
  "rules.dimensions": { zh: "维度数", en: "Dimensions" },
  "rules.ecosystemModules": { zh: "生态模块", en: "Ecosystem Modules" },
  "rules.uploadYAML": { zh: "📤 上传 YAML", en: "📤 Upload YAML" },
  "rules.replaceYAML": { zh: "🔄 替换当前 YAML", en: "🔄 Replace Active YAML" },
  "rules.viewDetail": { zh: "查看详情", en: "View Details" },
  "rules.dimensionOverview": { zh: "维度权重概览", en: "Dimension Weights Overview" },
  "rules.uploadedBy": { zh: "上传者", en: "by" },
  "rules.view": { zh: "查看", en: "View" },
  "rules.activate": { zh: "激活", en: "Activate" },
  "rules.confirmDelete": { zh: "确认删除此版本？", en: "Delete this version?" },
  "rules.uploadTitle": { zh: "上传 / 替换 YAML 规则", en: "Upload / Replace YAML Rules" },
  "rules.dropHere": { zh: "拖放 .yaml / .yml 文件到此处", en: "Drop .yaml / .yml file here" },
  "rules.browseFiles": { zh: "选择文件", en: "Browse Files" },
  "rules.pasteYAML": { zh: "或直接粘贴 YAML 内容", en: "Or paste YAML content" },
  "rules.yamlPlaceholder": { zh: "在此粘贴 YAML 规则内容...", en: "Paste YAML rules content here..." },
  "rules.errors": { zh: "错误", en: "Errors" },
  "rules.warnings": { zh: "警告", en: "Warnings" },
  "rules.validYAML": { zh: "YAML 验证通过", en: "YAML is valid" },
  "rules.preview": { zh: "规则预览", en: "Rules Preview" },
  "rules.saving": { zh: "保存中…", en: "Saving..." },
  "rules.saveVersion": { zh: "保存为新版本", en: "Save as New Version" },
  "rules.backToRules": { zh: "返回规则管理", en: "Back to Rules" },
  "rules.downloadYAML": { zh: "下载 YAML", en: "Download YAML" },
  "rules.universalDimensions": { zh: "通用评审维度", en: "Universal Dimensions" },
  "rules.dimName": { zh: "名称", en: "Name" },
  "rules.dimWeight": { zh: "权重", en: "Weight" },
  "rules.dimDesc": { zh: "描述", en: "Description" },
  "rules.gradingBands": { zh: "等级区间", en: "Grading Bands" },
  "rules.notes": { zh: "备注", en: "Notes" },
  "rules.noActiveRules": { zh: "暂无激活规则", en: "No active rules" },
  "rules.reloadRules": { zh: "重载规则", en: "Reload Rules" },
  "rules.mockAIScore": { zh: "模拟 AI 评分", en: "Mock AI Score" },
  "rules.aiScoreResult": { zh: "AI 评分结果（模拟）", en: "AI Score Result (Mock)" },
  "rules.aiWeightedScore": { zh: "加权总分", en: "Weighted Score" },
  "rules.adminWallet": { zh: "管理员钱包地址", en: "Admin Wallet" },
  "rules.saveWallet": { zh: "保存", en: "Save" },
  "rules.walletSaved": { zh: "钱包地址已保存", en: "Wallet address saved" },
  "rules.walletRequired": { zh: "请先设置管理员钱包地址", en: "Please set admin wallet address first" },
  "rules.walletLinked": { zh: "已连接", en: "Connected" },
  "rules.walletHint": {
    zh: "连接钱包会自动写入请求头；无插件时也可手动粘贴后点保存。",
    en: "Connecting MetaMask (or any injected wallet) auto-fills the admin header; without an extension, paste an address and click Save.",
  },
  "rules.activated": { zh: "已激活", en: "Activated" },
  "rules.deleted": { zh: "已删除", en: "Deleted" },
  "rules.uploadSuccess": { zh: "上传成功", en: "Upload successful" },
  "rules.noVersions": { zh: "暂无版本记录", en: "No versions yet" },
  "rules.versionMergeHint": {
    zh: "「版本历史」与排行榜规则筛选对齐：除已上传至服务器的规则外，会合并当前轮次 judge-result 存证里出现过的 rule_version_id（标记为仅存证，无 YAML）。请在网址加上与排行榜相同的 ?round_id=（例如 AI1）；未传时使用构建变量 VITE_ROUND_ID。",
    en: "Version history matches the ranking filter: besides uploaded rules, the API merges rule_version_id values found in this round’s judge-result JSON (tagged attestation-only, no YAML). Add the same ?round_id= as the ranking page (e.g. AI1); if omitted, VITE_ROUND_ID is used.",
  },
  "rules.orphanBadge": { zh: "仅存证", en: "Attestation only" },
  "rules.orphanNoYaml": {
    zh: "该 ID 仅出现在历史评审存证中，服务器 rules 目录没有对应 YAML，无法预览或下载。",
    en: "This ID only appears in saved audit JSON; there is no YAML on the server to preview or download.",
  },
  "ranking.ruleVersion": { zh: "规则版本", en: "Rule Version" },

  // Judge - competitor search & output lang
  "judge.competitorSearch": { zh: "竞品搜索", en: "Competitor Search" },
  "judge.competitorKeywords": { zh: "竞品关键词", en: "Competitor Keywords" },
  "judge.keywordsPlaceholder": { zh: "GoPlus, token security API, rug pull detection...", en: "GoPlus, token security API, rug pull detection..." },
  "judge.addCommonKeywords": { zh: "添加常用关键词", en: "Add common keywords" },
  "judge.outputLang": { zh: "输出语言", en: "Output Language" },
  "judge.langEn": { zh: "English", en: "English" },
  "judge.langZh": { zh: "中文", en: "中文" },
  "judge.badgeLang": { zh: "语言", en: "Language" },
  "judge.badgeSearch": { zh: "竞品搜索", en: "Competitor Search" },
  "judge.on": { zh: "开", en: "ON" },
  "judge.off": { zh: "关", en: "OFF" },
  "judge.searchQuery": { zh: "搜索查询", en: "Search Query" },
  "judge.competitorResults": { zh: "竞品结果", en: "Competitor Results" },
  "judge.competitorSearchDetails": { zh: "竞品检索详情", en: "Competitor Search Details" },
  "judge.resultsCount": { zh: "结果数", en: "Results" },
  "judge.queryLabel": { zh: "查询", en: "Query" },
  "judge.queryNotRecorded": { zh: "（查询未记录）", en: "(query not recorded)" },
  "judge.keywordsUsed": { zh: "使用的关键词", en: "Keywords Used" },
  "judge.competitorSearchOff": { zh: "竞品搜索：关闭", en: "Competitor search: OFF" },
  "judge.copyQuery": { zh: "复制查询", en: "Copy query" },
  "judge.copied": { zh: "已复制", en: "Copied" },
  "ranking.competitorSearch": { zh: "竞品搜索", en: "Competitor Search" },

  // Submit - advanced fields
  "submit.advanced": { zh: "⚙ 高级设置 (Advanced)", en: "⚙ Advanced Settings" },
  "submit.customPrompt": { zh: "自定义审计指令", en: "Custom Audit Prompt" },

  // MySubmission - new fields
  "my.refresh": { zh: "刷新", en: "Refresh" },
  "my.pending": { zh: "评审处理中…", en: "Pending evaluation…" },
  "my.pendingNote": { zh: "AI 评审通常需要 5-10 分钟，请稍后点击刷新查看结果。", en: "AI review typically takes 5-10 minutes. Click Refresh to check for results." },
  "my.ruleVersion": { zh: "规则版本", en: "Rule Version" },

  // Prompt Transparency
  "prompt.title": { zh: "评审提示词（公开透明）", en: "Judging Prompt (Transparency)" },
  "prompt.show": { zh: "展开提示词", en: "Show prompt" },
  "prompt.hide": { zh: "收起提示词", en: "Hide prompt" },
  "prompt.template": { zh: "Prompt 模板（公开）", en: "Prompt Template (Public)" },
  "prompt.templateNote": { zh: "以下为后端构建完整 LLM 提示词的结构模板，所有参赛项目均使用相同模板。", en: "Below is the exact structure template used by the backend to build the full LLM prompt. All submissions use the same template." },
  "prompt.copyTemplate": { zh: "复制模板", en: "Copy template" },
  "prompt.customInstruction": { zh: "自定义评审指令（动态）", en: "Custom Instruction Used (Dynamic)" },
  "prompt.copyInstruction": { zh: "复制指令", en: "Copy instruction" },
  "prompt.language": { zh: "输出语言", en: "Output Language" },
  "prompt.competitorSearch": { zh: "竞品搜索", en: "Competitor Search" },
  "prompt.keywordsNote": { zh: "关键词列表：如提交时未提供，则使用系统默认关键词。", en: "Keywords: If not provided at submission, system default keywords are used." },
  "prompt.ruleVersion": { zh: "生效规则版本", en: "Active Rule Version" },
  "prompt.downloadYAML": { zh: "下载 YAML", en: "Download YAML" },
  "prompt.noRule": { zh: "本次评审未记录规则版本。", en: "No active rule recorded for this run." },
  "prompt.thisRun": { zh: "本次评审（实际参数）", en: "This Run (Actual Values)" },
  "prompt.modelsUsed": { zh: "使用模型", en: "Models Used" },
  "prompt.unknown": { zh: "未知", en: "Unknown" },
  "prompt.ruleNotRecorded": { zh: "旧评审结果未记录规则版本。", en: "Rule version was not recorded for this older evaluation run." },
  "prompt.competitorNotAvailable": { zh: "本次评审未包含竞品检索元数据。", en: "Competitor search metadata is not available for this run." },
  "prompt.queryNotRecorded": { zh: "（查询未记录）", en: "(query not recorded)" },
  "prompt.copyQuery": { zh: "复制查询", en: "Copy query" },
  "prompt.langUnknown": { zh: "未记录输出语言；以模型输出内容为准。", en: "Language was not recorded; report content reflects the model output." },
  "prompt.instructionFallbackLabel": { zh: "默认指令（兜底）", en: "Default instruction (fallback)" },
  "prompt.instructionFallbackNote": { zh: "后端当前未持久化每次评审的 custom_prompt，这里显示兜底文本。", en: "The backend does not currently persist per-run custom_prompt; showing fallback." },
} as const;

export type TransKey = string & keyof typeof translations;

interface I18nContextType {
  lang: Lang;
  toggleLang: () => void;
  t: (key: TransKey, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextType>({
  lang: "zh",
  toggleLang: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("lang");
    } catch {
      saved = null;
    }
    return saved === "en" ? "en" : "zh";
  });

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === "zh" ? "en" : "zh";
      try {
        localStorage.setItem("lang", next);
      } catch {
        // Ignore storage failures (privacy mode / disabled storage).
      }
      return next;
    });
  }, []);

  const t = useCallback(
    (key: TransKey, vars?: Record<string, string>): string => {
      const entry = translations[key];
      if (!entry) return key;
      let text: string = entry[lang];
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, v);
        });
      }
      return text;
    },
    [lang]
  );

  return (
    <I18nContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function LanguageToggle() {
  const { lang, toggleLang } = useI18n();
  return (
    <button
      onClick={toggleLang}
      className="text-xs border border-border px-2.5 py-1 text-muted-foreground hover:text-primary hover:border-primary transition-colors font-mono"
      title={lang === "zh" ? "Switch to English" : "切换为中文"}
    >
      {lang === "zh" ? "EN" : "中文"}
    </button>
  );
}
