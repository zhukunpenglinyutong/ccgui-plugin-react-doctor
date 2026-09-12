import "./styles.css";

import { createRoot } from "react-dom/client";
import type { PluginActivate, PluginContext } from "./ccgui-plugin";
import DashboardView from "./DashboardView";
import { copy, setHostCtx } from "./host";
import { hydrate } from "./store";

/**
 * 插件入口：宿主动态 import main.js 并以 PluginContext 调默认导出。
 * 双段挂载（kimi-lb 同款）：宿主 React 树只渲染容器（经 ctx.react），
 * 面板内容用插件自带 React createRoot 挂进容器，两棵树互不交错。
 */
const activate: PluginActivate = (ctx) => {
  setHostCtx(ctx);
  const h = ctx.react;

  function PanelContainer({ workspacePath }: { workspacePath: string }) {
    const ref = h.useRef<HTMLDivElement | null>(null);
    h.useEffect(() => {
      if (!ref.current) return;
      void hydrate(workspacePath);
      const root = createRoot(ref.current);
      root.render(<DashboardView />);
      return () => root.unmount();
    }, [workspacePath]);
    return h.createElement("div", { ref, className: "react-doctor-root" });
  }

  // tab 图标渲染在宿主树里：用 ctx.react 手工建 SVG（图标组件库里的
  // 函数组件产自插件 React，交给宿主树渲染违反双树规则）。
  const svgProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;

  ctx.ui.registerPanelTab({
    label: () => copy(ctx.host.locale).tabLabel,
    icon: ({ className }) =>
      h.createElement(
        "svg",
        { ...svgProps, className },
        h.createElement("path", { d: "M11 2v2" }),
        h.createElement("path", { d: "M5 2v2" }),
        h.createElement("path", { d: "M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" }),
        h.createElement("path", { d: "M8 15a6 6 0 0 0 12 0v-3" }),
        h.createElement("circle", { cx: 20, cy: 10, r: 2 }),
      ),
    component: PanelContainer,
  });

  // ctx 注册由宿主 disposer 栈兜底；React root 随容器卸载。
  return () => setHostCtx(null);
};

export default activate;
