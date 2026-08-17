import {Editor, Notice, Plugin, TFile} from "obsidian";
import type {EditorView} from "@codemirror/view";
import {extractNoteDaySnapshots, upsertNoteDaySnapshot} from "./day/noteSnapshots";
import {
	captureDayIssues as captureSnapshotIssues,
	getDaySnapshot as findDaySnapshot,
	mergeDaySnapshots,
	sanitizeDaySnapshots,
	updateSnapshotIssue,
	type DaySnapshot,
	type DaySnapshotIdentity,
	type DaySnapshots,
} from "./day/snapshots";
import {registerLinearDayView} from "./day/view";
import {createLivePreviewStatusExtension} from "./editor/livePreviewStatusExtension";
import {forceLivePreviewStatusRefresh} from "./editor/livePreviewRefresh";
import {createPasteExtension} from "./editor/pasteExtension";
import {LinearClient} from "./linear/client";
import type {LinearDayIssue, LinearIssue, LinearWorkflowState, TaskSeed} from "./linear/types";
import {extractLinearIssueReferences, getIssueKey} from "./linear/workspaces";
import {registerLinkRenderer} from "./render/linkRenderer";
import {
	DEFAULT_SETTINGS,
	ObsidianLinearSettingTab,
	type LinearPluginSettings,
	sanitizeSettings,
} from "./settings";
import {TaskSyncService} from "./sync/taskSync";
import {buildTasksFromSeeds} from "./sync/taskParser";

type InternalAppSettings = {
	open: () => void;
	openTabById: (id: string) => void;
};

export default class ObsidianLinearPlugin extends Plugin {
	settings: LinearPluginSettings;
	client: LinearClient;
	taskSync: TaskSyncService;
	pendingWorkspaceSlug?: string;
	private pollIntervalId: number | null = null;
	private readonly livePreviewViews = new Set<EditorView>();
	private readonly issueStatesByKey = new Map<string, LinearWorkflowState>();
	private daySnapshots: DaySnapshots = {};
	private dataSave = Promise.resolve();

	async onload(): Promise<void> {
		await this.loadSettings();

		this.client = new LinearClient(() => this.settings);
		this.taskSync = new TaskSyncService(this);

		this.addSettingTab(new ObsidianLinearSettingTab(this.app, this));
		this.registerEditorExtension([
			createPasteExtension(this),
			createLivePreviewStatusExtension(this),
		]);
		registerLinkRenderer(this);
		registerLinearDayView(this);

		this.registerEvent(this.app.vault.on("modify", (file) => {
			void this.taskSync.handleVaultModify(file);
		}));
		this.registerEvent(this.app.workspace.on("file-open", (file) => {
			if (file) {
				void this.taskSync.syncFileFromLinear(file);
			}
		}));

		this.registerCommands();
		this.restartPolling();
	}

	override onunload(): void {
		this.clearPolling();
		this.taskSync.cleanup();
	}

	async loadSettings(): Promise<void> {
		const loaded = await this.loadData() as (Partial<LinearPluginSettings> & {daySnapshots?: unknown}) | null;
		this.settings = sanitizeSettings(Object.assign({}, DEFAULT_SETTINGS, loaded ?? {}));
		this.daySnapshots = sanitizeDaySnapshots(loaded?.daySnapshots);
	}

	async saveSettings(): Promise<void> {
		this.settings = sanitizeSettings(this.settings);
		await this.persistData();
		this.restartPolling();
	}

	getDaySnapshot(identity: DaySnapshotIdentity): DaySnapshot | null {
		return findDaySnapshot(this.daySnapshots, identity);
	}

	async captureDaySnapshot(
		identity: DaySnapshotIdentity,
		issues: LinearDayIssue[],
		capturedAt: string,
		sourcePath?: string,
	): Promise<DaySnapshot> {
		const result = captureSnapshotIssues(this.daySnapshots, identity, issues, capturedAt);
		if (result.changed) {
			await this.persistData();
			if (sourcePath) {
				await this.writeDaySnapshotToNote(sourcePath, result.snapshot);
			}
		}
		return result.snapshot;
	}

	async importDaySnapshotsFromNote(sourcePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) {
			return;
		}

