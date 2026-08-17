import {MarkdownRenderChild, Notice, parseYaml, setIcon} from "obsidian";
import type ObsidianLinearPlugin from "../main";
import type {LinearDayIssue, LinearWorkflowState} from "../linear/types";
import {getIssueStatusIcon, renderStatusIcon} from "../render/statusIcons";
import type {DaySnapshot, DaySnapshotIdentity, DaySnapshotIssue} from "./snapshots";

const DAY_VIEW_REFRESH_MS = 5 * 60_000;
const DEFAULT_DAY_STATUS = "Today";

interface LinearDayViewConfig {
	date: string;
	dateEnd: string;
	dateStart: string;
	isCurrentDay: boolean;
	statusName: string;
	timezone: string;
	workspaceSlug: string;
}

interface DayBlockInput {
	date?: unknown;
	status?: unknown;
	workspace?: unknown;
}

export function registerLinearDayView(plugin: ObsidianLinearPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor("linear-day", (source, element, context) => {
		const child = new LinearDayRenderChild(plugin, element, source, context.sourcePath);
		context.addChild(child);
	});
}

class LinearDayRenderChild extends MarkdownRenderChild {
	private rendering = false;

	constructor(
		private readonly plugin: ObsidianLinearPlugin,
		containerEl: HTMLElement,
		private readonly source: string,
		private readonly sourcePath: string,
	) {
		super(containerEl);
	}

	override onload(): void {
		void this.render();
		this.registerInterval(window.setInterval(() => {
			void this.render();
		}, DAY_VIEW_REFRESH_MS));
	}

	private async render(): Promise<void> {
		if (this.rendering) {
			return;
		}

		this.rendering = true;
		try {
			await this.plugin.importDaySnapshotsFromNote(this.sourcePath);
			const config = resolveConfig(this.plugin, this.source, this.sourcePath);
			this.renderLoading(config);
			const liveIssues = await this.plugin.client.fetchAssignedDayIssues({
				dateEnd: config.dateEnd,
				dateStart: config.dateStart,
				includeCurrentStatus: config.isCurrentDay,
				statusName: config.statusName,
				workspaceSlug: config.workspaceSlug,
			});
			const snapshot = await this.updateSnapshot(config, liveIssues);
			this.renderDay(config, snapshot, liveIssues);
		} catch (error) {
			this.renderError(error);
		} finally {
			this.rendering = false;
		}
	}

	private async updateSnapshot(config: LinearDayViewConfig, liveIssues: LinearDayIssue[]): Promise<DaySnapshot | null> {
		const identity = toSnapshotIdentity(config);
		if (!config.isCurrentDay) {
			return this.plugin.getDaySnapshot(identity);
		}

		const statusIssues = liveIssues.filter((issue) => namesEqual(issue.state.name, config.statusName));
		return this.plugin.captureDaySnapshot(identity, statusIssues, new Date().toISOString(), this.sourcePath);
	}

	private renderLoading(config: LinearDayViewConfig): void {
		this.containerEl.empty();
		this.containerEl.className = "obsidian-linear-day";
		const header = this.containerEl.createDiv({cls: "obsidian-linear-day__header"});
		header.createDiv({
			cls: "obsidian-linear-day__title",
			text: formatDayTitle(config.date),
		});
		header.createDiv({
			cls: "obsidian-linear-day__loading",
			text: "Loading Linear issues…",
		});
	}

