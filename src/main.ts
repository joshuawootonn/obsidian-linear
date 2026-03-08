import {Editor, Notice, Plugin} from "obsidian";
import {createLivePreviewStatusExtension} from "./editor/livePreviewStatusExtension";
import {createPasteExtension} from "./editor/pasteExtension";
import {LinearClient} from "./linear/client";
import type {TaskSeed} from "./linear/types";
import {extractLinearIssueReferences} from "./linear/workspaces";
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
	}

	async loadSettings(): Promise<void> {
		const loaded = await this.loadData() as Partial<LinearPluginSettings> | null;
		this.settings = sanitizeSettings(Object.assign({}, DEFAULT_SETTINGS, loaded ?? {}));
	}

	async saveSettings(): Promise<void> {
		this.settings = sanitizeSettings(this.settings);
		await this.saveData(this.settings);
		this.restartPolling();
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

	async convertLinearUrlsToTasks(input: string): Promise<string> {
		const parsedReferences = extractLinearIssueReferences(input);
		if (parsedReferences.length === 0) {
			return input;
		}

		const seeds: TaskSeed[] = [];
		for (const parsedReference of parsedReferences) {
			try {
				const issue = await this.client.fetchIssueByUrl(parsedReference.normalizedUrl);
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