		const content = await this.app.vault.cachedRead(file);
		if (mergeDaySnapshots(this.daySnapshots, extractNoteDaySnapshots(content))) {
			await this.persistData();
		}
	}

	async updateDaySnapshotIssue(
		identity: DaySnapshotIdentity,
		issue: LinearIssue,
		sourcePath: string,
	): Promise<void> {
		const result = updateSnapshotIssue(this.daySnapshots, identity, issue, new Date().toISOString());
		if (!result.changed || !result.snapshot) {
			return;
		}

		await this.persistData();
		await this.writeDaySnapshotToNote(sourcePath, result.snapshot);
	}

	rememberPendingWorkspace(workspaceSlug: string): void {
		if (!workspaceSlug) {
			return;
		}

		this.pendingWorkspaceSlug = workspaceSlug.trim().toLowerCase();
	}

	openSettingsForWorkspace(workspaceSlug?: string): void {
		if (workspaceSlug) {
			this.rememberPendingWorkspace(workspaceSlug);
		}

		const settings = (this.app as typeof this.app & {setting?: InternalAppSettings}).setting;
		if (!settings) {
			new Notice("Open settings and select this plugin to add a workspace token.");
			return;
		}

		settings.open();
		settings.openTabById(this.manifest.id);
	}

	registerLivePreviewView(view: EditorView): void {
		this.livePreviewViews.add(view);
	}

	unregisterLivePreviewView(view: EditorView): void {
		this.livePreviewViews.delete(view);
	}

	rememberIssueStatus(issue: LinearIssue): void {
		this.issueStatesByKey.set(getIssueKey(issue), issue.state);
	}

	getRememberedIssueState(issueKey: string): LinearWorkflowState | null {
		return this.issueStatesByKey.get(issueKey) ?? null;
	}

	notifyIssueStatusChanged(issue: LinearIssue): void {
		this.rememberIssueStatus(issue);
		this.refreshLivePreviewStatuses();
	}

	refreshLivePreviewStatuses(): void {
		for (const view of this.livePreviewViews) {
			forceLivePreviewStatusRefresh(view);
		}
	}

	async convertLinearUrlsToTasks(input: string): Promise<string> {
		const parsedReferences = extractLinearIssueReferences(input);
		if (parsedReferences.length === 0) {
			return input;
		}

		const seeds: TaskSeed[] = [];
		for (const parsedReference of parsedReferences) {
			try {
				const issue = await this.client.fetchIssueByUrl(parsedReference.normalizedUrl);
				this.rememberIssueStatus(issue);
				seeds.push({
					identifier: issue.identifier,
					title: issue.title,
					url: issue.url,
				});
			} catch (error) {
				if (error instanceof Error && "workspaceSlug" in error) {
					this.rememberPendingWorkspace(String(error.workspaceSlug));
				}

				seeds.push({
					identifier: parsedReference.identifier,
					title: parsedReference.title ?? "Linear issue",
					url: parsedReference.normalizedUrl,
				});
			}
		}

		return buildTasksFromSeeds(seeds, this.settings.taskFormat);
	}

	private registerCommands(): void {
		this.addCommand({
			id: "paste-linear-urls-as-tasks",
			name: "Paste links as tasks",
			editorCallback: async (editor: Editor) => {
				const selection = editor.getSelection();
				const source = selection || await navigator.clipboard.readText();
				if (!source) {
					new Notice("Copy one or more issue links first.");
					return;
				}

				editor.replaceSelection(await this.convertLinearUrlsToTasks(source));
			},
		});

		this.addCommand({
			id: "refresh-linear-issue-statuses-current-file",
			name: "Refresh linked issue statuses in current file",
			callback: () => this.taskSync.syncCurrentFileFromLinear(),
		});

		this.addCommand({
			id: "sync-linear-issue-statuses-vault",
			name: "Sync linked issue statuses across vault",
			callback: async () => {
				new Notice("Syncing linked issue statuses across the vault...");
				await this.taskSync.syncVaultFromLinear();
				new Notice("Finished syncing linked issue statuses.");
			},
		});

		this.addCommand({
			id: "open-linear-workspace-settings",
			name: "Open workspace settings",
			callback: () => this.openSettingsForWorkspace(this.pendingWorkspaceSlug),
		});
	}

	private persistData(): Promise<void> {
		this.dataSave = this.dataSave
			.catch(() => undefined)
			.then(() => this.saveData({
				...this.settings,
				daySnapshots: this.daySnapshots,
			}));
		return this.dataSave;
	}

	private async writeDaySnapshotToNote(sourcePath: string, snapshot: DaySnapshot): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) {
			return;
		}

		await this.app.vault.process(file, (content) => upsertNoteDaySnapshot(content, snapshot));
	}

	private restartPolling(): void {
		this.clearPolling();

		if (this.settings.pollIntervalMinutes <= 0) {
			return;
		}

		this.pollIntervalId = window.setInterval(() => {
			void this.taskSync.syncVaultFromLinear();
		}, this.settings.pollIntervalMinutes * 60 * 1000);

		this.registerInterval(this.pollIntervalId);
	}

	private clearPolling(): void {
		if (this.pollIntervalId === null) {
			return;
		}

		window.clearInterval(this.pollIntervalId);
		this.pollIntervalId = null;
	}
}
