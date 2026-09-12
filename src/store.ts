import { execRun } from "./caps";
import { copy, getHostCtx } from "./host";
import type { Diagnostic, Report } from "./report";

/**
 * 体检运行状态机 + useSyncExternalStore 快照源（word-count/kimi-lb 同款
 * 模块级 store 模式）。面板订阅渲染；结果持久化到 ctx.storage，重开面板
 * 即恢复上次报告。
 *
 * 报告获取走「--json-out 落盘 + node 分页读取」：桥的 stdout 截断 64KB，
 * 真实项目的 compact JSON 动辄数百 KB，直接读 stdout 必然解析失败。
 * --json-out 时 react-doctor 把报告（含错误报告）只写文件、不写 stdout，
 * 再用 node -e 分 ≤50 条/页读出（每页 ~30KB，安全），总量封顶 300 条。
 */

export type RunPhase = "idle" | "running" | "done" | "error";

export interface RunState {
  phase: RunPhase;
  /** 当前工作区；activate 后由面板写入。 */
  workspacePath: string;
  /** 最近一次成功解析的报告（含从存储恢复的）。 */
  report: Report | null;
  /** 报告对应的精简 JSON 文本（供「原始输出」折叠区）。 */
  rawOutput: string;
  /** 报告完成时间（epoch ms）；null = 从未运行。 */
  ranAt: number | null;
  /** running 阶段的起始时间，驱动秒表。 */
  startedAt: number | null;
  /** error 阶段的信息（已本地化）。 */
  errorMessage: string | null;
  /** 持久化恢复是否完成（避免闪烁空态）。 */
  hydrated: boolean;
}

interface StoredResult {
  workspacePath: string;
  report: Report;
  rawOutput: string;
  ranAt: number;
}

const STORAGE_KEY = "last-result";
const RUN_TIMEOUT_MS = 300_000;
/** 诊断分页参数与总量上限：50 条/页 ≈ 30KB（< 64KB 桥截断），最多 6 页。 */
const PAGE_SIZE = 50;
const DIAG_TOTAL_CAP = 300;
const REPORT_FILENAME = "ccgui-react-doctor-report.json";

/** 摘要提取脚本：只留面板需要的字段 + 诊断总数（诊断本体走分页脚本）。 */
const SUMMARY_SCRIPT = `
const fs = require("fs");
const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const diags = Array.isArray(r.diagnostics) ? r.diagnostics : [];
process.stdout.write(JSON.stringify({
  schemaVersion: r.schemaVersion, ok: r.ok, version: r.version,
  reactDetected: r.reactDetected, summary: r.summary,
  elapsedMilliseconds: r.elapsedMilliseconds, error: r.error,
  diagnosticCount: diags.length,
}));
`;

/** 分页提取脚本：argv = 文件、offset、limit；长字符串截断到 280 字符。 */
const PAGE_SCRIPT = `
const fs = require("fs");
const [file, off, lim] = [process.argv[1], +process.argv[2], +process.argv[3]];
const r = JSON.parse(fs.readFileSync(file, "utf8"));
const cut = (s) => (typeof s === "string" && s.length > 280 ? s.slice(0, 280) + "…" : s);
const diags = Array.isArray(r.diagnostics) ? r.diagnostics : [];
process.stdout.write(JSON.stringify(diags.slice(off, off + lim).map((d) => ({
  filePath: d.normalizedFilePath ?? d.filePath,
  normalizedFilePath: d.normalizedFilePath ?? d.filePath,
  plugin: d.plugin, rule: d.rule, severity: d.severity,
  title: cut(d.title), message: cut(d.message), help: cut(d.help),
  line: d.line, column: d.column, category: d.category,
}))));
`;

let state: RunState = {
  phase: "idle",
  workspacePath: "",
  report: null,
  rawOutput: "",
  ranAt: null,
  startedAt: null,
  errorMessage: null,
  hydrated: false,
};

const listeners = new Set<() => void>();

function setState(patch: Partial<RunState>): void {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

export const runStore = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get: (): RunState => state,
};

/** activate 后由面板调用：恢复上次结果（仅当工作区一致时沿用展示）。 */
export async function hydrate(workspacePath: string): Promise<void> {
  // 运行中不碰状态（切 tab 重挂载不得打断）；同工作区已恢复过则跳过
  // （内存里的报告可能比存储里的新）。
  if (state.phase === "running") return;
  if (state.hydrated && state.workspacePath === workspacePath) return;
  setState({ workspacePath });
  try {
    const stored = await getHostCtx().storage.get<StoredResult>(STORAGE_KEY);
    if (stored?.report && stored.workspacePath === workspacePath) {
      setState({
        phase: "done",
        report: stored.report,
        rawOutput: stored.rawOutput ?? "",
        ranAt: stored.ranAt ?? null,
        hydrated: true,
      });
      return;
    }
  } catch {
    /* 存储读取失败不阻塞面板 */
  }
  setState({ hydrated: true });
}

