/**
 * react-doctor `--json --json-compact` 报告（schemaVersion 3）的类型与解析。
 * 事实源：dist 里 buildJsonReport/summarizeDiagnostics + 对真实项目实测。
 */

export type Severity = "error" | "warning";

export interface Diagnostic {
  filePath: string;
  normalizedFilePath: string;
  plugin: string;
  rule: string;
  severity: Severity | string;
  title: string;
  message: string;
  help?: string;
  line: number;
  column: number;
  category?: string;
  tags?: string[];
}

export interface ReportSummary {
  errorCount: number;
  warningCount: number;
  affectedFileCount: number;
  totalDiagnosticCount: number;
  score: number | null;
  scoreLabel: string | null;
}

export interface Report {
  schemaVersion: number;
  ok: boolean;
  version: string;
  reactDetected?: boolean;
  summary: ReportSummary;
  /** 已拉取的诊断（分页，封顶 300 条）。 */
  diagnostics: Diagnostic[];
  /** 报告里的诊断总数；> diagnostics.length 时表示被分页截断。 */
  diagnosticCount: number;
  elapsedMilliseconds: number;
  error: { message?: string; reason?: { message?: string } } | null;
}

export interface FileGroup {
  file: string;
  errorCount: number;
  warningCount: number;
  items: Diagnostic[];
}

/** 按文件分组：错误多的文件靠前，同组内按行号排序。 */
export function groupByFile(diagnostics: Diagnostic[]): FileGroup[] {
  const map = new Map<string, FileGroup>();
  for (const d of diagnostics) {
    const key = d.normalizedFilePath || d.filePath || "(unknown)";
    let g = map.get(key);
    if (!g) {
      g = { file: key, errorCount: 0, warningCount: 0, items: [] };
      map.set(key, g);
    }
    if (d.severity === "error") g.errorCount++;
    else g.warningCount++;
    g.items.push(d);
  }
  const groups = [...map.values()];
  for (const g of groups) g.items.sort((a, b) => a.line - b.line || a.column - b.column);
  groups.sort((a, b) => b.errorCount - a.errorCount || b.warningCount - a.warningCount || a.file.localeCompare(b.file));
  return groups;
}

/** 评分颜色档位：>=90 绿 / >=70 黄 / 其余红。 */
export function scoreTone(score: number | null): "ok" | "warn" | "bad" | "none" {
  if (score === null) return "none";
  if (score >= 90) return "ok";
  if (score >= 70) return "warn";
  return "bad";
}
/** 「一键修复」填入聊天输入框的提示词：头部统计 + 按文件分组的清单 + 结尾指令。
 *  顺序刻意如此——suffix（"帮我修复上述问题"）的"上述"回指上方清单。
 *  诊断字符串在提取期已截断（280 字符），总量封顶 300 条，此处不再重复限制。 */
export function buildFixPrompt(
  report: Report,
  header: string,
  suffix: string,
  truncatedNote?: string,
): string {
  const parts: string[] = [header, ""];
  if (truncatedNote) parts.push(truncatedNote, "");
  for (const g of groupByFile(report.diagnostics)) {
    parts.push(`## ${g.file}`, "");
    g.items.forEach((d, i) => {
      const sev = d.severity === "error" ? "error" : "warn";
      parts.push(`${i + 1}. [${sev}] ${d.line}:${d.column} · ${d.plugin}/${d.rule} — ${d.title}`);
      if (d.message && d.message !== d.title) parts.push(`   ${d.message}`);
      if (d.help) parts.push(`   → ${d.help}`);
    });
    parts.push("");
  }
  parts.push(suffix);
  return parts.join("\n");
}
