import * as React from "react";
import type { Disposer, PluginContext } from "../src/ccgui-plugin";
import type { Diagnostic } from "../src/report";

/**
 * 浏览器预览用宿主 mock：实现 PluginContext 全量接口，只有面板实际
 * 触碰的能力有真实行为——
 *  - ui.registerPanelTab：捕获注册定义供预览壳渲染；
 *  - bridge.invoke(plugin_exec_run)：node/npx 调用返回罐头报告；
 *  - storage：内存 KV；
 *  - composer.setDraft：写入预览壳底部草稿框；
 *  - host.locale = zh-CN，isWeb = false。
 * 其余注册入口为 no-op。
 */

/** 罐头诊断（react-doctor schemaVersion 3 形状），8 条 / 3 文件 / 3 错 5 警。 */
const MOCK_DIAGNOSTICS: Diagnostic[] = [
  {
    filePath: "src/hooks/useDashboard.ts",
    normalizedFilePath: "src/hooks/useDashboard.ts",
    plugin: "react-hooks",
    rule: "rules-of-hooks",
    severity: "error",
    title: "Hook 在条件分支中调用",
    message:
      "React Hook \"useEffect\" is called conditionally. React Hooks must be called in the exact same order in every component render.",
    help: "把 Hook 调用移到组件顶层，或用条件逻辑包裹 effect 内部代码。",
    line: 24,
    column: 5,
    category: "correctness",
  },
  {
    filePath: "src/hooks/useDashboard.ts",
    normalizedFilePath: "src/hooks/useDashboard.ts",
    plugin: "react-hooks",
    rule: "exhaustive-deps",
    severity: "error",
    title: "useEffect 依赖缺失",
    message: "React Hook useEffect has a missing dependency: 'filters'. Either include it or remove the dependency array.",
    help: "把 filters 加入依赖数组，或用 useMemo 稳定引用。",
    line: 31,
    column: 3,
    category: "correctness",
  },
  {
    filePath: "src/components/UserList.tsx",
    normalizedFilePath: "src/components/UserList.tsx",
    plugin: "react",
    rule: "jsx-key",
    severity: "error",
    title: "列表渲染缺少 key",
    message: "Missing \"key\" prop for element in iterator. Keys help React identify which items have changed.",
    help: "为 map 渲染的元素加稳定唯一的 key（不要用索引）。",
    line: 18,
    column: 11,
    category: "correctness",
  },
  {
    filePath: "src/components/UserList.tsx",
    normalizedFilePath: "src/components/UserList.tsx",
    plugin: "react",
    rule: "jsx-no-bind",
    severity: "warning",
    title: "JSX 属性中内联函数",
    message:
      "JSX props should not use arrow functions; a new function is created on every render and defeats memoization.",
    help: "用 useCallback 提取回调，或在子组件里组装参数。",
    line: 33,
    column: 7,
    category: "performance",
  },
  {
    filePath: "src/components/UserList.tsx",
    normalizedFilePath: "src/components/UserList.tsx",
    plugin: "react",
    rule: "no-array-index-key",
    severity: "warning",
    title: "使用数组索引作为 key",
    message: "Do not use array index in keys; reordering the list will cause state to attach to the wrong items.",
    help: "改用数据项的稳定 id。",
    line: 57,
    column: 3,
    category: "correctness",
  },
  {
    filePath: "src/hooks/useDashboard.ts",
    normalizedFilePath: "src/hooks/useDashboard.ts",
    plugin: "react-you-might-not-need-an-effect",
    rule: "no-derived-state-in-effect",
    severity: "warning",
    title: "在 effect 里同步派生状态",
    message: "This state can be computed during render; syncing it in an effect adds an extra render pass.",
    help: "渲染期直接计算派生值，去掉该 effect。",
    line: 44,
    column: 3,
    category: "performance",
  },
  {
    filePath: "src/App.tsx",
    normalizedFilePath: "src/App.tsx",
    plugin: "react-doctor",
    rule: "component-size",
    severity: "warning",
    title: "组件过大（216 行）",
    message: "Component exceeds 200 lines; large components are harder to test and re-render broadly.",
    help: "拆分为更小的子组件，按职责分组。",
    line: 78,
    column: 9,
    category: "maintainability",
  },
  {
    filePath: "src/App.tsx",
    normalizedFilePath: "src/App.tsx",
    plugin: "react-doctor",
    rule: "no-unsafe-date",
    severity: "warning",
    title: "直接使用 new Date() 作为渲染输入",
    message: "Rendering with a fresh Date on every render makes output non-deterministic and can cause hydration mismatch.",
    help: "把时间作为 prop/state 显式传入。",
    line: 102,
    column: 14,
    category: "correctness",
  },
];

