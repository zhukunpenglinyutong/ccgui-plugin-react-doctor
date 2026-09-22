import { createElement, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import activate from "../src/main";
import { createMockHost } from "./mock-host";

/**
 * 预览壳：模拟宿主的右侧面板环境——顶部条（明暗切换）、左侧聊天占位
 * （底部是 composer 草稿框，展示「一键修复」写入的内容）、右侧 400px
 * 面板里真实渲染插件注册的 tab（icon + label + component）。
 */

const mock = createMockHost();
activate(mock.ctx);
const tab = mock.getPanelTab();

function Shell() {
  const [draft, setDraft] = useState("");
  const [dark, setDark] = useState(false);

  useEffect(() => mock.onDraft(setDraft), []);
  useEffect(() => {
    document.body.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <div className="shell">
      <div className="topbar">
        CC GUI · 插件预览
        <span className="tag">react-doctor v0.2.0</span>
        <button onClick={() => setDark((v) => !v)}>{dark ? "浅色" : "深色"}</button>
      </div>
      <div className="stage">
        <div className="chat-mock">
          <div className="chat-fill">聊天区占位（宿主环境）</div>
          <div className="composer">
            {draft || <span className="ph">composer 草稿——点「一键修复/修复」后提示词会填到这里</span>}
          </div>
        </div>
        <div className="panel-mock">
          <div className="panel-tab-strip">
            {tab.icon?.({ className: "" }) as ReactNode}
            {tab.label()}
          </div>
          <div id="panel">{createElement(tab.component, { workspacePath: "/Users/demo/my-react-app" })}</div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(<Shell />);
