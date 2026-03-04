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
  "landing.submitBtn": { zh: "📋 去提交项目 (SUBMIT PROJECT)", en: "📋 Submit Project" },
  "landing.rankingBtn": { zh: "📊 查看项目排名 (RANKING)", en: "📊 View Rankings" },
  "landing.judgeLink": { zh: "裁决系统（单文件/批量评审） →", en: "Judgment System (Single/Batch Review) →" },

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
  "submit.subtitle": { zh: "黑客松项目提交入口 // 支持文档上传 + GitHub 链接", en: "Hackathon project submission // Supports document upload + GitHub link" },
  "submit.section1": { zh: "基本信息 (Required Fields)", en: "Required Fields" },
  "submit.projectTitle": { zh: "项目名称 *", en: "Project Title *" },
  "submit.projectTitlePlaceholder": { zh: "例：Aura Judging System", en: "e.g. Aura Judging System" },
  "submit.oneLiner": { zh: "一句话简介 *", en: "One-liner *" },
  "submit.oneLinerPlaceholder": { zh: "用一句话描述你的项目", en: "Describe your project in one sentence" },
  "submit.problem": { zh: "解决的问题 *", en: "Problem Solved *" },
  "submit.problemPlaceholder": { zh: "你的项目解决了什么问题？", en: "What problem does your project solve?" },
  "submit.solution": { zh: "解决方案 *", en: "Solution *" },
  "submit.solutionPlaceholder": { zh: "你的解决方案是什么？", en: "What is your solution?" },
  "submit.section2": { zh: "链接与生态 (Optional)", en: "Optional Info" },
  "submit.whyChain": { zh: "Avalanche 生态适配理由", en: "Why Avalanche" },
  "submit.whyChainPlaceholder": { zh: "为什么选择 Avalanche？你的项目如何与该生态结合？", en: "Why Avalanche? How does your project integrate with the ecosystem?" },
  "submit.githubUrl": { zh: "GitHub 仓库链接", en: "GitHub Repo URL" },
  "submit.demoUrl": { zh: "Demo / 演示链接", en: "Demo URL" },
  "submit.docsText": { zh: "补充文本", en: "Additional Text" },
  "submit.docsTextPlaceholder": { zh: "可在此粘贴项目文档、白皮书等文本内容...", en: "Paste project docs, whitepaper, etc." },
  "submit.section3": { zh: "文件上传 (File Upload)", en: "File Upload" },
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
  "submit.validateGithub": { zh: "GitHub 链接格式不正确", en: "Invalid GitHub URL format" },
  "submit.validateDemo": { zh: "Demo 链接格式不正确", en: "Invalid Demo URL format" },
  "submit.submitFail": { zh: "提交失败，请检查网络或稍后重试", en: "Submission failed. Please check your network or try again later." },
  "submit.submitSuccess": { zh: "🎉 项目提交成功！", en: "🎉 Project submitted successfully!" },

  // Ranking page
  "ranking.title": { zh: "📊 项目排名", en: "📊 Project Rankings" },
  "ranking.note": { zh: "仅可查看排名列表；查看自己项目的 AI 评分与详情请使用提交成功后收到的「我的项目」链接。", en: "View-only rankings. To see your own AI scores & details, use the \"My Project\" link received after submission." },
  "ranking.tableTitle": { zh: "🏆 终焉大盘：逻辑生存率排行榜", en: "🏆 Final Leaderboard: Logic Survival Rate" },
  "ranking.rank": { zh: "RANK", en: "RANK" },
  "ranking.projectDoc": { zh: "项目文档", en: "Project Doc" },
  "ranking.survivalRate": { zh: "逻辑生存率", en: "Survival Rate" },
  "ranking.timestamp": { zh: "存证时间", en: "Timestamp" },
  "ranking.loading": { zh: "正在同步金库协议历史存证...", en: "Syncing vault protocol attestations..." },
  "ranking.empty": { zh: "VOID_DATA", en: "VOID_DATA" },

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
  "my.systemRanking": { zh: "系统排名", en: "System Rankings" },
  "my.rankingNote": { zh: "你可看到全部项目的排名；仅你自己的项目可点击查看详情。", en: "You can see all project rankings; only your own projects are clickable for details." },
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
  "judge.batchBtn": { zh: "批量裁决 (BATCH EXECUTE)", en: "Batch Judge (EXECUTE)" },
  "judge.batchRunning": { zh: "▶ 批量裁决中...", en: "▶ Batch judging..." },
  "judge.stopBtn": { zh: "停止批量 (STOP)", en: "Stop Batch" },
  "judge.waitingInput": { zh: "等待指令流输入...", en: "Waiting for input..." },

  // FileSelector
  "fileSelector.label": { zh: "1. 目标文档 (Target Document Selection)", en: "1. Target Document Selection" },
  "fileSelector.loading": { zh: "正在调取服务器文件列表...", en: "Loading file list from server..." },
  "fileSelector.note": { zh: "单文件裁决仍可用；批量裁决会自动处理", en: "Single file judging still available; batch will auto-process" },
  "fileSelector.noteDir": { zh: "下全部未分析文件。", en: "all unanalyzed files." },

  // PromptEditor
  "promptEditor.label": { zh: "2. 注入审计指令 (Audit Command Injection)", en: "2. Audit Command Injection" },

  // ModelSelector
  "modelSelector.label": { zh: "3. 召唤裁决官 (Consulting LLM Clusters)", en: "3. Select LLM Judges" },

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
  "admin.confirmDelete": { zh: "确认删除项目「{title}」？此操作不可撤销。", en: "Delete project \"{title}\"? This action cannot be undone." },
  "admin.relatedDocs": { zh: "关联文档", en: "Related Docs" },
  "admin.redirecting": { zh: "正在跳转到首页…", en: "Redirecting to home..." },

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
  "rounds.leaderboardPreview": { zh: "排行榜预览", en: "Leaderboard Preview" },
  "rounds.projectName": { zh: "项目名称", en: "Project Name" },
  "rounds.score": { zh: "评分", en: "Score" },
  "rounds.projectsPlaceholder": { zh: "项目列表功能即将上线", en: "Project list coming soon" },
  "rounds.judgesPlaceholder": { zh: "评委管理功能即将上线", en: "Judge management coming soon" },
  "rounds.exportsPlaceholder": { zh: "导出功能即将上线", en: "Export feature coming soon" },
  "nav.rounds": { zh: "📅 轮次管理", en: "📅 Rounds" },
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
  "rules.activated": { zh: "已激活", en: "Activated" },
  "rules.deleted": { zh: "已删除", en: "Deleted" },
  "rules.uploadSuccess": { zh: "上传成功", en: "Upload successful" },
  "rules.noVersions": { zh: "暂无版本记录", en: "No versions yet" },
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
    const saved = localStorage.getItem("lang");
    return saved === "en" ? "en" : "zh";
  });

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === "zh" ? "en" : "zh";
      localStorage.setItem("lang", next);
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
