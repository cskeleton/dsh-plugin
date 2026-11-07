# DSH 插件集合

[English](<README.md>) | 中文

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的独立插件源码集合。统一 Git 管理，但每个插件仍独立命名、版本、依赖、测试和安装。**仓库根目录不是一个可整体安装的插件包。**

## 插件目录

| 插件 | 功能 | 兼容要求 |
| --- | --- | --- |
| [DuoLink](<dsh-gc-duolink/README.zh.md>) | Session 双向通信、互联、唤醒授权和派生会话 | 见插件 SDK / peer 要求及版本说明 |
| [会话导出](<dsh-conversation-export/README.zh.md>) | 将会话导出为 Markdown、HTML 或 PNG 图片 | DSH >= 0.2.1-rc.3 |
| [复制会话 ID](<dsh-client-ui-copy-session-id/README.zh.md>) | 从侧栏菜单复制 Session ID | DSH >= 0.2.0-rc.1 |
| [zvec-grep](<dsh-zvec-grep/README.md>) | 本地语义检索桥接与查询指导 | DSH >= 0.2.1-rc.3；另需安装 `zg` 并配置本地模型与索引 |

## 独立安装

先阅读相应插件的安装说明。在 DSH 插件页面添加本地目录时，选择**插件子目录**，不要选择仓库根目录。DuoLink 从源码目录安装前需要构建。Desktop profile 由应用管理，请遵循 GUI 和插件文档支持的操作，不要从外部修改运行中的 profile。

```text
/path/to/dsh-plugin/dsh-conversation-export
/path/to/dsh-plugin/dsh-client-ui-copy-session-id
/path/to/dsh-plugin/dsh-zvec-grep
/path/to/dsh-plugin/dsh-gc-duolink
```

此次整合不增加 `plugins/` 层，也不修改包名，因此已有开发安装可以继续使用相同路径。今后移动整个 checkout 时，需要另行处理安装链接。

DuoLink 的历史安装包保留在 [Releases](https://github.com/cskeleton/dsh-plugin/releases)。其他三个插件仍按各自文档从源码目录安装，本次不新增发布包。

## 开发与测试

当前没有根级包管理 workspace。**进入各插件目录**安装依赖、运行命令；各自 lockfile 保持独立。已声明的插件使用 pnpm 10.33.2。

```sh
# 从仓库根目录执行。
(cd dsh-gc-duolink && pnpm install --frozen-lockfile)
(cd dsh-gc-duolink && env -u DSH_SOURCE_ROOT pnpm typecheck)
(cd dsh-gc-duolink && env -u DSH_SOURCE_ROOT pnpm build)
(cd dsh-gc-duolink && env -u DSH_SOURCE_ROOT pnpm test)

(cd dsh-conversation-export && pnpm install --frozen-lockfile && pnpm test)
(cd dsh-client-ui-copy-session-id && pnpm test)
(cd dsh-zvec-grep && pnpm install --frozen-lockfile --ignore-scripts && pnpm test)
```

DuoLink 的完整测试命令包含已安装宿主验证，前提及额外集成验证见其文档。其他插件的单元或 smoke 测试不能代替真实登录 GUI 安装测试。

只有 DuoLink 的 `lib/` 是被忽略的构建产物；其余插件的 `lib/` 包含维护中的实现，必须正常纳入 Git。依赖、本地语义索引和 benchmark 工作区不属于源码。

## 发布与历史

- 各插件独立版本、独立安装包；仓库维护不会自动升级版本或发布。
- 新发布 tag 采用 `<包名>@<版本>`。
- 历史 `v0.5.0`、`v0.6.1-beta` tag 和 release 保持原身份及旧的单插件源码布局。
- 集合仓库延续原 `cskeleton/dsh-gc-duolink` 仓库；会话导出的两个原始提交通过不压缩历史的 subtree 导入保留。
- 历史来源、验证及回退边界见[迁移说明](<docs/repository-migration.md>)。

## 许可

各插件的 manifest 声明 MIT；保留 DuoLink 已有的[许可文本](<dsh-gc-duolink/LICENSE>)。本仓库不包含或重新授权外部软件、模型及 benchmark 项目。
