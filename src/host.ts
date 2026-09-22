import type { PluginContext } from "./ccgui-plugin";

/**
 * 模块级宿主 ctx 持有（kimi-lb 同款模式）：activate 时注入，
 * 卸载 disposer 里清空。bridge/storage 封装统一从这里取。
 */
let hostCtx: PluginContext | null = null;

export function setHostCtx(ctx: PluginContext | null): void {
  hostCtx = ctx;
}

export function getHostCtx(): PluginContext {
  if (!hostCtx) throw new Error("react-doctor: host context not set（插件未激活）");
  return hostCtx;
}

/** 面板文案契约（插件自带，不经宿主 i18n）。 */
export interface Copy {
  tabLabel: string;
  title: string;
  subtitle: string;
  runBtn: string;
  runningBtn: (sec: number) => string;
  runningHint: string;
  statusIdle: string;
  statusRunning: string;
  statusDone: string;
  statusError: string;
  emptyTitle: string;
  emptyBody: string;
  scoreTitle: string;
  statErrors: string;
  statWarnings: string;
  statFiles: string;
  statElapsed: (sec: string) => string;
  noIssues: string;
  findingsTitle: string;
  moreItems: (n: number) => string;
  lineCol: (line: number, col: number) => string;
  rawTitle: string;
  copyBtn: string;
  copied: string;
  lastRun: (time: string) => string;
  versionLabel: (v: string) => string;
  errNpxMissing: string;
  errTimeout: string;
  errParse: string;
  errScan: (msg: string) => string;
  errUnknown: string;
  webOnlyTitle: string;
  webOnlyBody: string;
  fixBtn: string;
  fixOneBtn: string;
  /** 单条修复提示词开头（问题定位与说明之前）。 */
  fixOneHeader: string;
  fixApplied: string;
  /** 修复提示词开头（问题清单之前），带评分与统计。 */
  fixPromptHeader: (score: number | null, total: number, errors: number, warnings: number) => string;
  /** 修复提示词结尾指令（问题清单之后，"上述"回指清单）。 */
  fixPromptSuffix: string;
  truncatedNote: (total: number, shown: number) => string;
}

export function copy(locale: string): Copy {
  if (locale.startsWith("zh")) {
    return {
      tabLabel: "代码体检",
      title: "React Doctor",
      subtitle: "npx react-doctor@latest 全量扫描",
      runBtn: "运行体检",
      runningBtn: (sec) => `体检中… ${sec}s`,
      runningHint: "首次运行 npx 需下载依赖，大项目扫描可能需要几分钟",
      statusIdle: "空闲",
      statusRunning: "运行中",
      statusDone: "完成",
      statusError: "失败",
      emptyTitle: "尚未运行体检",
      emptyBody: "点击「运行体检」对当前工作区执行 react-doctor 扫描，结果会显示在这里。",
      scoreTitle: "健康评分",
      statErrors: "错误",
      statWarnings: "警告",
      statFiles: "涉及文件",
      statElapsed: (sec) => `耗时 ${sec}s`,
      noIssues: "未发现问题，代码很健康。",
      findingsTitle: "问题列表",
      moreItems: (n) => `…还有 ${n} 条未显示`,
      lineCol: (line, col) => `行 ${line}:${col}`,
      rawTitle: "原始输出",
      copyBtn: "复制",
      copied: "已复制",
      lastRun: (time) => `上次运行：${time}`,
      versionLabel: (v) => `react-doctor v${v}`,
      errNpxMissing: "未找到 npx。请先安装 Node.js（含 npm/npx）后重试。",
      errTimeout: "扫描超时（5 分钟）。项目过大或网络缓慢时可稍后重试。",
      errParse: "无法解析扫描结果（输出可能被截断）。请查看原始输出。",
      errScan: (msg) => `扫描失败：${msg}`,
      errUnknown: "未知错误",
      webOnlyTitle: "仅桌面端可用",
      webOnlyBody: "代码体检需要在本机执行 npx 进程，Web 客户端不支持。",
      fixBtn: "一键修复",
      fixOneBtn: "修复",
      fixOneHeader: "以下是 react-doctor 代码体检发现的一个问题：",
      fixApplied: "已填入输入框",
      fixPromptHeader: (score, total, errors, warnings) =>
        `以下是 react-doctor 代码体检发现的问题（健康评分 ${score ?? "—"}/100，共 ${total} 条：${errors} 错误 / ${warnings} 警告）：`,
      fixPromptSuffix: "帮我修复上述问题",
      truncatedNote: (total, shown) => `共 ${total} 条，仅显示前 ${shown} 条`,
    };
  }
  return {
    tabLabel: "Doctor",
    title: "React Doctor",
    subtitle: "npx react-doctor@latest full scan",
    runBtn: "Run Scan",
    runningBtn: (sec) => `Scanning… ${sec}s`,
    runningHint: "First run downloads packages via npx; large projects can take minutes",
    statusIdle: "Idle",
    statusRunning: "Running",
    statusDone: "Done",
    statusError: "Failed",
    emptyTitle: "No scan yet",
    emptyBody: "Run a scan to check this workspace with react-doctor. Results will appear here.",
    scoreTitle: "Health score",
    statErrors: "Errors",
    statWarnings: "Warnings",
    statFiles: "Files",
    statElapsed: (sec) => `took ${sec}s`,
    noIssues: "No issues found. Codebase looks healthy.",
    findingsTitle: "Findings",
    moreItems: (n) => `…${n} more not shown`,
    lineCol: (line, col) => `line ${line}:${col}`,
    rawTitle: "Raw output",
    copyBtn: "Copy",
    copied: "Copied",
    lastRun: (time) => `Last run: ${time}`,
    versionLabel: (v) => `react-doctor v${v}`,
    errNpxMissing: "npx not found. Install Node.js (with npm/npx) and retry.",
    errTimeout: "Scan timed out (5 min). Retry later for very large projects.",
    errParse: "Could not parse the scan report (output may be truncated). See raw output.",
    errScan: (msg) => `Scan failed: ${msg}`,
    errUnknown: "Unknown error",
    webOnlyTitle: "Desktop only",
    webOnlyBody: "Scanning runs a local npx process, unavailable in the web client.",
    fixBtn: "Fix all",
    fixOneBtn: "Fix",
    fixOneHeader: "Issue found by a react-doctor scan:",
    fixApplied: "Copied to composer",
    fixPromptHeader: (score, total, errors, warnings) =>
      `Issues found by a react-doctor scan (health score ${score ?? "—"}/100, ${total} total: ${errors} errors / ${warnings} warnings):`,
    fixPromptSuffix: "Fix all the issues above.",
    truncatedNote: (total, shown) => `${total} total, showing first ${shown}`,
  };
}
