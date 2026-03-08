import {MarkdownRenderChild, Notice, setIcon} from "obsidian";
import type ObsidianLinearPlugin from "../main";
import {MissingWorkspaceTokenError} from "../linear/client";
import type {LinearIssue} from "../linear/types";
import {parseLinearIssueUrl} from "../linear/workspaces";
import {
	getErrorStatusIcon,
	getIssueStatusIcon,
	getLoadingStatusIcon,
	getMissingConnectionStatusIcon,
	type StatusIconConfig,
} from "./statusIcons";

export function registerLinkRenderer(plugin: ObsidianLinearPlugin): void {
	plugin.registerMarkdownPostProcessor((element, context) => {
		const links = Array.from(element.querySelectorAll<HTMLAnchorElement>("a.external-link"));

		for (const link of links) {
			const parsed = parseLinearIssueUrl(link.href);
			if (!parsed || link.closest(".obsidian-linear-card")) {
				continue;
			}

			const child = new LinearIssueRenderChild(
				plugin,
				link,
				parsed.normalizedUrl,
				Boolean(link.closest("li.task-list-item")),
			);
			context.addChild(child);
		}
	});
}

class LinearIssueRenderChild extends MarkdownRenderChild {
	constructor(
		private readonly plugin: ObsidianLinearPlugin,
		private readonly linkEl: HTMLAnchorElement,
		private readonly issueUrl: string,
		private readonly inlineStatusOnly: boolean,
	) {
		super(linkEl);
	}

	override onload(): void {
		void this.render();
	}

	private async render(): Promise<void> {
		const parsed = parseLinearIssueUrl(this.issueUrl);
		if (!parsed) {
			return;
		}

		if (this.inlineStatusOnly) {
			await this.renderInlineStatus(parsed.workspaceSlug);
			return;
		}

		const loadingCard = this.buildCard(`Loading ${parsed.identifier}...`, parsed.workspaceSlug, this.issueUrl, {
			statusLabel: "Loading",
		});
		this.linkEl.replaceWith(loadingCard);
		this.containerEl = loadingCard;

		try {
			const issue = await this.plugin.client.fetchIssueByUrl(this.issueUrl);
			this.plugin.rememberIssueStatus(issue);
			const issueCard = this.buildIssueCard(issue);
			loadingCard.replaceWith(issueCard);
			this.containerEl = issueCard;
		} catch (error) {
			const fallbackCard = error instanceof MissingWorkspaceTokenError
				? this.buildMissingConnectionCard(parsed.workspaceSlug)
				: this.buildCard(`Could not load ${parsed.identifier}`, parsed.workspaceSlug, this.issueUrl, {
					statusLabel: "Error",
					description: error instanceof Error ? error.message : "Unexpected Linear error",
				});

			loadingCard.replaceWith(fallbackCard);
			this.containerEl = fallbackCard;
		}
	}

	private async renderInlineStatus(workspaceSlug: string): Promise<void> {
		this.linkEl.classList.add("obsidian-linear-inline-link");
		const loadingStatus = this.buildInlineStatus(getLoadingStatusIcon());
		this.linkEl.before(loadingStatus);
		this.containerEl = loadingStatus;

		try {
			const issue = await this.plugin.client.fetchIssueByUrl(this.issueUrl);
			this.plugin.rememberIssueStatus(issue);
			const inlineStatus = this.buildInlineStatus(getIssueStatusIcon(issue.state));
			inlineStatus.setAttribute("aria-label", issue.state.name);
			loadingStatus.replaceWith(inlineStatus);
			this.containerEl = inlineStatus;
		} catch (error) {
			const fallbackStatus = error instanceof MissingWorkspaceTokenError
				? this.buildMissingConnectionStatus(workspaceSlug)
				: this.buildInlineStatus(getErrorStatusIcon());

			loadingStatus.replaceWith(fallbackStatus);
			this.containerEl = fallbackStatus;
		}
	}

	private buildIssueCard(issue: LinearIssue): HTMLElement {
		return this.buildCard(issue.title, issue.workspaceSlug, issue.url, {
			identifier: issue.identifier,
			statusLabel: issue.state.name,
		});
	}

	private buildMissingConnectionCard(workspaceSlug: string): HTMLElement {
		const card = document.createElement("div");
		card.className = "obsidian-linear-card obsidian-linear-card--missing";
		card.tabIndex = 0;

		const heading = card.createDiv({cls: "obsidian-linear-card__title"});
		heading.setText("This workspace is not connected.");

		const details = card.createDiv({cls: "obsidian-linear-card__description"});
		details.setText(`Workspace "${workspaceSlug}" needs a personal API token before this issue can load.`);

		const action = card.createDiv({cls: "obsidian-linear-card__action"});
		action.setText("Click to open plugin settings");

		const openSettings = (): void => {
			this.plugin.openSettingsForWorkspace(workspaceSlug);
			new Notice(`Open settings to connect "${workspaceSlug}".`);
		};

		card.addEventListener("click", openSettings);
		card.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				openSettings();
			}
		});

		return card;
	}

	private buildMissingConnectionStatus(workspaceSlug: string): HTMLElement {
		const status = this.buildInlineStatus(getMissingConnectionStatusIcon());
		status.classList.add("obsidian-linear-inline-status--clickable");
		status.removeAttribute("aria-hidden");
		status.setAttribute("role", "button");
		status.setAttribute("aria-label", `Connect workspace ${workspaceSlug}`);
		status.tabIndex = 0;

		const openSettings = (): void => {
			this.plugin.openSettingsForWorkspace(workspaceSlug);
			new Notice(`Open settings to connect "${workspaceSlug}".`);
		};

		status.addEventListener("click", openSettings);
		status.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				openSettings();
			}
		});

		return status;
	}

	private buildInlineStatus(config: StatusIconConfig): HTMLElement {
		const status = document.createElement("span");
		status.className = `obsidian-linear-inline-status obsidian-linear-inline-status--${config.tone}`;
		status.setAttribute("title", config.label);
		status.setAttribute("aria-hidden", "true");
		if (config.spin) {
			status.classList.add("obsidian-linear-inline-status--spin");
		}

		setIcon(status, config.icon);
		return status;
	}

	private buildCard(
		title: string,
		workspaceSlug: string,
		issueUrl: string,
		options: {
			description?: string;
			identifier?: string;
			statusLabel: string;
		},
	): HTMLElement {
		const card = document.createElement("a");
		card.className = "obsidian-linear-card";
		card.href = issueUrl;
		card.setAttribute("target", "_blank");
		card.setAttribute("rel", "noopener noreferrer");

		const header = card.createDiv({cls: "obsidian-linear-card__header"});
		const workspaceEl = header.createSpan({cls: "obsidian-linear-card__workspace"});
		workspaceEl.setText(workspaceSlug);

		const statusEl = header.createSpan({cls: "obsidian-linear-card__status"});
		statusEl.setText(options.statusLabel);

		if (options.identifier) {
			const identifierEl = card.createDiv({cls: "obsidian-linear-card__identifier"});
			identifierEl.setText(options.identifier);
		}

		const titleEl = card.createDiv({cls: "obsidian-linear-card__title"});
		titleEl.setText(title);

		if (options.description) {
			const descriptionEl = card.createDiv({cls: "obsidian-linear-card__description"});
			descriptionEl.setText(options.description);
		}

		return card;
	}
}
