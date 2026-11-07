# dsh-client-ui-copy-session-id

[English](README.md) | 中文

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI
插件：在左侧会话列表的每个会话右键（"..."）菜单中添加**复制会话 ID** 菜单项。

该菜单项注册到 `sidebar.workspaces.session.menu.item` 列表槽位，
`order: 500` —— 排在内置的置顶（100）、重命名（200）、分叉（300）、
归档（400）之后，并以分隔线开启新的一组。点击后把该会话的完整
Session ID 写入剪贴板并关闭菜单。

## 安装

在 DSH 桌面版或 Web GUI 的 **插件（Plugins）** 页面选择 **添加插件（Add plugin）**，
填入本目录的绝对路径（profile 会以 `link:` 依赖方式安装）；或在检出目录中使用：

```sh
dsh plugin --profile <名称> add link:/path/to/dsh-client-ui-copy-session-id
```

`desktop` profile 由 Electron 应用独占管理——请使用 GUI 安装。
安装后刷新页面（或重启桌面应用）以加载浏览器半部分。

## 目录结构

- `package.json` —— `dsh.bundle.patch` 名册声明与 `dsh.client`
  浏览器半声明（`platform: 'web'`）。
- `cordis.patch.yml` —— 插入 `ui-copy-session-id` 插件行。
- `lib/index.js` —— 空的 Host 半部分，仅让插件留在 Host 名单上。
- `lib/client.js` —— 手写的 lazy-CJS 浏览器 bundle
  （`window.__ModuleLoader__.load({ id, factory })`），无需构建。
- `tests/smoke.mjs` —— 用打桩的 Module Loader、Cordis client context 和
  剪贴板运行该 bundle，断言菜单项复制 ID 并关闭菜单。`npm test` 运行。

## 说明

- 外部模块（`react`、`@deepseek-ai/dsh-client-ui-primitives`）解析自 shell
  冻结的平台模块表；不要打包进 bundle，也不要列为运行时依赖。
- 优先使用 Clipboard API，不可用时回退到隐藏 textarea 方案。
