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

  // tab 图标不注册，交给宿主回退：marketplace 安装会按 manifest 的
  // `icon`（docs/icon.png）把索引品牌图落到插件目录，本地目录安装直接
  // 读仓库里的同一张图——列表、详情页、页签三处同一条链。
  ctx.ui.registerPanelTab({
    label: () => copy(ctx.host.locale).tabLabel,
    component: PanelContainer,
  });

  // ctx 注册由宿主 disposer 栈兜底；React root 随容器卸载。
  return () => setHostCtx(null);
};

export default activate;
