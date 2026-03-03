import { useMemo, useState } from "react";
import type { RankingItem } from "@/lib/api";
import JudgeDetail from "@/components/JudgeDetail";

type Grade = "S" | "A" | "B" | "C";

interface GradeConfig {
  grade: Grade;
  label: string;
  range: string;
  desc: string;
  color: string;
  bgClass: string;
  borderClass: string;
  glowClass: string;
}

const GRADES: GradeConfig[] = [
  {
    grade: "S",
    label: "S",
    range: "86–100",
    desc: "顶级经营者，强烈推荐晋级",
    color: "text-primary",
    bgClass: "bg-primary/10",
    borderClass: "border-primary/40",
    glowClass: "shadow-[0_0_15px_hsl(var(--primary)/0.3)]",
  },
  {
    grade: "A",
    label: "A",
    range: "70–85",
    desc: "优质项目，推荐晋级",
    color: "text-secondary",
    bgClass: "bg-secondary/10",
    borderClass: "border-secondary/40",
    glowClass: "shadow-[0_0_15px_hsl(var(--secondary)/0.3)]",
  },
  {
    grade: "B",
    label: "B",
    range: "50–69",
    desc: "可观察，需进一步验证",
    color: "text-warning",
    bgClass: "bg-[hsl(var(--warning)/0.1)]",
    borderClass: "border-[hsl(var(--warning)/0.4)]",
    glowClass: "shadow-[0_0_15px_hsl(var(--warning)/0.2)]",
  },
  {
    grade: "C",
    label: "C",
    range: "0–49",
    desc: "倾向淘汰",
    color: "text-destructive",
    bgClass: "bg-destructive/10",
    borderClass: "border-destructive/40",
    glowClass: "shadow-[0_0_15px_hsl(var(--destructive)/0.2)]",
  },
];

function scoreToGrade(score: number): Grade {
  if (score >= 86) return "S";
  if (score >= 70) return "A";
  if (score >= 50) return "B";
  return "C";
}

interface MergedProject {
  key: string; // display name or file_name
  item: RankingItem;
  title: string;
}

interface Props {
  rankings: RankingItem[];
  loading: boolean;
  titleMap: Record<string, string>;
}

export default function GradeRankingPanel({ rankings, loading, titleMap }: Props) {
  const [expandedGrade, setExpandedGrade] = useState<Grade | null>("S");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Merge duplicates by title, keep highest score
  const mergedProjects = useMemo(() => {
    const projectMap = new Map<string, MergedProject>();
    for (const item of rankings) {
      const title = titleMap[item.file_name] || item.file_name;
      const existing = projectMap.get(title);
      if (!existing || item.avg_score > existing.item.avg_score) {
        projectMap.set(title, { key: title, item, title });
      }
    }
    return Array.from(projectMap.values());
  }, [rankings, titleMap]);

  // Group by grade
  const gradeGroups = useMemo(() => {
    const groups: Record<Grade, MergedProject[]> = { S: [], A: [], B: [], C: [] };
    for (const p of mergedProjects) {
      const g = scoreToGrade(p.item.avg_score);
      groups[g].push(p);
    }
    // Sort each group by score desc
    for (const g of Object.keys(groups) as Grade[]) {
      groups[g].sort((a, b) => b.item.avg_score - a.item.avg_score);
    }
    return groups;
  }, [mergedProjects]);

  const toggleGrade = (g: Grade) => {
    setExpandedGrade(expandedGrade === g ? null : g);
    setSelectedFile(null);
  };

  if (loading) {
    return <div className="text-muted-foreground text-sm py-8 text-center">正在加载排名数据...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex gap-3 flex-wrap mb-2">
        {GRADES.map((gc) => (
          <div
            key={gc.grade}
            className={`flex items-center gap-2 px-3 py-1.5 border ${gc.borderClass} ${gc.bgClass} text-xs`}
          >
            <span className={`font-bold text-sm ${gc.color}`}>{gc.label}</span>
            <span className="text-muted-foreground">{gradeGroups[gc.grade].length} 项目</span>
          </div>
        ))}
        <div className="flex items-center px-3 py-1.5 text-xs text-muted-foreground border border-border">
          共 {mergedProjects.length} 项目
        </div>
      </div>

      {/* Grade sections */}
      {GRADES.map((gc) => {
        const projects = gradeGroups[gc.grade];
        const isOpen = expandedGrade === gc.grade;

        return (
          <div key={gc.grade} className={`border ${gc.borderClass} transition-all ${isOpen ? gc.glowClass : ""}`}>
            {/* Grade header */}
            <button
              onClick={() => toggleGrade(gc.grade)}
              className={`w-full flex items-center justify-between p-4 transition-colors hover:bg-muted/30 ${
                isOpen ? gc.bgClass : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`text-2xl font-display font-bold ${gc.color}`}>{gc.label}</span>
                <div className="text-left">
                  <div className="text-sm font-bold text-foreground/90">
                    {gc.range} 分
                  </div>
                  <div className="text-xs text-muted-foreground">{gc.desc}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-lg font-bold ${gc.color}`}>{projects.length}</span>
                <span className="text-muted-foreground text-lg">{isOpen ? "▼" : "▶"}</span>
              </div>
            </button>

            {/* Expanded project list */}
            {isOpen && (
              <div className="border-t border-border/50">
                {projects.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">该等级暂无项目</div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {projects.map((p, i) => {
                      const isSelected = selectedFile === p.item.file_name;
                      return (
                        <div key={p.key}>
                          <button
                            onClick={() => setSelectedFile(isSelected ? null : p.item.file_name)}
                            className={`w-full flex items-center gap-4 p-4 text-left transition-colors ${
                              isSelected
                                ? `${gc.bgClass} border-l-2 ${gc.borderClass}`
                                : "hover:bg-muted/20"
                            }`}
                          >
                            <span className="text-muted-foreground text-sm w-8 shrink-0">
                              #{i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-foreground/90 truncate">
                                {p.title}
                              </div>
                              {p.title !== p.item.file_name && (
                                <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                                  {p.item.file_name}
                                </div>
                              )}
                            </div>
                            <div className={`text-lg font-bold shrink-0 ${gc.color}`}>
                              {p.item.avg_score.toFixed(1)}
                            </div>
                            <div className="text-xs text-muted-foreground shrink-0 w-36 text-right">
                              {new Date(p.item.timestamp).toLocaleString()}
                            </div>
                            <span className="text-muted-foreground shrink-0">
                              {isSelected ? "▼" : "▶"}
                            </span>
                          </button>

                          {/* Inline detail */}
                          {isSelected && (
                            <div className="px-4 pb-4">
                              <JudgeDetail
                                fileName={p.item.file_name}
                                onClose={() => setSelectedFile(null)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
