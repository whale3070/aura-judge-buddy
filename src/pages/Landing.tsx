import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background p-5 relative overflow-hidden">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-transparent to-primary/[0.03] animate-scanline" />
      </div>

      <div className="max-w-[800px] mx-auto relative z-10">
        <div className="border border-primary/40 p-8 shadow-[0_0_30px_hsl(var(--primary)/0.1)] bg-card">
          <h1 className="text-center text-3xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)] mb-2">
            ⚖️ 阿乌拉裁决系统
          </h1>
          <p className="text-center text-sm text-muted-foreground mb-8 pb-4 border-b border-border">
            Aura Judgement System — 黑客松项目量化评分 · 全流程智能裁决引擎
          </p>

          {/* 一、系统是什么 */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-foreground border-l-4 border-primary pl-3 mb-3">
              系统是什么
            </h2>
            <p className="text-sm text-foreground/90 leading-relaxed">
              <strong>阿乌拉裁决系统</strong>是一套面向黑客松 / 科创大赛的<strong>全流程自动化评审系统</strong>。
              用「Golang + 分层 AI」实现：项目材料自动量化打分、多模型评审、排名与存证，
              从提交到出分全自动，<strong>效率提升、成本可控、结果可追溯</strong>。
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              一句话：用 AI 自动看完项目文档并打分，让评委把时间花在真正需要人工判断的地方，绝不漏掉优质黑马项目。
            </p>
          </section>

          {/* 二、目标是什么 */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-foreground border-l-4 border-primary pl-3 mb-3">
              目标是什么
            </h2>
            <ul className="text-sm text-foreground/90 space-y-2 list-disc list-inside">
              <li><strong>提升评审效率</strong>：一场黑客松几百个项目，系统自动初筛与打分，评委聚焦高分与争议项。</li>
              <li><strong>评分更客观</strong>：多维度量化 + 多模型交叉评分，减少人情分、疲劳分，结果更可解释。</li>
              <li><strong>发现黑马项目</strong>：技术强但表达弱的项目，通过文档与数据指标被系统识别出来。</li>
              <li><strong>降低成本</strong>：分层 AI（低成本模型初筛 + 高价值模型深度评审），总成本可控。</li>
              <li><strong>公平透明</strong>：规则公开、过程可追溯，评分与报告可存证。</li>
            </ul>
          </section>

          {/* 三、提交项目后会给出什么 */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-foreground border-l-4 border-primary pl-3 mb-3">
              提交项目后会给出什么
            </h2>
            <p className="text-sm text-foreground/90 mb-3">
              当你通过本站在线提交项目（填写表单 + 可选上传文档 + GitHub 链接）后，系统会自动完成以下流程：
            </p>
            <ol className="text-sm text-foreground/90 space-y-2 list-decimal list-inside">
              <li><strong>自动拉取仓库</strong>：若填写了 GitHub 链接，系统会 clone 仓库并解析其中的 <code className="bg-muted px-1 rounded">.md</code> 文档。</li>
              <li><strong>AI 自动评审</strong>：对项目文档进行多维度打分（技术创新性、可行性、完成度等），支持多模型（如 DeepSeek 等）并行或分层评审。</li>
              <li><strong>生成评审报告</strong>：每个文档得到详细评语与 0–100 分，并自动计算平均分。</li>
              <li><strong>参与排名</strong>：你的项目会进入「项目排名」榜单，与其它已评审项目按分数排序，公开可查。</li>
              <li><strong>存证与追溯</strong>：评分结果以 JSON 存证保存，可后续复核、导出或用于路演/终审参考。</li>
            </ol>
            <p className="text-sm text-muted-foreground mt-3">
              简而言之：<strong>提交 → 自动解析与评审 → 得到分数、报告与排名</strong>，全程无需人工介入初审。
            </p>
          </section>

          {/* CTA */}
          <div className="flex flex-wrap gap-4 justify-center pt-6 border-t border-border">
            <Link
              to="/submit"
              className="inline-flex items-center justify-center bg-primary text-primary-foreground font-bold px-8 py-4 text-sm tracking-wider hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] transition-all"
            >
              📋 去提交项目 (SUBMIT PROJECT)
            </Link>
            <Link
              to="/ranking"
              className="inline-flex items-center justify-center border-2 border-primary/50 text-primary font-bold px-8 py-4 text-sm tracking-wider hover:bg-primary/10 transition-all"
            >
              📊 查看项目排名 (RANKING)
            </Link>
          </div>

          <div className="mt-6 text-center">
            <Link to="/judge" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              裁决系统（单文件/批量评审） →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
