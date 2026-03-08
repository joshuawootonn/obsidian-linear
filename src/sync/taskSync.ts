import {Notice, TAbstractFile, TFile} from "obsidian";
import type ObsidianLinearPlugin from "../main";
import {MissingWorkspaceTokenError} from "../linear/client";
import {createTaskSnapshot, parseTaskReferences, syncTaskCheckboxes} from "./taskParser";

export class TaskSyncService {
	private readonly selfManagedWrites = new Map<string, number>();
	private readonly snapshotsByPath = new Map<string, Map<string, boolean>>();
	private readonly lastOpenStateByIssueKey = new Map<string, string>();

	constructor(private readonly plugin: ObsidianLinearPlugin) {}

	async syncCurrentFileFromLinear(): Promise<void> {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Open a note to sync its linked tasks.");
			return;
		}

		await this.syncFileFromLinear(file);
	}

	async syncVaultFromLinear(): Promise<void> {
		const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
		for (const file of markdownFiles) {
			await this.syncFileFromLinear(file);
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
			const previousChecked = previousSnapshot.get(task.issueKey);
			if (previousChecked === undefined || previousChecked === task.checked) {
				continue;
			}

			try {
				const updatedIssue = await this.plugin.client.setIssueChecked(task.url, task.checked, {
					lastOpenStateId: this.lastOpenStateByIssueKey.get(task.issueKey),
					reopenStrategy: this.plugin.settings.reopenStateStrategy,
					preferredCompletedStateName: this.plugin.settings.preferredCompletedStateName,
					preferredReopenStateName: this.plugin.settings.preferredReopenStateName,
				});

				if (updatedIssue.state.type !== "completed") {
					this.lastOpenStateByIssueKey.set(task.issueKey, updatedIssue.state.id);
				}
			} catch (error) {
				if (error instanceof MissingWorkspaceTokenError) {
					new Notice(`Linear workspace "${error.workspaceSlug}" is not connected.`);
				} else {
					new Notice(error instanceof Error ? error.message : "Could not update Linear issue.");
				}
			}
		}
	}

	async syncFileFromLinear(file: TFile): Promise<void> {
		if (file.extension !== "md") {
			return;
		}

		const markdown = await this.plugin.app.vault.cachedRead(file);
		if (!markdown.includes("linear.app/")) {
			this.snapshotsByPath.delete(file.path);
			return;
		}

		const tasks = parseTaskReferences(markdown);
		if (tasks.length === 0) {
			this.snapshotsByPath.set(file.path, new Map());
			return;
		}

		const desiredCheckedStates = new Map<string, boolean>();
		for (const task of tasks) {
			try {
				const issue = await this.plugin.client.fetchIssueByUrl(task.url);
				desiredCheckedStates.set(task.issueKey, issue.state.type === "completed");
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

		const result = syncTaskCheckboxes(markdown, desiredCheckedStates);
		if (result.changed) {
			this.selfManagedWrites.set(file.path, Date.now() + 2_000);
			await this.plugin.app.vault.process(file, () => result.markdown);
		}

		this.snapshotsByPath.set(file.path, createTaskSnapshot(parseTaskReferences(result.markdown)));
	}
}
