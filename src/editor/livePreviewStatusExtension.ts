import {StateEffect, StateField} from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import {Notice, setIcon} from "obsidian";
import type ObsidianLinearPlugin from "../main";
import {MissingWorkspaceTokenError} from "../linear/client";
import {getLivePreviewStatusMatch} from "./livePreviewStatusMatches";
import {
	getErrorStatusIcon,
	getIssueStatusIcon,
	getLoadingStatusIcon,
	getMissingConnectionStatusIcon,
	type StatusIconConfig,
} from "../render/statusIcons";

const setDecorationsEffect = StateEffect.define<DecorationSet>();

const livePreviewStatusField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, transaction) {
		decorations = decorations.map(transaction.changes);

		for (const effect of transaction.effects) {
			if (effect.is(setDecorationsEffect)) {
				decorations = effect.value;
			}
		}

		return decorations;
	},
	provide: (field) => EditorView.decorations.from(field),
});

export function createLivePreviewStatusExtension(plugin: ObsidianLinearPlugin) {
	return [
		livePreviewStatusField,
		ViewPlugin.fromClass(class LivePreviewStatusPlugin {
			private readonly statuses = new Map<string, StatusIconConfig>();
			private readonly inFlight = new Set<string>();

			constructor(private readonly view: EditorView) {
				this.refresh();
			}

			update(update: ViewUpdate): void {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet ||
					update.focusChanged
				) {
					this.refresh();
				}
			}

			private refresh(): void {
				if (!isLivePreview(this.view)) {
					this.applyDecorations(Decoration.none);
					return;
				}

				const decorations = [];
				for (const range of this.view.visibleRanges) {
					let line = this.view.state.doc.lineAt(range.from);
					while (line.from <= range.to) {
						const match = getLivePreviewStatusMatch(line.text);
						if (match) {
							const issueKey = `${match.workspaceSlug}:${match.identifier.toUpperCase()}`;
							const status = this.statuses.get(issueKey) ?? getLoadingStatusIcon();
							decorations.push(
								Decoration.widget({
									widget: new InlineStatusWidget(plugin, status, match.workspaceSlug),
									side: -1,
								}).range(line.from + match.linkStart),
							);

							if (!this.statuses.has(issueKey) && !this.inFlight.has(issueKey)) {
								this.inFlight.add(issueKey);
								void this.fetchStatus(issueKey, match.url, match.workspaceSlug);
							}
						}

						if (line.to >= range.to) {
							break;
						}

						line = this.view.state.doc.line(line.number + 1);
					}
				}

				this.applyDecorations(Decoration.set(decorations, true));
			}

			private async fetchStatus(issueKey: string, url: string, workspaceSlug: string): Promise<void> {
				try {
					const issue = await plugin.client.fetchIssueByUrl(url);
					this.statuses.set(issueKey, getIssueStatusIcon(issue.state));
				} catch (error) {
					if (error instanceof MissingWorkspaceTokenError) {
						this.statuses.set(issueKey, getMissingConnectionStatusIcon());
					} else {
						this.statuses.set(issueKey, getErrorStatusIcon());
					}
				} finally {
					this.inFlight.delete(issueKey);
					this.refresh();
				}
			}

			private applyDecorations(decorations: DecorationSet): void {
				this.view.dispatch({
					effects: setDecorationsEffect.of(decorations),
				});
			}
		}),
	];
}

class InlineStatusWidget extends WidgetType {
	constructor(
		private readonly plugin: ObsidianLinearPlugin,
		private readonly config: StatusIconConfig,
		private readonly workspaceSlug: string,
	) {
		super();
	}

	override eq(other: InlineStatusWidget): boolean {
		return (
			this.config.icon === other.config.icon &&
			this.config.label === other.config.label &&
			this.config.spin === other.config.spin &&
			this.config.tone === other.config.tone &&
			this.workspaceSlug === other.workspaceSlug
		);
	}

	override toDOM(): HTMLElement {
		const status = document.createElement("span");
		status.className = `obsidian-linear-inline-status obsidian-linear-inline-status--${this.config.tone}`;
		status.setAttribute("title", this.config.label);
		status.setAttribute("aria-hidden", "true");
		if (this.config.spin) {
			status.classList.add("obsidian-linear-inline-status--spin");
		}

		setIcon(status, this.config.icon);

		if (this.config.icon === getMissingConnectionStatusIcon().icon) {
			status.classList.add("obsidian-linear-inline-status--clickable");
			status.removeAttribute("aria-hidden");
			status.setAttribute("role", "button");
			status.setAttribute("aria-label", `Connect workspace ${this.workspaceSlug}`);
			status.tabIndex = 0;

			const openSettings = (): void => {
				this.plugin.openSettingsForWorkspace(this.workspaceSlug);
				new Notice(`Open settings to connect "${this.workspaceSlug}".`);
			};

			status.addEventListener("click", openSettings);
			status.addEventListener("keydown", (event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					openSettings();
				}
			});
		}

		return status;
	}

	override ignoreEvent(): boolean {
		return false;
	}
}

function isLivePreview(view: EditorView): boolean {
	const markdownSourceView = view.dom.closest(".markdown-source-view");
	return markdownSourceView?.classList.contains("is-live-preview") ?? false;
}