const MOCK_SUMMARY = {
  schemaVersion: 3,
  ok: true,
  version: "1.0.0",
  reactDetected: true,
  summary: {
    errorCount: 3,
    warningCount: 5,
    affectedFileCount: 3,
    totalDiagnosticCount: 8,
    score: 62,
    scoreLabel: "needs-work",
  },
  elapsedMilliseconds: 8412,
  error: null,
  diagnosticCount: MOCK_DIAGNOSTICS.length,
};

const delay = (ms: number) => { const { promise, resolve } = Promise.withResolvers<void>(); setTimeout(resolve, ms); return promise; };
export interface CapturedTab {
  label: () => string;
  icon?: (props: { className?: string }) => unknown;
  component: (props: { workspacePath: string }) => React.ReactNode;
}

export interface MockHost {
  ctx: PluginContext;
  /** activate 后取注册的 panel tab 定义。 */
  getPanelTab(): CapturedTab;
  /** composer 草稿订阅（预览壳展示用）。 */
  onDraft(cb: (text: string) => void): Disposer;
}

export function createMockHost(): MockHost {
  let panelTab: Parameters<PluginContext["ui"]["registerPanelTab"]>[0] | null = null;
  const kv = new Map<string, unknown>();
  const draftListeners = new Set<(text: string) => void>();

  const invoke = async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
    if (command !== "plugin_exec_run") {
      throw new Error(`mock bridge: 未知命令 ${command}`);
    }
    const bin = String(args?.bin ?? "");
    const argv = (args?.args ?? []) as string[];

    if (bin === "npx") {
      // 模拟扫描耗时，让 running 秒表/进度态可见。退出码 1 = CI 语义发现问题。
      await delay(2200);
      return { code: 1, stdout: "", stderr: "mock: react-doctor completed with findings" } as T;
    }
    if (bin === "node") {
      await delay(60);
      if (argv.length === 2) {
        // tmpdir 探测
        return { code: 0, stdout: "/tmp", stderr: "" } as T;
      }
      if (argv.length === 3) {
        // SUMMARY_SCRIPT：读摘要
        return { code: 0, stdout: JSON.stringify(MOCK_SUMMARY), stderr: "" } as T;
      }
      // PAGE_SCRIPT：["-e", script, file, offset, limit]
      const off = Number(argv[3]);
      const lim = Number(argv[4]);
      return {
        code: 0,
        stdout: JSON.stringify(MOCK_DIAGNOSTICS.slice(off, off + lim)),
        stderr: "",
      } as T;
    }
    throw new Error(`mock bridge: 未授权二进制 ${bin}`);
  };

  const ctx: PluginContext = {
    pluginId: "react-doctor",
    version: "0.2.0",
    react: React,
    ui: {
      registerSettingsSection: () => () => {},
      registerAddMenuRow: () => () => {},
      registerComposerSlot: () => () => {},
      registerPanelTab: (def) => {
        panelTab = def;
        return () => {};
      },
      registerStatusBarItem: () => () => {},
      registerCommand: () => () => {},
      registerMarkdownRenderer: () => () => {},
      registerPage: () => () => {},
      registerTimelineRowRenderer: () => () => {},
    },
    theme: {
      injectCss: () => () => {},
      setTokens: () => () => {},
    },
    i18n: {
      addBundle: () => () => {},
    },
    storage: {
      get: async <T,>(key: string) => (kv.has(key) ? (kv.get(key) as T) : null),
      set: async (key, value) => {
        kv.set(key, value);
      },
      delete: async (key) => {
        kv.delete(key);
      },
    },
    events: {
      on: () => () => {},
      emit: () => {},
    },
    composer: {
      setDraft: (text) => {
        for (const cb of draftListeners) cb(text);
      },
    },
    bridge: { invoke },
    host: {
      appVersion: "1.0.0-preview",
      sdkVersion: "0.3.2",
      locale: "zh-CN",
      isWeb: false,
    },
  };

  return {
    ctx,
    getPanelTab() {
      if (!panelTab) throw new Error("插件未注册 panel tab（activate 未生效）");
      return panelTab as CapturedTab;
    },
    onDraft(cb) {
      draftListeners.add(cb);
      return () => draftListeners.delete(cb);
    },
  };
}
