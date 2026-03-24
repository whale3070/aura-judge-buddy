import { Link } from "react-router-dom";

const RANKING_PATH = "/ranking?round_id=polkadot-mini-hackathon-2026-03";

/** 首页文末：Polkadot 迷你黑客松实测分析（不出现在 /ranking 等其它路由） */
export default function PolkadotHackathonArticle() {
  return (
    <section className="max-w-4xl mx-auto border border-primary/30 bg-card/80 p-6 sm:p-8 shadow-[0_0_24px_hsl(var(--primary)/0.08)] text-sm leading-relaxed text-foreground/90">
      <h2 className="text-lg sm:text-xl font-display font-bold text-primary mb-4">
        从昙花一现到长效落地：Aura 系统重构黑客松项目评估逻辑——基于实测项目数据的对比分析
      </h2>

      <div className="border-l-4 border-primary bg-primary/5 px-4 py-3 mb-5 text-foreground/90">
        <p>
          <span className="text-primary font-semibold">核心观点</span>：同一批项目下，<strong>人工综合三甲的排序 ≠ Aura 文档五维合计排序</strong>
          。人工评审天然侧重<strong>现场展示、叙事与主题贴合</strong>；Aura 侧重
          <strong>README/存证里可解析的商业价值与落地可行性</strong>。两者不是谁取代谁，而是
          <strong>Aura 用可追溯的量化补上人工在「文档侧长期交付潜力」上的盲区</strong>，让评审更全面。
        </p>
      </div>

      <p className="font-semibold text-foreground mb-2">数据出处</p>
      <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-5">
        <li>
          <Link to={RANKING_PATH} className="text-primary hover:underline">
            Aura 项目排名 · polkadot-mini-hackathon-2026-03
          </Link>
          <span className="text-muted-foreground">（</span>
          <code className="text-xs bg-muted px-1 rounded">round_id=polkadot-mini-hackathon-2026-03</code>
          <span className="text-muted-foreground">）</span>
        </li>
        <li>
          下表分数以当时存证为准；<strong className="text-foreground">本文仅针对该轮次 13 个样本</strong>，不外推到其他赛事。
        </li>
      </ul>

      <hr className="border-border my-6" />

      <p className="mb-6">
        黑客松里常见矛盾：评委时间有限，印象往往来自 <strong>Demo 与路演</strong>；而 <strong>能否交付、能否商业化</strong>{" "}
        更多写在文档与代码里，现场未必展开。Aura 做的事，就是把后者 <strong>拉成同一套标尺、留痕可复盘</strong>。
      </p>

      <h3 className="text-base font-bold border-l-4 border-primary pl-3 mb-3">一、样本与口径</h3>
      <ul className="list-disc list-inside space-y-2 mb-6 text-muted-foreground">
        <li>
          <strong className="text-foreground">Aura</strong>
          ：五维（创新性、技术实现、商业价值、用户体验、落地可行性）各 <strong>0–20</strong>
          ，多模型取平均；档位 <strong>S/A/B/C/D/?</strong>（下表仅出现 A/B/D 样本）。
          <strong>五维合计</strong>为五维相加；排名页 <code className="text-xs bg-muted px-1 rounded">avg_score（0–100）</code>{" "}
          为另一指标，勿与五维合计混用。
        </li>
        <li>
          <strong className="text-foreground">人工</strong>：综合三甲、最佳团队、最勤劳开发者等，
          <strong>无</strong>与 Aura 逐项对齐的固定标尺。
        </li>
      </ul>

      <h4 className="font-semibold mb-2">核心样本（五维合计 vs 人工结果）</h4>
      <div className="overflow-x-auto mb-2 border border-border rounded-md">
        <table className="w-full text-xs sm:text-sm border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-muted/80">
              <th className="border border-border p-2 text-left">项目名称</th>
              <th className="border border-border p-2 text-left">Aura 档位*</th>
              <th className="border border-border p-2 text-left">创新性</th>
              <th className="border border-border p-2 text-left">技术实现</th>
              <th className="border border-border p-2 text-left">商业价值</th>
              <th className="border border-border p-2 text-left">用户体验</th>
              <th className="border border-border p-2 text-left">落地可行性</th>
              <th className="border border-border p-2 text-left">五维合计/100**</th>
              <th className="border border-border p-2 text-left">人工评选结果</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr>
              <td className="border border-border p-2">FireflyQR</td>
              <td className="border border-border p-2">A</td>
              <td className="border border-border p-2">18.0</td>
              <td className="border border-border p-2">17.0</td>
              <td className="border border-border p-2">18.0</td>
              <td className="border border-border p-2">17.0</td>
              <td className="border border-border p-2">19.0</td>
              <td className="border border-border p-2 font-semibold text-foreground">89.0</td>
              <td className="border border-border p-2">最佳开发团队奖</td>
            </tr>
            <tr>
              <td className="border border-border p-2">human-ai-battle</td>
              <td className="border border-border p-2">A</td>
              <td className="border border-border p-2">18.0</td>
              <td className="border border-border p-2">16.5</td>
              <td className="border border-border p-2">13.5</td>
              <td className="border border-border p-2">16.0</td>
              <td className="border border-border p-2">13.5</td>
              <td className="border border-border p-2 font-semibold text-foreground">77.5</td>
              <td className="border border-border p-2 font-semibold text-foreground">综合冠军</td>
            </tr>
            <tr>
              <td className="border border-border p-2">Polk2.0-Revive-Hackathon-Lifepp（life++）</td>
              <td className="border border-border p-2">A</td>
              <td className="border border-border p-2">17.0</td>
              <td className="border border-border p-2">18.0</td>
              <td className="border border-border p-2">16.0</td>
              <td className="border border-border p-2">17.0</td>
              <td className="border border-border p-2">18.0</td>
              <td className="border border-border p-2 font-semibold text-foreground">86.0</td>
              <td className="border border-border p-2">综合亚军</td>
            </tr>
            <tr>
              <td className="border border-border p-2">Subvote</td>
              <td className="border border-border p-2">A</td>
              <td className="border border-border p-2">17.0</td>
              <td className="border border-border p-2">13.5</td>
              <td className="border border-border p-2">16.0</td>
              <td className="border border-border p-2">16.0</td>
              <td className="border border-border p-2">14.5</td>
              <td className="border border-border p-2 font-semibold text-foreground">77.0</td>
              <td className="border border-border p-2">综合季军</td>
            </tr>
            <tr>
              <td className="border border-border p-2">Willbook</td>
              <td className="border border-border p-2">B</td>
              <td className="border border-border p-2" colSpan={5}>
                （未公示各维）
              </td>
              <td className="border border-border p-2">（未公示）</td>
              <td className="border border-border p-2">最勤劳开发者（提名）、未进三甲</td>
            </tr>
            <tr>
              <td className="border border-border p-2">1886_pixi-ace-air-combat</td>
              <td className="border border-border p-2">D</td>
              <td className="border border-border p-2" colSpan={5}>
                （未公示各维）
              </td>
              <td className="border border-border p-2">（未公示）</td>
              <td className="border border-border p-2">淘汰、无奖项</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mb-6">
        * 完整分档见排名页说明。** 五维合计满分 100。
      </p>

      <hr className="border-border my-6" />

      <h3 className="text-base font-bold border-l-4 border-primary pl-3 mb-3">二、错在哪：人工三甲 vs Aura 五维合计</h3>
      <p className="mb-4">
        <strong>一句话</strong>：本批数据中，<strong>五维合计最高的 FireflyQR（89）没进综合前三</strong>；
        <strong>冠军 human-ai-battle（77.5）的商业与落地仅 13.5</strong>，低于 FireflyQR 的 <strong>18 / 19</strong>
        。人工把更高名次给了 <strong>现场与故事更抢眼</strong> 的项目，
        <strong>没有把「文档上的商业+落地强度」同步进综合排序</strong>——这就是 <strong>两套尺子</strong>。
      </p>
      <ol className="list-decimal list-inside space-y-2 mb-4 text-muted-foreground">
        <li>
          <strong className="text-foreground">量化第一 ≠ 综合前三</strong>
          ：FireflyQR 商业 18、落地 19，全场五维合计最高，人工仅授「最佳开发团队」。冠军合计低 <strong>11.5 分</strong>
          ，商业、落地差距尤其大。
        </li>
        <li>
          <strong className="text-foreground">三甲内部也不按五维排</strong>
          ：life++ 合计 <strong>86</strong> 高于冠军 <strong>77.5</strong>，仍是亚军；季军 Subvote 合计 77、技术实现{" "}
          <strong>13.5</strong>。说明人工精排另有标准（赛道、现场、叙事权重等），
          <strong>与五维合计无固定对应</strong>。
        </li>
        <li>
          <strong className="text-foreground">粗筛仍可对齐</strong>
          ：D 档无奖、B 档 Willbook 未进三甲——<strong>低档位与「不进核心奖」</strong>大体一致；矛盾集中在{" "}
          <strong>三甲怎么排</strong>。
        </li>
      </ol>
      <p className="mb-6 text-muted-foreground">
        <strong className="text-foreground">对赛事主办与评委的含义</strong>
        ：若希望「大奖名单」与「文档里体现的交付与商业潜力」更一致，就需要{" "}
        <strong>显式引入文档量化或对照环节</strong>。Aura 提供的就是：
        <strong>同一规则、多模型、可导出、可审计</strong> 的五维分与档位，适合 <strong>初筛、榜外对照、复盘争议</strong>
        ，而不是代替评委拍板。
      </p>

      <hr className="border-border my-6" />

      <h3 className="text-base font-bold border-l-4 border-primary pl-3 mb-3">三、Aura 补什么位（价值锚点）</h3>
      <div className="overflow-x-auto mb-4 border border-border rounded-md">
        <table className="w-full text-xs sm:text-sm border-collapse min-w-[520px]">
          <thead>
            <tr className="bg-muted/80">
              <th className="border border-border p-2 text-left">人工侧常见痛点</th>
              <th className="border border-border p-2 text-left">Aura 补什么</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr>
              <td className="border border-border p-2">印象分、疲劳、口径难统一</td>
              <td className="border border-border p-2">
                <strong className="text-foreground">多模型 + YAML 规则</strong>，同一套维度反复跑，结果落在{" "}
                <code className="text-xs bg-muted px-1 rounded">judge-result</code> <strong>可复查</strong>
              </td>
            </tr>
            <tr>
              <td className="border border-border p-2">现场强、文档弱的项目易被高估</td>
              <td className="border border-border p-2">
                从 README/材料里 <strong>显式打出商业价值、落地可行性</strong>，与「会不会讲」脱钩一层
              </td>
            </tr>
            <tr>
              <td className="border border-border p-2">项目多、评委看不完</td>
              <td className="border border-border p-2">
                <strong>大批量自动分档与排名</strong>，把人力留给边界案例与综合判断
              </td>
            </tr>
            <tr>
              <td className="border border-border p-2">赛后扯皮「当时怎么评的」</td>
              <td className="border border-border p-2">
                <strong>存证 JSON</strong>，规则版本可查
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mb-6 text-muted-foreground">
        <strong className="text-foreground">边界一句话</strong>：<strong>颁奖规则、资源给谁、最终谁赢</strong> 仍是{" "}
        <strong>赛制 + 人</strong>；Aura 是 <strong>数据层工具</strong>，和现场评审 <strong>并列使用</strong> 最顺。
      </p>

      <hr className="border-border my-6" />

      <h3 className="text-base font-bold border-l-4 border-primary pl-3 mb-3">四、线上能力速览</h3>
      <ul className="list-disc list-inside space-y-2 mb-6 text-muted-foreground">
        <li>
          五维解析、<strong>S/A/B/C/D/?</strong> 分档、排名页 <strong>规则版本筛选</strong>（与管理员控制台口径可对齐）。
        </li>
        <li>
          可选 <strong>擂台两两对决</strong>，结果可同步服务端：
          <code className="text-xs bg-muted px-1 rounded mx-1">submissions/&lt;round_id&gt;/.aura_duel_bracket_snapshot.json</code>。
        </li>
        <li>
          讨论中的「自定义维度权重」属 <strong>路线图</strong>，<strong>当前线上</strong>以 <strong>五维达标阶梯</strong> 划档。
        </li>
      </ul>

      <hr className="border-border my-6" />

      <h3 className="text-base font-bold border-l-4 border-primary pl-3 mb-2">五、总结</h3>
      <p className="text-muted-foreground">
        本批 Polkadot 迷你黑客松里，<strong className="text-foreground">人工综合三甲与 Aura 五维合计明显错位</strong>
        ——根子是 <strong className="text-foreground">评审场景不同：现场叙事 vs 文档量化</strong>。
        <strong className="text-foreground">Aura 的价值</strong>不是否定评委，而是{" "}
        <strong>用可追溯的 AI 量化把「落地与商业」钉在纸上</strong>，与人工互补，
        <strong>减少只看现场、不看交付潜力的评审盲区</strong>。以上结论{" "}
        <strong>仅对本表 13 个项目与上述轮次有效</strong>。
      </p>
    </section>
  );
}
