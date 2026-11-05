/**
 * Browser half of dsh-conversation-export, hand-written in the lazy-CJS
 * module format the Web client's Module Loader serves (`factory(require)`).
 *
 * - `sidebar.workspaces.session.menu.item` (order 460, after "Copy Session
 *   ID"): an "Export conversation…" row that opens the dialog for its row's
 *   Session.
 * - `shell.overlay`: the export dialog. It loads the Session outline from the
 *   Host; the user picks messages (user and assistant separately), format
 *   (Markdown, HTML, image), theme, image width and font size, tool-call and
 *   thinking detail (详细 / 摘要 / 无, default 无), the summary model, and
 *   where to save. On this machine the Host writes the file to a folder and
 *   the dialog offers Open file / Show in Finder; otherwise the browser
 *   downloads it.
 *
 * Only React comes from the module table; controls are local copies of the
 * host menu-row and modal styling, using `--dsw-alias-*` theme tokens.
 */
window.__ModuleLoader__.load({
  id: "dsh-conversation-export",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");
    const h = React.createElement;

    const NS = "conversation-export";
    const ROUTES = {
      outline: "api/conversation-export.outline",
      render: "api/conversation-export.render",
      open: "api/conversation-export.open",
      pick: "api/conversation-export.pick"
    };
    const PREFS_KEY = "dsh-conversation-export:prefs";
    const THEMES = ["paper", "sepia", "ink", "night"];
    const LEVELS = ["detailed", "summary", "none"];

    const zh = {
      "menu.export": "导出对话…",
      "dialog.title": "导出对话",
      "dialog.close": "关闭",
      "dialog.loading": "正在读取会话…",
      "dialog.loadFailed": "无法读取会话：{error}",
      "dialog.staleHost": "插件的 Host 部分还是旧版本，请重启 DSH 后再导出。",
      "field.format": "格式",
      "field.theme": "主题",
      "field.width": "图片宽度",
      "field.fontSize": "字号",
      "field.tools": "工具调用",
      "field.thinking": "思考过程",
      "field.model": "摘要模型",
      "field.save": "保存到",
      "field.messages": "导出内容",
      "format.markdown": "Markdown",
      "format.html": "HTML",
      "format.image": "图片",
      "format.imageUnavailable": "图片导出不可用：{reason}",
      "theme.paper": "纸白",
      "theme.sepia": "暖黄",
      "theme.ink": "墨黑",
      "theme.night": "夜间",
      "preset.phone": "手机",
      "preset.tablet": "平板",
      "preset.desktop": "桌面",
      "preset.custom": "自定义",
      "width.reset": "恢复默认",
      "width.hint": "输出 {px} px 宽（{scale} 倍清晰度），字号 {font} px；很长的对话会自动分成多张图。",
      "width.invalid": "宽度需在 {min}–{max} px 之间。",
      "font.auto": "自动（{n}）",
      "font.invalid": "字号需在 {min}–{max} px 之间。",
      "level.detailed": "详细",
      "level.summary": "摘要",
      "level.none": "无",
      "hint.tools.detailed": "保留每次工具调用的参数和输出，过长部分会截断。",
      "hint.tools.summary": "每次工具调用用一句话概括做了什么。",
      "hint.tools.none": "不显示工具调用。",
      "hint.thinking.detailed": "保留每段思考的完整内容。",
      "hint.thinking.summary": "每段思考用一句话概括在想什么。",
      "hint.thinking.none": "不显示思考过程。",
      "hint.thinking.noModel": "当前没有可调用的模型，思考过程不提供“摘要”。",
      "hint.tools.rule": "未选择模型时，按规则生成这句话。",
      "model.none": "不使用模型（工具调用按规则生成）",
      "model.required": "思考过程的“摘要”需要选择一个模型。",
      "model.calls": "预计调用模型 {n} 次。",
      "save.folder": "本地文件夹",
      "save.download": "浏览器下载",
      "save.choose": "选择…",
      "save.placeholder": "文件夹路径",
      "messages.all": "全选",
      "messages.users": "仅用户",
      "messages.assistants": "仅助手",
      "messages.none": "全不选",
      "messages.count": "已选 {n} / {total} 条消息",
      "messages.empty": "这个会话还没有对话。",
      "round.label": "第 {n} 轮",
      "role.user": "用户",
      "role.assistant": "助手",
      "round.images": "[图片 ×{n}]",
      "round.noReply": "（无文字回复）",
      "round.tools": "{n} 次工具调用",
      "round.reasoning": "{n} 段思考",
      "action.cancel": "取消",
      "action.export": "导出",
      "action.exporting": "正在导出…",
      "action.exportingImage": "正在生成图片…",
      "action.exportingSummaries": "正在生成摘要…",
      "result.saved": "已保存到 {path}",
      "result.savedMany": "已保存 {n} 张图片到 {dir}",
      "result.downloaded": "已开始下载 {file}",
      "result.downloadedMany": "已开始下载 {n} 张图片",
      "result.partial": "{n} 组摘要生成失败，已改用规则或省略。",
      "result.failed": "导出失败：{error}",
      "result.open": "打开文件",
      "result.openFirst": "打开第一张",
      "result.reveal.finder": "在访达中显示",
      "result.reveal.explorer": "在资源管理器中显示",
      "result.reveal.directory": "打开所在文件夹",
      "result.copy": "复制路径",
      "result.copied": "已复制",
      "result.openFailed": "无法打开：{error}"
    };
    const en = {
      "menu.export": "Export conversation…",
      "dialog.title": "Export conversation",
      "dialog.close": "Close",
      "dialog.loading": "Reading the session…",
      "dialog.loadFailed": "Could not read the session: {error}",
      "dialog.staleHost": "The plugin's Host side is still the old version. Restart DSH, then export again.",
      "field.format": "Format",
      "field.theme": "Theme",
      "field.width": "Image width",
      "field.fontSize": "Font size",
      "field.tools": "Tool calls",
      "field.thinking": "Thinking",
      "field.model": "Summary model",
      "field.save": "Save to",
      "field.messages": "Messages",
      "format.markdown": "Markdown",
      "format.html": "HTML",
      "format.image": "Image",
      "format.imageUnavailable": "Image export is unavailable: {reason}",
      "theme.paper": "Paper",
      "theme.sepia": "Sepia",
      "theme.ink": "Ink",
      "theme.night": "Night",
      "preset.phone": "Phone",
      "preset.tablet": "Tablet",
      "preset.desktop": "Desktop",
      "preset.custom": "Custom",
      "width.reset": "Reset to default",
      "width.hint": "Output is {px} px wide ({scale}x), {font} px text; long conversations are split into several images.",
      "width.invalid": "Width must be {min}–{max} px.",
      "font.auto": "Auto ({n})",
      "font.invalid": "Font size must be {min}–{max} px.",
      "level.detailed": "Detailed",
      "level.summary": "Summary",
      "level.none": "None",
      "hint.tools.detailed": "Keeps each tool call's arguments and output; long output is clipped.",
      "hint.tools.summary": "One sentence per tool call saying what it did.",
      "hint.tools.none": "Tool calls are left out.",
      "hint.thinking.detailed": "Keeps every thinking block in full.",
      "hint.thinking.summary": "One sentence per thinking block saying what it worked out.",
      "hint.thinking.none": "Thinking is left out.",
      "hint.thinking.noModel": "No model is available, so thinking has no Summary option.",
      "hint.tools.rule": "Without a model, the sentence is generated by rules.",
      "model.none": "No model (rule-based tool sentences)",
      "model.required": "Thinking Summary needs a model.",
      "model.calls": "About {n} model call(s).",
      "save.folder": "Local folder",
      "save.download": "Browser download",
      "save.choose": "Choose…",
      "save.placeholder": "Folder path",
      "messages.all": "All",
      "messages.users": "User only",
      "messages.assistants": "Assistant only",
      "messages.none": "None",
      "messages.count": "{n} of {total} messages selected",
      "messages.empty": "This session has no conversation yet.",
      "round.label": "Round {n}",
      "role.user": "User",
      "role.assistant": "Assistant",
      "round.images": "[{n} image(s)]",
      "round.noReply": "(no text reply)",
      "round.tools": "{n} tool call(s)",
      "round.reasoning": "{n} thinking block(s)",
      "action.cancel": "Cancel",
      "action.export": "Export",
      "action.exporting": "Exporting…",
      "action.exportingImage": "Rendering images…",
      "action.exportingSummaries": "Writing summaries…",
      "result.saved": "Saved to {path}",
      "result.savedMany": "Saved {n} images to {dir}",
      "result.downloaded": "Download started: {file}",
      "result.downloadedMany": "Downloading {n} images",
      "result.partial": "{n} summary batch(es) failed and fell back to rules or were omitted.",
      "result.failed": "Export failed: {error}",
      "result.open": "Open file",
      "result.openFirst": "Open first image",
      "result.reveal.finder": "Show in Finder",
      "result.reveal.explorer": "Show in Explorer",
      "result.reveal.directory": "Open folder",
      "result.copy": "Copy path",
      "result.copied": "Copied",
      "result.openFailed": "Could not open: {error}"
    };

    function fill(text, values) {
      return String(text).replace(/\{(\w+)\}/g, (match, key) => (values && key in values ? String(values[key]) : match));
    }

    /* ----------------------------- shared state ----------------------------- */

    function createStore(initial) {
      let state = initial;
      const listeners = new Set();
      return {
        get: () => state,
        set(next) {
          state = next;
          for (const listener of listeners) listener();
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        }
      };
    }

    function useStore(store) {
      return React.useSyncExternalStore(store.subscribe, store.get, store.get);
    }

    function loadPrefs() {
      try {
        const value = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}");
        return value && typeof value === "object" ? value : {};
      } catch {
        return {};
      }
    }

    function savePrefs(prefs) {
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      } catch {}
    }

    async function postJson(route, body, signal) {
      const response = await fetch(route, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
        signal
      });
      let value;
      try {
        value = await response.json();
      } catch {}
      if (!response.ok) throw new Error(value && typeof value.error === "string" ? value.error : `HTTP ${response.status}`);
      return value;
    }

    function base64Blob(base64, mime) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }

    function saveBlob(blob, fileName) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
      return Promise.reject(new Error("clipboard unavailable"));
    }

    function routeKey(route) {
      return route ? `${route.provider}\u0000${route.model}` : "";
    }

    function formatTime(ms) {
      if (typeof ms !== "number") return "";
      try {
        return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(ms);
      } catch {
        return "";
      }
    }

    function autoFontSize(width) {
      const value = 24 - ((width - 640) * 8) / 560;
      return Math.round(Math.min(24, Math.max(16, value)));
    }

    function parseIntIn(text, range) {
      if (!/^\d+$/.test(String(text).trim())) return undefined;
      const value = Number(text);
      return value >= range.min && value <= range.max ? value : undefined;
    }

    /* --------------------------------- styles -------------------------------- */

    const CSS = `
.cxp-sep{height:.5px;margin:3px 2px;background:var(--dsw-alias-border-l2)}
.cxp-item{display:flex;align-items:center;gap:6px;width:100%;min-height:30px;padding:4px 8px;border:none;border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);text-align:left;font-family:inherit}
.cxp-item:hover,.cxp-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.cxp-item-icon{display:inline-flex;flex:none;width:14px;height:14px;align-items:center;justify-content:center;color:var(--dsw-alias-menu-icon)}
.cxp-item-icon svg{width:14px;height:14px}
.cxp-item-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cxp-root{pointer-events:auto;position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:max(24px,var(--dsh-frame-overlay-top,24px)) 24px}
.cxp-mask{position:absolute;inset:var(--dsh-frame-chrome-top,0px) 0 0;backdrop-filter:var(--dsw-mask-blur)}
.cxp-mask:after{content:"";position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1)}
.cxp-dialog{box-sizing:border-box;position:relative;z-index:1;display:flex;flex-direction:column;width:min(640px,100%);max-height:100%;overflow:hidden;border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary)}
.cxp-dialog:focus{outline:none}
.cxp-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:22px 14px 12px 24px;flex:none}
.cxp-title{margin:0;font-size:16px;line-height:24px;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cxp-subtitle{color:var(--dsw-alias-label-secondary);font-weight:400}
.cxp-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary)}
.cxp-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.cxp-body{flex:1;min-height:0;overflow-y:auto;padding:4px 24px 8px;display:flex;flex-direction:column;gap:14px}
.cxp-row{display:grid;grid-template-columns:108px 1fr;gap:10px 12px;align-items:start}
.cxp-label{font-size:13px;line-height:28px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.cxp-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.cxp-inline{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.cxp-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.cxp-hint.warn{color:var(--dsw-alias-state-warn-primary)}
.cxp-hint.error{color:var(--dsw-alias-state-error-primary)}
.cxp-seg{display:inline-flex;flex-wrap:wrap;gap:2px;padding:2px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);align-self:flex-start}
.cxp-seg button{border:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;padding:3px 12px;border-radius:var(--dsw-radius-sm);cursor:pointer}
.cxp-seg button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.cxp-seg button[aria-checked="true"]{background:var(--dsw-alias-bg-layer-2);box-shadow:0 0 0 .5px var(--dsw-alias-border-l2),0 1px 2px rgba(0,0,0,.08);font-weight:500}
.cxp-seg button:disabled{opacity:.4;cursor:not-allowed}
.cxp-select,.cxp-input{box-sizing:border-box;height:30px;padding:0 8px;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.cxp-select{width:100%}
.cxp-input:focus,.cxp-select:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.cxp-input.num{width:96px;text-align:right}
.cxp-input.path{flex:1;min-width:0}
.cxp-unit{font-size:13px;color:var(--dsw-alias-label-secondary)}
.cxp-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:12px;color:var(--dsw-alias-label-secondary);line-height:28px}
.cxp-link{border:none;background:transparent;padding:0;color:var(--dsw-alias-brand-primary);font:inherit;font-size:12px;cursor:pointer}
.cxp-link:disabled{opacity:.4;cursor:not-allowed}
.cxp-list{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);max-height:280px;overflow-y:auto;background:var(--dsw-alias-bg-layer-1)}
.cxp-round{padding:6px 10px 6px;border-top:.5px solid var(--dsw-alias-border-l1)}
.cxp-round:first-child{border-top:0}
.cxp-round-head{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);margin-bottom:2px}
.cxp-msg{display:flex;gap:8px;align-items:flex-start;padding:3px 4px;border-radius:var(--dsw-radius-sm);cursor:pointer}
.cxp-msg:hover{background:var(--dsw-alias-interactive-bg-hover)}
.cxp-msg input{margin:3px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary)}
.cxp-role{flex:none;width:58px;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cxp-msg-main{min-width:0;flex:1}
.cxp-msg-text{font-size:13px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cxp-msg-meta{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.cxp-result{flex:none;margin:0 24px 2px;padding:10px 12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:8px}
.cxp-result-text{font-size:12px;line-height:18px;word-break:break-all}
.cxp-result-text.ok{color:var(--dsw-alias-state-success-primary)}
.cxp-result-text.error{color:var(--dsw-alias-state-error-primary)}
.cxp-result-actions{display:flex;flex-wrap:wrap;gap:8px}
.cxp-footer{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:14px 24px 22px}
.cxp-status{flex:1;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.cxp-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:36px;min-width:72px;border:none;border-radius:var(--dsw-radius-md);cursor:pointer;font:inherit;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);background:transparent;padding:0 14px}
.cxp-btn.sm{height:28px;min-width:0;font-size:12px;line-height:18px;padding:0 10px;border-radius:var(--dsw-radius-sm)}
.cxp-btn:disabled{cursor:not-allowed;opacity:.4}
.cxp-btn.outline{border:.5px solid var(--dsw-alias-border-l3)}
.cxp-btn.outline:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.cxp-btn.primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.cxp-btn.primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.cxp-center{padding:28px 0;text-align:center;font-size:13px;color:var(--dsw-alias-label-secondary)}
`;

    function Styles() {
      return h("style", { "data-plugin": "dsh-conversation-export" }, CSS);
    }

    function ExportIcon() {
      return h("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
        h("path", { d: "M3 9.5v2.75c0 .69.56 1.25 1.25 1.25h7.5c.69 0 1.25-.56 1.25-1.25V9.5" }),
        h("path", { d: "M8 2.5v7.5" }),
        h("path", { d: "M5.25 7.25 8 10l2.75-2.75" }));
    }

    function CloseIcon() {
      return h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", "aria-hidden": "true" },
        h("path", { d: "M4 4l8 8M12 4l-8 8" }));
    }

    /* ------------------------------- menu row ------------------------------- */

    function ExportMenuItem({ sessionId, displayTitle, useMenuOpenState, t, open }) {
      const [, setMenuOpen] = useMenuOpenState();
      return h(React.Fragment, null,
        h(Styles),
        h("div", { className: "cxp-sep", role: "separator" }),
        h("button", {
          type: "button",
          role: "menuitem",
          className: "cxp-item",
          onClick: () => {
            setMenuOpen(false);
            open(sessionId, displayTitle);
          }
        },
          h("span", { className: "cxp-item-icon" }, h(ExportIcon)),
          h("span", { className: "cxp-item-label" }, t("menu.export"))));
    }

    /* -------------------------------- dialog -------------------------------- */

    function Segmented({ value, options, onChange, label }) {
      return h("div", { className: "cxp-seg", role: "radiogroup", "aria-label": label },
        options.map(option => h("button", {
          key: option.value,
          type: "button",
          role: "radio",
          "aria-checked": value === option.value ? "true" : "false",
          disabled: option.disabled === true,
          title: option.title,
          onClick: () => onChange(option.value)
        }, option.label)));
    }

    function Row({ label, children }) {
      return h("div", { className: "cxp-row" },
        h("div", { className: "cxp-label" }, label),
        h("div", { className: "cxp-field" }, children));
    }

    function Hint({ tone, children }) {
      return h("div", { className: tone ? `cxp-hint ${tone}` : "cxp-hint" }, children);
    }

    function messageKeys(rounds) {
      const keys = [];
      for (const round of rounds) {
        if (round.hasPrompt) keys.push(`${round.index}:u`);
        if (round.hasAssistant) keys.push(`${round.index}:a`);
      }
      return keys;
    }

    function ExportDialog({ request, close, t }) {
      const { sessionId, title } = request;
      const prefs = React.useMemo(loadPrefs, []);
      const [outline, setOutline] = React.useState({ status: "loading" });
      const [format, setFormat] = React.useState(["markdown", "html", "image"].includes(prefs.format) ? prefs.format : "markdown");
      const [theme, setTheme] = React.useState(THEMES.includes(prefs.theme) ? prefs.theme : "paper");
      const [widthText, setWidthText] = React.useState(String(Number.isInteger(prefs.width) ? prefs.width : 640));
      const [fontText, setFontText] = React.useState(Number.isInteger(prefs.fontSize) ? String(prefs.fontSize) : "");
      const [tools, setTools] = React.useState("none");
      const [thinking, setThinking] = React.useState("none");
      const [modelKey, setModelKey] = React.useState("");
      const [delivery, setDelivery] = React.useState(prefs.delivery === "download" ? "download" : "save");
      const [directory, setDirectory] = React.useState(typeof prefs.directory === "string" ? prefs.directory : "");
      const [selected, setSelected] = React.useState(() => new Set());
      const [job, setJob] = React.useState({ status: "idle" });
      const [notice, setNotice] = React.useState(null);
      const abortRef = React.useRef(null);
      const dialogRef = React.useRef(null);

      React.useEffect(() => {
        const controller = new AbortController();
        postJson(ROUTES.outline, { sessionId }, controller.signal)
          .then(value => {
            if (!value || !value.save || !value.image || !value.summary) throw new Error(t("dialog.staleHost"));
            setOutline({ status: "ready", value });
            setSelected(new Set(messageKeys(value.rounds)));
            const models = value.summary.models || [];
            const preferred = models.find(model => routeKey(model) === prefs.modelKey);
            setModelKey(value.summary.available ? routeKey(preferred || value.summary.defaultModel || models[0]) : "");
            if (value.save.available && directory === "") setDirectory(value.save.defaultDirectory || "");
            if (!value.image.available) setFormat(current => (current === "image" ? "markdown" : current));
          })
          .catch(error => {
            if (!controller.signal.aborted) setOutline({ status: "error", error: error instanceof Error ? error.message : String(error) });
          });
        return () => controller.abort();
      }, [sessionId]);

      React.useEffect(() => {
        const previous = document.activeElement;
        dialogRef.current?.focus();
        return () => {
          abortRef.current?.abort();
          if (previous && typeof previous.focus === "function") previous.focus();
        };
      }, []);

      const busy = job.status === "running";
      const dismiss = () => {
        abortRef.current?.abort();
        close();
      };
      const onKeyDown = event => {
        if (event.key === "Escape") {
          event.stopPropagation();
          dismiss();
        }
      };

      const ready = outline.status === "ready" ? outline.value : undefined;
      const summaryInfo = ready?.summary;
      const imageInfo = ready?.image;
      const saveInfo = ready?.save;
      const models = summaryInfo?.models || [];
      const model = models.find(candidate => routeKey(candidate) === modelKey);
      const rounds = ready?.rounds || [];
      const allKeys = messageKeys(rounds);
      const width = imageInfo ? parseIntIn(widthText, imageInfo.width) : undefined;
      const fontAuto = width ? autoFontSize(width) : 24;
      const fontSize = fontText.trim() === "" ? null : imageInfo ? parseIntIn(fontText, imageInfo.fontSize) : undefined;
      const wantsSummary = tools === "summary" || thinking === "summary";
      const showModel = summaryInfo?.available === true && wantsSummary;
      const usesModel = model !== undefined && wantsSummary;
      const estimate = usesModel ? rounds.filter(round => selected.has(`${round.index}:a`)).reduce((sum, round) => sum + round.activityGroups, 0) : 0;
      const saving = saveInfo?.available === true && delivery === "save";
      const imageInvalid = format === "image" && (width === undefined || fontSize === undefined);
      const modelMissing = thinking === "summary" && model === undefined;

      const setAll = predicate => setSelected(new Set(allKeys.filter(predicate)));
      const toggle = key => setSelected(current => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });

      const pickFolder = async () => {
        try {
          const value = await postJson(ROUTES.pick, {});
          if (value && typeof value.path === "string") setDirectory(value.path);
        } catch (error) {
          setNotice({ tone: "error", text: fill(t("result.openFailed"), { error: error instanceof Error ? error.message : String(error) }) });
        }
      };

      const openPath = async (path, action) => {
        setNotice(null);
        try {
          await postJson(ROUTES.open, { path, action });
        } catch (error) {
          setNotice({ tone: "error", text: fill(t("result.openFailed"), { error: error instanceof Error ? error.message : String(error) }) });
        }
      };

      const runExport = async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        setNotice(null);
        setJob({ status: "running", kind: usesModel ? "summaries" : format === "image" ? "image" : "plain" });
        savePrefs({
          format, theme, delivery, directory,
          width: width ?? prefs.width,
          fontSize: fontSize === null ? undefined : fontSize,
          modelKey: model ? routeKey(model) : ""
        });
        const parts = rounds
          .map(round => ({ index: round.index, user: selected.has(`${round.index}:u`), assistant: selected.has(`${round.index}:a`) }))
          .filter(part => part.user || part.assistant);
        try {
          const value = await postJson(ROUTES.render, {
            sessionId,
            parts,
            format,
            theme,
            tools,
            thinking,
            model: usesModel ? { provider: model.provider, model: model.model } : null,
            image: format === "image" ? { width, fontSize } : undefined,
            delivery: saving ? "save" : "download",
            directory: saving ? directory : undefined,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }, controller.signal);
          if (value.delivery === "download") {
            for (let i = 0; i < value.files.length; i++) {
              if (i > 0) await new Promise(resolve => setTimeout(resolve, 400));
              const file = value.files[i];
              saveBlob(base64Blob(file.base64, file.mime), file.name);
            }
          }
          setJob({ status: "done", result: value });
        } catch (error) {
          if (controller.signal.aborted) return;
          setJob({ status: "error", error: error instanceof Error ? error.message : String(error) });
        } finally {
          if (abortRef.current === controller) abortRef.current = null;
        }
      };

      let content;
      if (outline.status === "loading") content = h("div", { className: "cxp-center" }, t("dialog.loading"));
      else if (outline.status === "error") content = h("div", { className: "cxp-center" }, fill(t("dialog.loadFailed"), { error: outline.error }));
      else {
        const levelOptions = allowSummary => LEVELS
          .filter(level => level !== "summary" || allowSummary)
          .map(level => ({ value: level, label: t(`level.${level}`) }));
        const presetId = (imageInfo.presets.find(preset => preset.width === width) || {}).id || "custom";
        content = h(React.Fragment, null,
          h(Row, { label: t("field.format") },
            h(Segmented, { label: t("field.format"), value: format, onChange: setFormat, options: [
              { value: "markdown", label: t("format.markdown") },
              { value: "html", label: t("format.html") },
              { value: "image", label: t("format.image"), disabled: !imageInfo.available }
            ] }),
            !imageInfo.available ? h(Hint, null, fill(t("format.imageUnavailable"), { reason: imageInfo.reason || "" })) : null),
          format !== "markdown" ? h(Row, { label: t("field.theme") },
            h(Segmented, { label: t("field.theme"), value: theme, onChange: setTheme, options: THEMES.map(value => ({ value, label: t(`theme.${value}`) })) })) : null,
          format === "image" ? h(Row, { label: t("field.width") },
            h(Segmented, {
              label: t("field.width"),
              value: presetId,
              onChange: id => {
                const preset = imageInfo.presets.find(entry => entry.id === id);
                if (preset) setWidthText(String(preset.width));
              },
              options: [
                ...imageInfo.presets.map(preset => ({ value: preset.id, label: `${t(`preset.${preset.id}`)} ${preset.width}` })),
                { value: "custom", label: t("preset.custom") }
              ]
            }),
            h("div", { className: "cxp-inline" },
              h("input", {
                className: "cxp-input num",
                inputMode: "numeric",
                "aria-label": t("field.width"),
                value: widthText,
                onChange: event => setWidthText(event.target.value.replace(/[^\d]/g, ""))
              }),
              h("span", { className: "cxp-unit" }, "px"),
              h("span", { className: "cxp-unit" }, t("field.fontSize")),
              h("input", {
                className: "cxp-input num",
                inputMode: "numeric",
                "aria-label": t("field.fontSize"),
                placeholder: fill(t("font.auto"), { n: fontAuto }),
                value: fontText,
                onChange: event => setFontText(event.target.value.replace(/[^\d]/g, ""))
              }),
              h("span", { className: "cxp-unit" }, "px"),
              h("button", { type: "button", className: "cxp-link", onClick: () => { setWidthText(String(imageInfo.width.default)); setFontText(""); } }, t("width.reset"))),
            width === undefined
              ? h(Hint, { tone: "error" }, fill(t("width.invalid"), imageInfo.width))
              : fontSize === undefined
                ? h(Hint, { tone: "error" }, fill(t("font.invalid"), imageInfo.fontSize))
                : h(Hint, null, fill(t("width.hint"), { px: width * imageInfo.scale, scale: imageInfo.scale, font: fontSize ?? fontAuto }))) : null,
          h(Row, { label: t("field.tools") },
            h(Segmented, { label: t("field.tools"), value: tools, onChange: setTools, options: levelOptions(true) }),
            h(Hint, null, t(`hint.tools.${tools}`), tools === "summary" && !usesModel ? ` ${t("hint.tools.rule")}` : "")),
          h(Row, { label: t("field.thinking") },
            h(Segmented, { label: t("field.thinking"), value: thinking, onChange: setThinking, options: levelOptions(summaryInfo.available) }),
            h(Hint, null, summaryInfo.available ? t(`hint.thinking.${thinking}`) : `${t(`hint.thinking.${thinking}`)} ${t("hint.thinking.noModel")}`)),
          showModel ? h(Row, { label: t("field.model") },
            h("select", {
              className: "cxp-select",
              "aria-label": t("field.model"),
              value: modelKey,
              onChange: event => setModelKey(event.target.value)
            },
              h("option", { value: "" }, t("model.none")),
              models.map(candidate => h("option", { key: routeKey(candidate), value: routeKey(candidate) }, candidate.label))),
            modelMissing ? h(Hint, { tone: "warn" }, t("model.required")) : estimate > 0 ? h(Hint, null, fill(t("model.calls"), { n: estimate })) : null) : null,
          saveInfo.available ? h(Row, { label: t("field.save") },
            h(Segmented, { label: t("field.save"), value: delivery, onChange: setDelivery, options: [
              { value: "save", label: t("save.folder") },
              { value: "download", label: t("save.download") }
            ] }),
            delivery === "save" ? h("div", { className: "cxp-inline" },
              h("input", {
                className: "cxp-input path",
                "aria-label": t("save.placeholder"),
                placeholder: t("save.placeholder"),
                value: directory,
                spellCheck: false,
                onChange: event => setDirectory(event.target.value)
              }),
              saveInfo.picker ? h("button", { type: "button", className: "cxp-btn outline sm", onClick: pickFolder }, t("save.choose")) : null) : null) : null,
          h(Row, { label: t("field.messages") },
            rounds.length === 0 ? h(Hint, null, t("messages.empty")) : h(React.Fragment, null,
              h("div", { className: "cxp-bar" },
                h("span", null, fill(t("messages.count"), { n: selected.size, total: allKeys.length })),
                h("button", { type: "button", className: "cxp-link", onClick: () => setAll(() => true) }, t("messages.all")),
                h("button", { type: "button", className: "cxp-link", onClick: () => setAll(key => key.endsWith(":u")) }, t("messages.users")),
                h("button", { type: "button", className: "cxp-link", onClick: () => setAll(key => key.endsWith(":a")) }, t("messages.assistants")),
                h("button", { type: "button", className: "cxp-link", onClick: () => setAll(() => false) }, t("messages.none"))),
              h("div", { className: "cxp-list", role: "group", "aria-label": t("field.messages") },
                rounds.map(round => {
                  const userKey = `${round.index}:u`;
                  const assistantKey = `${round.index}:a`;
                  const meta = [];
                  if (round.tools > 0) meta.push(fill(t("round.tools"), { n: round.tools }));
                  if (round.reasoning > 0) meta.push(fill(t("round.reasoning"), { n: round.reasoning }));
                  const prompt = round.prompt || (round.images > 0 ? fill(t("round.images"), { n: round.images }) : "");
                  return h("div", { key: round.index, className: "cxp-round" },
                    h("div", { className: "cxp-round-head" }, [fill(t("round.label"), { n: round.index + 1 }), formatTime(round.time)].filter(Boolean).join(" · ")),
                    round.hasPrompt ? h("label", { className: "cxp-msg" },
                      h("input", { type: "checkbox", checked: selected.has(userKey), onChange: () => toggle(userKey) }),
                      h("span", { className: "cxp-role" }, t("role.user")),
                      h("div", { className: "cxp-msg-main" }, h("div", { className: "cxp-msg-text", title: round.prompt }, prompt))) : null,
                    round.hasAssistant ? h("label", { className: "cxp-msg" },
                      h("input", { type: "checkbox", checked: selected.has(assistantKey), onChange: () => toggle(assistantKey) }),
                      h("span", { className: "cxp-role" }, t("role.assistant")),
                      h("div", { className: "cxp-msg-main" },
                        h("div", { className: "cxp-msg-text", title: round.answer }, round.answer || t("round.noReply")),
                        meta.length > 0 ? h("div", { className: "cxp-msg-meta" }, meta.join(" · ")) : null)) : null);
                })))));
      }

      let result = null;
      if (job.status === "done") {
        const value = job.result;
        const files = value.files;
        const lines = [];
        if (value.delivery === "save") {
          lines.push(files.length === 1 ? fill(t("result.saved"), { path: files[0].path }) : fill(t("result.savedMany"), { n: files.length, dir: value.directory }));
        } else {
          lines.push(files.length === 1 ? fill(t("result.downloaded"), { file: files[0].name }) : fill(t("result.downloadedMany"), { n: files.length }));
        }
        if (value.summaryFailures > 0) lines.push(fill(t("result.partial"), { n: value.summaryFailures }));
        const first = files[0];
        result = h("div", { className: "cxp-result", role: "status" },
          lines.map((line, i) => h("div", { key: i, className: i === 0 ? "cxp-result-text ok" : "cxp-result-text" }, line)),
          value.delivery === "save" && first ? h("div", { className: "cxp-result-actions" },
            h("button", { type: "button", className: "cxp-btn outline sm", onClick: () => openPath(first.path, "open") }, files.length === 1 ? t("result.open") : t("result.openFirst")),
            h("button", { type: "button", className: "cxp-btn outline sm", onClick: () => openPath(first.path, "reveal") }, t(`result.reveal.${saveInfo?.fileManager || "directory"}`)),
            h("button", {
              type: "button",
              className: "cxp-btn outline sm",
              onClick: () => copyText(files.length === 1 ? first.path : value.directory)
                .then(() => setNotice({ tone: "ok", text: t("result.copied") }))
                .catch(error => setNotice({ tone: "error", text: String(error) }))
            }, t("result.copy"))) : null,
          notice ? h("div", { className: `cxp-result-text ${notice.tone}` }, notice.text) : null);
      } else if (job.status === "error") {
        result = h("div", { className: "cxp-result", role: "alert" }, h("div", { className: "cxp-result-text error" }, fill(t("result.failed"), { error: job.error })));
      } else if (notice) {
        result = h("div", { className: "cxp-result", role: "alert" }, h("div", { className: `cxp-result-text ${notice.tone}` }, notice.text));
      }

      const busyText = job.kind === "summaries" ? t("action.exportingSummaries") : job.kind === "image" ? t("action.exportingImage") : t("action.exporting");
      const canExport = ready !== undefined && selected.size > 0 && !busy && !imageInvalid && !modelMissing && !(saving && directory.trim() === "");
      const titleId = "cxp-title-" + String(sessionId).replace(/[^\w-]/g, "_");
      return h("div", { className: "cxp-root", onKeyDown },
        h(Styles),
        h("div", { className: "cxp-mask", onClick: busy ? undefined : dismiss }),
        h("div", { className: "cxp-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, tabIndex: -1, ref: dialogRef },
          h("div", { className: "cxp-header" },
            h("h2", { className: "cxp-title", id: titleId },
              t("dialog.title"),
              (ready?.title || title) ? h("span", { className: "cxp-subtitle" }, ` · ${ready?.title || title}`) : null),
            h("button", { type: "button", className: "cxp-close", "aria-label": t("dialog.close"), onClick: dismiss }, h(CloseIcon))),
          h("div", { className: "cxp-body" }, content),
          result,
          h("div", { className: "cxp-footer" },
            h("div", { className: "cxp-status", role: "status" }, busy ? busyText : ""),
            h("button", { type: "button", className: "cxp-btn outline", onClick: dismiss }, busy ? t("action.cancel") : t("dialog.close")),
            h("button", { type: "button", className: "cxp-btn primary", disabled: !canExport, onClick: runExport }, busy ? busyText : t("action.export")))));
    }

    function ExportOverlay({ store, close, t }) {
      const request = useStore(store);
      if (request === null) return null;
      return h(ExportDialog, { key: request.nonce, request, close, t });
    }

    /* --------------------------------- apply -------------------------------- */

    const inject = ["slots", "locale"];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "conversation-export: dictionaries");
      const store = createStore(null);
      let nonce = 0;
      const open = (sessionId, title) => store.set({ sessionId, title: title || "", nonce: ++nonce });
      const close = () => store.set(null);
      ctx.effect(() => () => store.set(null), "conversation-export: dialog state");
      ctx.slots.inject("sidebar.workspaces.session.menu.item", () => ctx.slots.register({
        name: "sidebar.workspaces.session.menu.item",
        id: "dsh-conversation-export/menu",
        order: 460,
        locale: NS,
        inject: () => ({ open })
      }, ExportMenuItem));
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({
        name: "shell.overlay",
        id: "dsh-conversation-export/dialog",
        locale: NS,
        inject: () => ({ store, close })
      }, ExportOverlay));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