/** 会话级缓存的临时目录（node 恒随 npx 存在，探测失败由调用方兜底）。 */
let cachedTmpDir: string | null = null;

async function reportFilePath(): Promise<string> {
  if (!cachedTmpDir) {
    const r = await execRun("node", ["-e", 'process.stdout.write(require("os").tmpdir())'], 10_000);
    if (r.code !== 0 || !r.stdout.trim()) throw new Error("node tmpdir probe failed");
    cachedTmpDir = r.stdout.trim();
  }
  return `${cachedTmpDir}/${REPORT_FILENAME}`;
}

let runSeq = 0;

/** 运行体检：npx react-doctor@latest --json --json-compact --json-out <tmp>。
 *  退出码非 0 ≠ 失败（发现 error 级问题时 CI 语义返回非 0），
 *  一切以报告文件能否读出为准。 */
export async function runScan(): Promise<void> {
  if (state.phase === "running") return;
  const t = copy(getHostCtx().host.locale);
  const seq = ++runSeq;
  const workspacePath = state.workspacePath;
  // 运行即清空上次结果：running 期间面板不得继续展示旧报告（用户会误以为
  // 是本次结果）；失败时也不回显旧报告，只显示错误提示。
  setState({ phase: "running", startedAt: Date.now(), errorMessage: null, report: null, rawOutput: "" });

  const finish = (patch: Partial<RunState>) => {
    if (seq === runSeq) setState(patch);
  };
  const fail = (message: string, rawOutput: string) =>
    finish({ phase: "error", startedAt: null, ranAt: Date.now(), errorMessage: message, rawOutput });

  let reportPath: string;
  try {
    reportPath = await reportFilePath();
  } catch (err) {
    fail(t.errNpxMissing, err instanceof Error ? err.message : String(err));
    return;
  }

  let scanStderr = "";
  try {
    const r = await execRun(
      "npx",
      [
        "-y",
        "react-doctor@latest",
        "--json",
        "--json-compact",
        "--no-color",
        "--json-out",
        reportPath,
        workspacePath || ".",
      ],
      RUN_TIMEOUT_MS,
    );
    scanStderr = r.stderr;
    if (r.code === null) {
      fail(t.errTimeout, r.stderr || r.stdout);
      return;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(/not found|resolve|missing exec|ENOENT/i.test(msg) ? t.errNpxMissing : t.errScan(msg), msg);
    return;
  }

  // 读摘要（错误报告同样落在文件里，ok:false + error payload）。
  interface SummaryPayload extends Omit<Report, "diagnostics"> {
    diagnosticCount: number;
  }
  let head: SummaryPayload;
  try {
    const r = await execRun("node", ["-e", SUMMARY_SCRIPT, reportPath], 15_000);
    if (r.code !== 0) throw new Error(r.stderr.trim() || `exit ${r.code}`);
    head = JSON.parse(r.stdout) as SummaryPayload;
    if (!head.summary) throw new Error("missing summary");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(t.errScan(msg.slice(0, 300)), scanStderr || msg);
    return;
  }

  if (head.error || !head.ok) {
    const msg = head.error?.message ?? head.error?.reason?.message ?? t.errUnknown;
    fail(t.errScan(msg), scanStderr);
    return;
  }

  // 分页拉诊断（封顶 DIAG_TOTAL_CAP；超出在 UI 标注）。
  const total = head.diagnosticCount;
  const target = Math.min(total, DIAG_TOTAL_CAP);
  const diagnostics: Diagnostic[] = [];
  try {
    for (let off = 0; off < target; off += PAGE_SIZE) {
      const r = await execRun(
        "node",
        ["-e", PAGE_SCRIPT, reportPath, String(off), String(Math.min(PAGE_SIZE, target - off))],
        15_000,
      );
      if (r.code !== 0) throw new Error(r.stderr.trim() || `exit ${r.code}`);
      const page = JSON.parse(r.stdout) as Diagnostic[];
      if (!Array.isArray(page)) throw new Error("bad page");
      diagnostics.push(...page);
      if (page.length < Math.min(PAGE_SIZE, target - off)) break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(t.errParse, msg);
    return;
  }

  const report: Report = { ...head, diagnostics };
  const ranAt = Date.now();
  const rawOutput = JSON.stringify(report);
  finish({ phase: "done", startedAt: null, report, rawOutput, ranAt });

  const capped: StoredResult = { workspacePath, ranAt, rawOutput: rawOutput.slice(0, 32_768), report };
  void getHostCtx()
    .storage.set(STORAGE_KEY, capped)
    .catch(() => {
      /* 持久化失败不影响展示 */
    });
}
