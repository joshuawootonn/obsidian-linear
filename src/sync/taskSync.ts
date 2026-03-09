import {Notice, TAbstractFile, TFile} from "obsidian";
import type ObsidianLinearPlugin from "../main";
import {MissingWorkspaceTokenError} from "../linear/client";
import {createTaskSnapshot, parseTaskReferences, syncTasksWithLinear, type TaskSnapshotEntry} from "./taskParser";

const SELF_MANAGED_WRITE_WINDOW_MS = 2_000;
const TITLE_SYNC_DEBOUNCE_MS = 1_000;

type PendingTitleSync = {
	filePath: string;
	taskUrl: string;
	timerId: number;
	title: string;
};

export class TaskSyncService {
	private readonly selfManagedWrites = new Map<string, number>();
	private readonly snapshotsByPath = new Map<string, Map<string, TaskSnapshotEntry>>();
	private readonly lastOpenStateByIssueKey = new Map<string, string>();
	private readonly pendingTitleSyncs = new Map<string, PendingTitleSync>();

	constructor(private readonly plugin: ObsidianLinearPlugin) {}

	cleanup(): void {
		for (const pendingSync of this.pendingTitleSyncs.values()) {
			window.clearTimeout(pendingSync.timerId);
		}

		this.pendingTitleSyncs.clear();
	}

	async syncCurrentFileFromLinear(): Promise<void> {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Open a note to sync its linked tasks.");
			return;
		}

