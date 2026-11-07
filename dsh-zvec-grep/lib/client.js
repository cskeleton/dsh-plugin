/**
 * Browser half of `dsh-zvec-grep`, written in the lazy-CJS module format
 * served by DSH's Module Loader (`window.__ModuleLoader__.load({ id, factory })`).
 *
 * Registers the bundle's configuration card into `plugins.bundle.config`
 * (`key: "dsh-zvec-grep"`), allowing users to add/remove `autoIndexRoots`
 * directories and toggle the English query-translation guard directly on the
 * `dsh-zvec-grep` Plugin Detail page in the GUI.
 */
window.__ModuleLoader__.load({
	id: "dsh-zvec-grep",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const React = require("react");
		const h = React.createElement;

		const NS = "zvec-grep-settings";
		const BUNDLE_KEY = "dsh-zvec-grep";
		const SETTINGS_ENDPOINT = "/api/dsh-zvec-grep/settings";
		const SETTINGS_HEADER = "x-dsh-zvec-grep-settings";
		const STYLE_ID = "dsh-zvec-grep-settings-style";

		const zh = {
			rootsTitle: "自动建索引的目录范围（按子项目）",
			rootsDesc:
				"当搜索以下范围内的具体子项目时，若尚未建立 .zvec-grep 索引，插件会自动按子项目根目录执行 zg index；范围外的目录在搜索时会弹窗询问是否建立索引。",
			inputPlaceholder: "输入目录路径，例如 ~/Dev 或 /Users/gc/Projects",
			addBtn: "添加目录",
			removeBtn: "移除",
			emptyRoots: "暂未配置自动索引目录（所有未索引项目均会在搜索时询问）",
			guardTitle: "强制将代码检索翻译为英文",
			guardDesc:
				"拦截未翻译的纯中文语义查询，要求 Agent 先转化为英文技术词再检索代码库（双语 queries 仍可正常搜中文文档）。",
			savedHint: "已保存并即时生效",
			errorHint: "保存失败，请重试",
		};

		const en = {
			rootsTitle: "Auto-Index Root Directories (Per Subproject)",
			rootsDesc:
				"When searching a concrete subproject under these directories without an existing .zvec-grep index, the plugin automatically runs zg index on that subproject root. Directories outside this list will prompt before indexing.",
			inputPlaceholder: "Enter directory path, e.g. ~/Dev or /Users/gc/Projects",
			addBtn: "Add Directory",
			removeBtn: "Remove",
			emptyRoots: "No auto-index directories configured (all unindexed projects will prompt on search).",
			guardTitle: "Require English Query Translation for Code Search",
			guardDesc:
				"Block untranslated CJK-only queries so the Agent translates them into English technical terms before searching code (bilingual queries arrays remain allowed).",
			savedHint: "Saved and active immediately",
			errorHint: "Failed to save settings",
		};

		const CARD_CSS = `
.dshzg_card {
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding: 14px 16px;
	border-radius: 10px;
	border: 0.5px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.22));
	background: var(--dsw-alias-bg-layer-2, transparent);
}
.dshzg_section {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.dshzg_divider {
	height: 0.5px;
	background: var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.2));
}
.dshzg_header_row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
}
.dshzg_label_box {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
	flex: 1;
}
.dshzg_title {
	font-size: 13px;
	font-weight: 500;
	line-height: 20px;
	color: var(--dsw-alias-label-primary, inherit);
}
.dshzg_desc {
	font-size: 12px;
	line-height: 18px;
	color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.85));
}
.dshzg_list {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.dshzg_item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 6px 10px;
	border-radius: 6px;
	border: 0.5px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.2));
	background: var(--dsw-alias-bg-layer-1, transparent);
}
.dshzg_path {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 12px;
	line-height: 18px;
	color: var(--dsw-alias-label-primary, inherit);
	word-break: break-all;
}
.dshzg_empty {
	font-size: 12px;
	line-height: 18px;
	color: var(--dsw-alias-label-tertiary, rgba(128, 128, 128, 0.7));
	padding: 4px 0;
}
.dshzg_add_row {
	display: flex;
	align-items: center;
	gap: 8px;
}
.dshzg_input {
	flex: 1;
	min-width: 0;
	height: 30px;
	padding: 0 10px;
	border-radius: 6px;
	border: 0.5px solid var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.32));
	background: var(--dsw-alias-bg-layer-1, transparent);
	color: var(--dsw-alias-label-primary, inherit);
	font-size: 12px;
	outline: none;
}
.dshzg_btn {
	height: 30px;
	padding: 0 12px;
	border-radius: 6px;
	border: 0.5px solid var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.32));
	background: var(--dsw-alias-bg-layer-1, transparent);
	color: var(--dsw-alias-label-primary, inherit);
	font-size: 12px;
	font-weight: 500;
	cursor: pointer;
	white-space: nowrap;
}
.dshzg_btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
.dshzg_btn_remove {
	height: 24px;
	padding: 0 8px;
	font-size: 11px;
}
.dshzg_switch {
	position: relative;
	width: 36px;
	height: 20px;
	border-radius: 999px;
	border: none;
	padding: 2px;
	cursor: pointer;
	background: var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.35));
	transition: background 0.15s ease;
	flex-shrink: 0;
}
.dshzg_switch[aria-checked="true"] {
	background: var(--dsw-alias-brand-primary, #3b82f6);
}
.dshzg_switch_thumb {
	display: block;
	width: 16px;
	height: 16px;
	border-radius: 50%;
	background: #ffffff;
	transition: transform 0.15s ease;
}
.dshzg_switch[aria-checked="true"] .dshzg_switch_thumb {
	transform: translateX(16px);
}
.dshzg_status {
	font-size: 11px;
	line-height: 16px;
	color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.85));
}
`;

		function ensureStyle() {
			if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
			if (document.getElementById(STYLE_ID) !== null) return;
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CARD_CSS;
			(document.head ?? document.documentElement)?.appendChild?.(style);
		}

		async function fetchSettings() {
			const res = await fetch(SETTINGS_ENDPOINT, {
				method: "GET",
				headers: { accept: "application/json" },
				credentials: "same-origin",
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return await res.json();
		}

		async function postSettings(patch) {
			const res = await fetch(SETTINGS_ENDPOINT, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json",
					[SETTINGS_HEADER]: "1",
				},
				credentials: "same-origin",
				body: JSON.stringify(patch),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return await res.json();
		}

		function ZvecGrepSettingsCard(props) {
			ensureStyle();
			if (props && props.view === "summary") return null;
			const t = props && typeof props.t === "function" ? props.t : (k) => zh[k] ?? k;

			const [roots, setRoots] = React.useState(["~/Dev"]);
			const [requireEnglish, setRequireEnglish] = React.useState(true);
			const [draftPath, setDraftPath] = React.useState("");
			const [busy, setBusy] = React.useState(false);
			const [statusText, setStatusText] = React.useState("");

			React.useEffect(() => {
				let cancelled = false;
				fetchSettings()
					.then((data) => {
						if (cancelled || !data) return;
						if (Array.isArray(data.autoIndexRoots)) setRoots(data.autoIndexRoots);
						if (typeof data.requireEnglishQuery === "boolean") setRequireEnglish(data.requireEnglishQuery);
					})
					.catch(() => {});
				return () => {
					cancelled = true;
				};
			}, []);

			const savePatch = (nextPatch) => {
				setBusy(true);
				setStatusText("");
				postSettings(nextPatch)
					.then((data) => {
						if (data && Array.isArray(data.autoIndexRoots)) setRoots(data.autoIndexRoots);
						if (data && typeof data.requireEnglishQuery === "boolean") {
							setRequireEnglish(data.requireEnglishQuery);
						}
						setStatusText(t("savedHint"));
					})
					.catch(() => {
						setStatusText(t("errorHint"));
					})
					.finally(() => {
						setBusy(false);
					});
			};

			const onAddRoot = () => {
				const trimmed = draftPath.trim();
				if (!trimmed || busy) return;
				const nextRoots = roots.includes(trimmed) ? roots : [...roots, trimmed];
				setDraftPath("");
				setRoots(nextRoots);
				savePatch({ autoIndexRoots: nextRoots, requireEnglishQuery: requireEnglish });
			};

			const onRemoveRoot = (target) => {
				if (busy) return;
				const nextRoots = roots.filter((item) => item !== target);
				setRoots(nextRoots);
				savePatch({ autoIndexRoots: nextRoots, requireEnglishQuery: requireEnglish });
			};

			const onToggleGuard = () => {
				if (busy) return;
				const nextVal = !requireEnglish;
				setRequireEnglish(nextVal);
				savePatch({ autoIndexRoots: roots, requireEnglishQuery: nextVal });
			};

			return h(
				"div",
				{ className: "dshzg_card", "data-testid": "zvec-grep-settings-card" },
				h(
					"div",
					{ className: "dshzg_section" },
					h(
						"div",
						{ className: "dshzg_label_box" },
						h("span", { className: "dshzg_title" }, t("rootsTitle")),
						h("span", { className: "dshzg_desc" }, t("rootsDesc"))
					),
					h(
						"div",
						{ className: "dshzg_list" },
						roots.length === 0
							? h("div", { className: "dshzg_empty" }, t("emptyRoots"))
							: roots.map((dirPath) =>
									h(
										"div",
										{ key: dirPath, className: "dshzg_item" },
										h("span", { className: "dshzg_path" }, dirPath),
										h(
											"button",
											{
												type: "button",
												className: "dshzg_btn dshzg_btn_remove",
												disabled: busy,
												onClick: () => onRemoveRoot(dirPath),
											},
											t("removeBtn")
										)
									)
							  )
					),
					h(
						"div",
						{ className: "dshzg_add_row" },
						h("input", {
							type: "text",
							className: "dshzg_input",
							value: draftPath,
							disabled: busy,
							placeholder: t("inputPlaceholder"),
							onChange: (e) => setDraftPath(e.target.value),
							onKeyDown: (e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									onAddRoot();
								}
							},
						}),
						h(
							"button",
							{
								type: "button",
								className: "dshzg_btn",
								disabled: busy || !draftPath.trim(),
								onClick: onAddRoot,
							},
							t("addBtn")
						)
					)
				),
				h("div", { className: "dshzg_divider" }),
				h(
					"div",
					{ className: "dshzg_header_row" },
					h(
						"div",
						{ className: "dshzg_label_box" },
						h("span", { className: "dshzg_title" }, t("guardTitle")),
						h("span", { className: "dshzg_desc" }, t("guardDesc"))
					),
					h(
						"button",
						{
							type: "button",
							role: "switch",
							"aria-checked": requireEnglish,
							"aria-label": t("guardTitle"),
							className: "dshzg_switch",
							disabled: busy,
							onClick: onToggleGuard,
						},
						h("span", { className: "dshzg_switch_thumb" })
					)
				),
				statusText ? h("div", { className: "dshzg_status" }, statusText) : null
			);
		}

		const inject = ["slots", "locale"];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-zvec-grep: dictionaries");
			ctx.slots.inject("plugins.bundle.config", () =>
				ctx.slots.register(
					{
						name: "plugins.bundle.config",
						key: BUNDLE_KEY,
						locale: NS,
					},
					ZvecGrepSettingsCard
				)
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.ZvecGrepSettingsCard = ZvecGrepSettingsCard;
		return module.exports;
	},
});
