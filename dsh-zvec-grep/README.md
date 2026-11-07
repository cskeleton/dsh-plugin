# dsh-zvec-grep

面向 **DeepSeek Harness Desktop / Web GUI** 的本地 zvec-grep 插件包。复用本机已安装的 `zg`、共享服务、本地 embedding 模型和各项目索引，在 DSH 原生插件页面安装、启用、停用及卸载。

这是原生 **Bundle 插件**，包含两项随插件开关一同启停的能力：
1. `mcp-zvec-grep`：复用 DSH 自带的 `@deepseek-ai/dsh-mcp-client` 连接本机 `zg server --stdio`；
2. `zvec-grep-guidance`：自动向系统提示词注入**代码检索英文翻译与路由规则**，并在工具执行前通过 `tools.guard` 拦截未翻译的纯中文语义查询（支持双语 `queries` 检索中文文档），避免中文词在英文代码库 BM25/FTS 中得 0 分导致漏检。

## 安装与开关

1. 打开 DSH GUI 的 **插件 / Plugins** 页面，选择 **添加插件 / Add plugin**。
2. 输入此目录的绝对路径：

   ```text
   /Users/gc/Dev/MyProject/dsh-plugin/dsh-zvec-grep
   ```

3. 安装后找到 `dsh-zvec-grep`，打开它的**启用开关**。
4. 点击进入 **`dsh-zvec-grep` 插件详情页**，即可在配置卡片中：
   - **手动添加或移除“自动建索引的目录范围（按子项目）”**（如 `~/Dev`、`/Users/gc/Projects` 等），添加或删除后立即保存生效，无需重启；
   - **随时开关“强制将代码检索翻译为英文”守卫**。
5. 开关可直接停用/重新启用整个 bundle；单条连接也可使用原生配置项开关。

