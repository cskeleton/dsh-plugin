/**
 * Browser half of the copy-session-id plugin, hand-written in the lazy-CJS
 * module format the web client's Module Loader serves (`factory(require)`).
 * Registers one row into the Session row's "..." menu
 * (`sidebar.workspaces.session.menu.item`, order 500 — after the shipped
 * Archive row at 400, opening a new group) that copies the row's Session id.
 */
window.__ModuleLoader__.load({
	id: "dsh-client-ui-copy-session-id",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		/** Dictionary namespace owned by this plugin. */
		const NS = "copy-session-id";
		/** Unique occupant id inside the Session "..." menu list slot. */
		const ENTRY_ID = "copy-session-id";
		const zh = { copyId: "复制会话 ID" };
		const en = { copyId: "Copy Session ID" };

		/**
		 * Write text to the clipboard, falling back to a hidden textarea when
		 * the async Clipboard API is unavailable or rejects.
		 * @param text - text to copy.
		 */
		function copyText(text) {
			const fallback = () => {
				try {
					const area = document.createElement("textarea");
					area.value = text;
					area.style.position = "fixed";
					area.style.opacity = "0";
					document.body.appendChild(area);
					area.select();
					document.execCommand("copy");
					area.remove();
				} catch {}
			};
			try {
				if (typeof navigator === "undefined" || navigator.clipboard === void 0 || navigator.clipboard === null) {
					fallback();
					return;
				}
				navigator.clipboard.writeText(text).catch(fallback);
			} catch {
				fallback();
			}
		}

		/**
		 * Menu row (order 500): copy the row's Session id, then dismiss the menu
		 * through the injected `useMenuOpenState` hook, as the shipped rows do.
		 * @param props - owner share (`sessionId`), menu open state, and `t`.
		 * @returns the row.
		 */
		function CopySessionIdMenuItem({ sessionId, useMenuOpenState, t }) {
			const [, setMenuOpen] = useMenuOpenState();
			return react.createElement(
				_deepseek_ai_dsh_client_ui_primitives.MenuItemButton,
				{
					separatorBefore: true,
					icon: react.createElement(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutlineRegular),
					onSelect: () => {
						setMenuOpen(false);
						copyText(sessionId);
					}
				},
				t("copyId")
			);
		}

		/** Services required by this plugin. */
		const inject = ["slots", "locale"];

		/**
		 * Register the copy-session-id menu row once the slot declaration is on
		 * the ledger (`slots.inject` re-registers after owner restoration).
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "copy-session-id: dictionaries");
			ctx.slots.inject("sidebar.workspaces.session.menu.item", () => ctx.slots.register({
				name: "sidebar.workspaces.session.menu.item",
				id: ENTRY_ID,
				order: 500,
				locale: NS
			}, CopySessionIdMenuItem));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