		await this.syncFileFromLinear(file, true);
	}

	async syncVaultFromLinear(): Promise<void> {
		const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
		for (const file of markdownFiles) {
			await this.syncFileFromLinear(file, true);
		}
	}

	async handleVaultModify(file: TAbstractFile): Promise<void> {
		if (!(file instanceof TFile) || file.extension !== "md") {
			return;
		}

		const lockUntil = this.selfManagedWrites.get(file.path);
		if (lockUntil && Date.now() < lockUntil) {
			return;
		}

		const markdown = await this.plugin.app.vault.cachedRead(file);
		if (!markdown.includes("linear.app/")) {
			this.snapshotsByPath.delete(file.path);
			this.clearPendingTitleSyncsForFile(file.path);
			return;
		}

		const tasks = parseTaskReferences(markdown);
		const currentSnapshot = createTaskSnapshot(tasks);
		const previousSnapshot = this.snapshotsByPath.get(file.path);
		this.snapshotsByPath.set(file.path, currentSnapshot);

		if (!previousSnapshot) {
			return;
		}

		for (const task of tasks) {
			const previousTask = previousSnapshot.get(task.issueKey);
			if (!previousTask) {
				continue;
			}

			const checkedChanged = previousTask.checked !== task.checked;
			const titleChanged = previousTask.titleText !== task.titleText;
			if (!checkedChanged && !titleChanged) {
				this.clearPendingTitleSync(task.issueKey);
				continue;
			}

			if (checkedChanged) {
				this.clearPendingTitleSync(task.issueKey);
				await this.syncTaskCheckedState(task);
			}

			if (titleChanged) {
				this.scheduleTitleSync(file.path, task.issueKey, task.url, task.titleText || task.identifier);
			}
		}
	}

	async syncFileFromLinear(file: TFile, force = false): Promise<void> {
		if (file.extension !== "md") {
			return;
		}

		const markdown = await this.plugin.app.vault.cachedRead(file);
		if (!markdown.includes("linear.app/")) {
			this.snapshotsByPath.delete(file.path);
			this.clearPendingTitleSyncsForFile(file.path);
			return;
		}

		const tasks = parseTaskReferences(markdown);
		if (tasks.length === 0) {
			this.snapshotsByPath.set(file.path, new Map());
			return;
		}

		const desiredTaskStates = new Map<string, {checked: boolean; title: string}>();
		for (const task of tasks) {
			try {
				const issue = await this.plugin.client.fetchIssueByUrl(task.url, force);
				this.plugin.rememberIssueStatus(issue);
				desiredTaskStates.set(task.issueKey, {
					checked: issue.state.type === "completed",
					title: issue.title,
				});
				this.clearPendingTitleSync(task.issueKey);
				if (issue.state.type !== "completed") {
					this.lastOpenStateByIssueKey.set(task.issueKey, issue.state.id);
				}
			} catch (error) {
				if (error instanceof MissingWorkspaceTokenError) {
					this.plugin.rememberPendingWorkspace(error.workspaceSlug);
					continue;
				}

				console.error("Obsidian Linear sync failed", error);
			}
		}

		const result = syncTasksWithLinear(markdown, desiredTaskStates);
		if (result.changed) {
			this.selfManagedWrites.set(file.path, Date.now() + SELF_MANAGED_WRITE_WINDOW_MS);
			await this.plugin.app.vault.process(file, () => result.markdown);
		}

		this.snapshotsByPath.set(file.path, createTaskSnapshot(parseTaskReferences(result.markdown)));
	}

	private async syncTaskCheckedState(task: {
		checked: boolean;
		identifier: string;
		issueKey: string;
		url: string;
	}): Promise<void> {
		try {
			const updatedIssue = await this.plugin.client.setIssueChecked(task.url, task.checked, {
				lastOpenStateId: this.lastOpenStateByIssueKey.get(task.issueKey),
				reopenStrategy: this.plugin.settings.reopenStateStrategy,
				preferredCompletedStateName: this.plugin.settings.preferredCompletedStateName,
				preferredReopenStateName: this.plugin.settings.preferredReopenStateName,
			});
			this.plugin.notifyIssueStatusChanged(updatedIssue);

			if (updatedIssue.state.type !== "completed") {
				this.lastOpenStateByIssueKey.set(task.issueKey, updatedIssue.state.id);
			}
		} catch (error) {
			this.handleSyncError(error, "Could not update Linear issue.");
		}
	}

	private scheduleTitleSync(filePath: string, issueKey: string, taskUrl: string, title: string): void {
		const existingSync = this.pendingTitleSyncs.get(issueKey);
		if (existingSync) {
			window.clearTimeout(existingSync.timerId);
		}

		const timerId = window.setTimeout(() => {
			void this.flushPendingTitleSync(issueKey);
		}, TITLE_SYNC_DEBOUNCE_MS);

		this.pendingTitleSyncs.set(issueKey, {
			filePath,
			taskUrl,
			timerId,
			title,
		});
	}

	private async flushPendingTitleSync(issueKey: string): Promise<void> {
		const pendingSync = this.pendingTitleSyncs.get(issueKey);
		if (!pendingSync) {
			return;
		}

		this.pendingTitleSyncs.delete(issueKey);

		try {
			const updatedIssue = await this.plugin.client.setIssueTitle(pendingSync.taskUrl, pendingSync.title);
			this.plugin.notifyIssueStatusChanged(updatedIssue);

			if (updatedIssue.state.type !== "completed") {
				this.lastOpenStateByIssueKey.set(issueKey, updatedIssue.state.id);
			}

			const file = this.plugin.app.vault.getAbstractFileByPath(pendingSync.filePath);
			if (file instanceof TFile) {
				await this.syncFileFromLinear(file);
			}
		} catch (error) {
			this.handleSyncError(error, "Could not update Linear issue title.");
		}
	}

	private clearPendingTitleSync(issueKey: string): void {
		const pendingSync = this.pendingTitleSyncs.get(issueKey);
		if (!pendingSync) {
			return;
		}

		window.clearTimeout(pendingSync.timerId);
		this.pendingTitleSyncs.delete(issueKey);
	}

	private clearPendingTitleSyncsForFile(filePath: string): void {
		for (const [issueKey, pendingSync] of this.pendingTitleSyncs.entries()) {
			if (pendingSync.filePath !== filePath) {
				continue;
			}

			window.clearTimeout(pendingSync.timerId);
			this.pendingTitleSyncs.delete(issueKey);
		}
	}

	private handleSyncError(error: unknown, fallbackMessage: string): void {
		if (error instanceof MissingWorkspaceTokenError) {
			new Notice(`Linear workspace "${error.workspaceSlug}" is not connected.`);
			return;
		}

		new Notice(error instanceof Error ? error.message : fallbackMessage);
	}
}