Desktop profile 由桌面应用管理，**不要用外部 `dsh plugin --profile desktop` 修改它**。普通 Web profile 可以使用：

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-zvec-grep
```

安装用本地目录即可，不需要生成 tgz。关闭插件只释放 DSH 的 stdio 连接、工具和服务器指令，不会停止 Codex / Claude Code 共用的 zg daemon，也不会删除模型或索引。卸载使用插件页的卸载操作。

## 前提与本机配置

- DSH 0.2.1-rc.3 或更高，包含原生 MCP 客户端。
- 已安装并能运行 `zg`；本机验证目标版本为 0.2.2。
- 该默认配置面向 Apple Silicon / Homebrew：
  - command: `/opt/homebrew/bin/node`
  - args: `--liftoff-only /opt/homebrew/bin/zg server --stdio`
  - namespace: `zvec_grep`
  - 单次工具超时：600000 ms（10 分钟）
  - `failOnStartupError: true`：连接失败应明确显示为激活失败。
- 其他安装位置请在本包的 [连接配置](<cordis.patch.yml>) 中调整 command/args，然后按 GUI 提示重载或重启；也可通过 DSH 支持的 profile override 覆盖该项。原生开关不是参数表单，没有动态安装、PATH 猜测或 shell 执行。
- 本机已缓存并配置 `local/qwen3-embedding-0.6b`（`llama-cpp` GGUF Q8_0，1024 维，支持 **Apple Silicon Metal GPU** 加速）作为新建索引的默认模型；已有项目索引会继续沿用其创建时的模型，互不冲突。
- 若需关闭纯中文查询拦截守卫（仅保留系统提示词约束），可在 `cordis.patch.yml` 中将 `zvec-grep-guidance` 的 `requireEnglishQuery` 设为 `false`。

## 使用（自动按子项目建索引 + 缺失询问）

本插件默认配置了 `autoIndexRoots: ['~/Dev']`（见 [cordis.patch.yml](<cordis.patch.yml>)），搜索时的索引策略如下：

1. **在 `~/Dev` 范围内（按子项目自动建索引）**：
   - 当你在 `~/Dev` 下的任意具体项目（如 `~/Dev/Opensource/notebooklm-py`、`~/Dev/MyProject/OpenClawUsage`、`~/Dev/MyProject/dsh-plugin/dsh-gc-duolink`）中首次发起搜索时，若该项目尚无 `.zvec-grep` 索引，插件会**自动识别该项目根目录并在后台调用 `zg index <projectRoot> --mode server` 完成建索引**，随后立即返回搜索结果，无需手动提前运行 `zg index`。
   - **防误扫保护**：如果传入的是 `~/Dev`、`~/Dev/MyProject`、`~/Dev/Opensource` 或 `~/Dev/MyProject/dsh-plugin` 这类包含多个项目的**上层容器目录**，插件不会把整个大目录扫成一个巨型索引，而是会自动列出检测到的子项目，让 Agent 直接改搜对应子项目或通过 `ask_user_question` 询问你要索引哪个子目录。
2. **在 `~/Dev` 范围外（自动弹窗询问）**：
   - 当搜索 `autoIndexRoots` 之外且尚未建索引的目录时，插件会触发 `[INDEX_MISSING_ASK_USER]` 提示，引导 Agent 调用 `ask_user_question` 询问你：**是否立即索引当前工作目录、指定其他目录建立索引，或暂不索引改用原生 `grep`**。

连接成功后，DSH 模型可见的搜索工具是 `mcp__zvec_grep__zvec_grep_search`（DSH 的 MCP 桥接器固定按 `mcp__<serverName>__<rawToolName>` 拼接名称，而上游 `zg` 的工具原名即为 `zvec_grep_search`）。每次搜索必须传实际项目的绝对 `root`。

适合：不确定符号名的语义定位、中英文代码/文档检索。精确字符串或正则仍可使用 DSH 原生 `grep`。索引命中是定位线索，修改代码前仍应读取当前文件确认。

插件**不会自动扫描整个硬盘，不会替所有项目建索引，不添加 blanket allow 权限**。MCP 工具调用遵循 DSH 现有权限策略；共享 zg 是独立本地服务，不应把它视为 DSH 文件沙箱的延伸。仅对你授权检索的项目使用；启用前确认现有 zg 模型配置没有意外指向远程 embedding 服务。

## 排错

```sh
/opt/homebrew/bin/zg --version
/opt/homebrew/bin/zg server status --check-ready
```

- **找不到工具**：检查 bundle 和 `mcp-zvec-grep` 配置项是否均启用、连接是否报错。重新启用后，在新的模型轮次或新会话确认工具列表；现有在途请求不一定即时更新。
- **找不到程序**：检查绝对 command/args；桌面应用的 PATH 与终端不同。
- **命名冲突**：如果之前手动装过同 namespace 的 `mcp-zvec-grep`，先停用旧连接；不要同时加载两份 `zvec_grep`。
- **项目未索引/索引过旧**：在目标项目执行 `zg index`，不要重复安装插件。
- **服务暂时断线**：原生客户端自带有限次数的指数退避重连；耗尽后重新启用插件。不会静默改用其他模型或搜索源。
- **开关提示需要重启**：按 GUI 的应用结果处理；本包没有要求开发 watcher 或重建主程序。

## 开发与验证

```sh
pnpm install --ignore-scripts
pnpm test
```

真实 Host smoke 使用当前 DSH MCP 实现和已存在的索引，不自动创建索引：

```sh
DSH_PACKAGE_JSON='/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/package.json' \
ZVEC_TEST_ROOT='/absolute/path/to/already-indexed/zvec-grep-sample' \
ELECTRON_RUN_AS_NODE=1 \
'/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' tests/host-smoke.cjs
```

该测试验证 schema、真实工具注册、中文检索、停用清理和重启注册；工具注册表/生命周期为测试桩，不应把它冒充成已登录 GUI 的安装测试。GUI 加载结果另见验证记录。