	private renderDay(config: LinearDayViewConfig, snapshot: DaySnapshot | null, liveIssues: LinearDayIssue[]): void {
		this.containerEl.empty();
		this.containerEl.className = "obsidian-linear-day";

		const header = this.containerEl.createDiv({cls: "obsidian-linear-day__header"});
		const heading = header.createDiv();
		heading.createDiv({
			cls: "obsidian-linear-day__title",
			text: formatDayTitle(config.date),
		});
		heading.createDiv({
			cls: "obsidian-linear-day__meta",
			text: `${config.workspaceSlug} · ${config.timezone}`,
		});

		const refreshButton = header.createEl("button", {
			attr: {"aria-label": "Refresh day view"},
			cls: "clickable-icon obsidian-linear-day__refresh",
		});
		setIcon(refreshButton, "refresh-cw");
		refreshButton.addEventListener("click", () => {
			void this.render();
		});

		const liveById = new Map(liveIssues.map((issue) => [issue.id, issue]));
		const planned = Object.values(snapshot?.issues ?? {});
		const completed = liveIssues.filter((issue) => completedDuring(issue, config));

		this.renderSection(
			`${config.statusName} plan`,
			planned,
			(entry) => this.renderPlannedIssue(entry, liveById.get(entry.id)),
			`No issues have been observed in ${config.statusName} for this day.`,
		);
		this.renderSection(
			"Completed",
			completed,
			(issue) => this.renderLiveIssue(issue, completionTime(issue.completedAt)),
			"No assigned issues were completed on this day.",
		);

		if (config.isCurrentDay) {
			this.containerEl.createDiv({
				cls: "obsidian-linear-day__footnote",
				text: "The plan is append-only and refreshes every five minutes while this view is open.",
			});
		}
	}

	private renderSection<T>(
		title: string,
		items: T[],
		renderItem: (item: T) => HTMLElement,
		emptyText: string,
	): void {
		const section = this.containerEl.createDiv({cls: "obsidian-linear-day__section"});
		const heading = section.createDiv({cls: "obsidian-linear-day__section-heading"});
		heading.createSpan({text: title});
		heading.createSpan({cls: "obsidian-linear-day__count", text: String(items.length)});

		if (items.length === 0) {
			section.createDiv({cls: "obsidian-linear-day__empty", text: emptyText});
			return;
		}

		const list = section.createDiv({cls: "obsidian-linear-day__list"});
		for (const item of items) {
			list.append(renderItem(item));
		}
	}

	private renderPlannedIssue(snapshotIssue: DaySnapshotIssue, liveIssue: LinearDayIssue | undefined): HTMLElement {
		return this.buildIssueRow({
			identifier: snapshotIssue.identifier,
			state: liveIssue?.state ?? snapshotIssue.state,
			subtitle: liveIssue ? liveIssue.state.name : `Captured ${formatCaptureTime(snapshotIssue.firstSeenAt)}`,
			title: liveIssue?.title ?? snapshotIssue.title,
			url: liveIssue?.url ?? snapshotIssue.url,
		});
	}

	private renderLiveIssue(issue: LinearDayIssue, subtitle: string): HTMLElement {
		return this.buildIssueRow({
			identifier: issue.identifier,
			state: issue.state,
			subtitle,
			title: issue.title,
			url: issue.url,
		});
	}

	private buildIssueRow(issue: {
		identifier: string;
		state: LinearWorkflowState;
		subtitle: string;
		title: string;
		url: string;
	}): HTMLElement {
		const row = document.createElement("a");
		row.className = "obsidian-linear-day__issue";
		row.href = issue.url;
		row.setAttribute("target", "_blank");
		row.setAttribute("rel", "noopener noreferrer");

		const icon = row.createSpan({cls: "obsidian-linear-day__status-icon"});
		renderStatusIcon(icon, getIssueStatusIcon(issue.state));

		const content = row.createDiv({cls: "obsidian-linear-day__issue-content"});
		content.createDiv({cls: "obsidian-linear-day__issue-title", text: issue.title});
		const details = content.createDiv({cls: "obsidian-linear-day__issue-details"});
		details.createSpan({text: issue.identifier});
		details.createSpan({text: issue.subtitle});

		const externalIcon = row.createSpan({cls: "obsidian-linear-day__external-icon"});
		setIcon(externalIcon, "arrow-up-right");
		return row;
	}

