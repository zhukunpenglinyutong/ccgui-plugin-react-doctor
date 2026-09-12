# ccgui-plugin-react-doctor

CC GUI 插件（Tier-1 工具类）：一键运行 `npx react-doctor@latest` 代码体检。

- **面板 tab**：右侧栏展示评分环、错误/警告统计、按文件分组的问题列表与修复建议、原始输出
- **结果持久化**：体检报告本地保存，重开面板不丢失
- **一键修复**：评分非满分时，把问题清单自动填入聊天输入框，交给 AI 修复

## 构建

```bash
pnpm install
pnpm build    # 产出 main.js + styles.css（manifest.json 本在仓库根）
pnpm validate # manifest 校验
```

## 安装

宿主 App：设置 → 插件 → 从本地目录安装 → 选择本仓库根目录。

## 权限声明

| 权限 | 用途 |
|---|---|
| `ui:panel-tab` | 右侧栏体检报告面板 |
| `storage` | 持久化最近一次体检结果 |
| `composer:draft` | 「一键修复」写入聊天输入框草稿 |
| `exec:npx` | 运行 `npx react-doctor@latest` |
| `exec:node` | react-doctor 的运行时（经 npx 拉起） |

无任何 `network:` 授权——体检在本地执行，不联网。

> 注意：`exec:` 是进程执行授权。本插件仅用于运行 react-doctor，审核/安装时请确认理解该能力边界。