	private renderError(error: unknown): void {
		this.containerEl.empty();
		this.containerEl.className = "obsidian-linear-day obsidian-linear-day--error";
		this.containerEl.createDiv({cls: "obsidian-linear-day__title", text: "Could not load Linear day"});
		this.containerEl.createDiv({
			cls: "obsidian-linear-day__empty",
			text: error instanceof Error ? error.message : "Unexpected Linear error.",
		});
		const button = this.containerEl.createEl("button", {text: "Retry"});
		button.addEventListener("click", () => {
			new Notice("Refreshing day view…");
			void this.render();
		});
	}
}

function resolveConfig(plugin: ObsidianLinearPlugin, source: string, sourcePath: string): LinearDayViewConfig {
	const parsed = (parseYaml(source) ?? {}) as DayBlockInput;
	const workspaceSlug = resolveWorkspace(plugin, toOptionalString(parsed.workspace));
	const date = resolveDate(toOptionalDate(parsed.date), sourcePath);
	const dayStart = parseLocalDate(date);
	const nextDay = new Date(dayStart);
	nextDay.setDate(nextDay.getDate() + 1);

	return {
		date,
		dateEnd: nextDay.toISOString(),
		dateStart: dayStart.toISOString(),
		isCurrentDay: date === formatLocalDate(new Date()),
		statusName: toOptionalString(parsed.status) ?? DEFAULT_DAY_STATUS,
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time",
		workspaceSlug,
	};
}

function resolveWorkspace(plugin: ObsidianLinearPlugin, requested: string | null): string {
	if (requested) {
		return requested.trim().toLowerCase();
	}

	const connected = plugin.settings.connections.filter((connection) => connection.apiToken.trim().length > 0);
	if (connected.length === 1 && connected[0]) {
		return connected[0].workspaceSlug;
	}
	if (connected.length === 0) {
		throw new Error("Connect a Linear workspace in plugin settings first.");
	}
	throw new Error("Add `workspace: your-workspace-slug` to this block because multiple workspaces are connected.");
}

function resolveDate(requested: string | null, sourcePath: string): string {
	if (requested && requested !== "today") {
		parseLocalDate(requested);
		return requested;
	}

	const filename = sourcePath.split("/").pop()?.replace(/\.md$/i, "") ?? "";
	if (/^\d{4}-\d{2}-\d{2}$/.test(filename)) {
		parseLocalDate(filename);
		return filename;
	}

	return formatLocalDate(new Date());
}

function parseLocalDate(value: string): Date {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) {
		throw new Error(`Invalid Linear day date "${value}". Use YYYY-MM-DD.`);
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		throw new Error(`Invalid Linear day date "${value}".`);
	}
	return date;
}

function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function formatDayTitle(date: string): string {
	return new Intl.DateTimeFormat(undefined, {
		day: "numeric",
		month: "long",
		weekday: "long",
		year: "numeric",
	}).format(parseLocalDate(date));
}

function formatCaptureTime(value: string): string {
	return new Intl.DateTimeFormat(undefined, {hour: "numeric", minute: "2-digit"}).format(new Date(value));
}

function completionTime(value: string | null): string {
	if (!value) {
		return "Completed";
	}
	return `Completed ${new Intl.DateTimeFormat(undefined, {hour: "numeric", minute: "2-digit"}).format(new Date(value))}`;
}

function completedDuring(issue: LinearDayIssue, config: LinearDayViewConfig): boolean {
	if (!issue.completedAt) {
		return false;
	}
	const completedAt = Date.parse(issue.completedAt);
	return completedAt >= Date.parse(config.dateStart) && completedAt < Date.parse(config.dateEnd);
}

function namesEqual(left: string, right: string): boolean {
	return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function toSnapshotIdentity(config: LinearDayViewConfig): DaySnapshotIdentity {
	return {
		date: config.date,
		statusName: config.statusName,
		timezone: config.timezone,
		workspaceSlug: config.workspaceSlug,
	};
}

function toOptionalString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toOptionalDate(value: unknown): string | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		const year = value.getUTCFullYear();
		const month = String(value.getUTCMonth() + 1).padStart(2, "0");
		const day = String(value.getUTCDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}
	return toOptionalString(value);
}
