import {App, FileSystemAdapter, Notice, PluginSettingTab, Setting} from "obsidian";
import ObsidianLinearPlugin from "./main";

export type TaskFormat = "single-line" | "two-line";
export type ReopenStateStrategy = "last-known" | "preferred-name" | "first-available";

export interface WorkspaceTokenMapping {
	workspaceSlug: string;
	apiToken: string;
}

export interface LinearPluginSettings {
	connections: WorkspaceTokenMapping[];
	pollIntervalMinutes: number;
	taskFormat: TaskFormat;
	preferredCompletedStateName: string;
	preferredReopenStateName: string;
	reopenStateStrategy: ReopenStateStrategy;
}

export const DEFAULT_SETTINGS: LinearPluginSettings = {
	connections: [],
	pollIntervalMinutes: 5,
	taskFormat: "two-line",
	preferredCompletedStateName: "Done",
	preferredReopenStateName: "Backlog",
	reopenStateStrategy: "last-known",
};

function normalizeConnection(connection: WorkspaceTokenMapping): WorkspaceTokenMapping {
	return {
		workspaceSlug: connection.workspaceSlug.trim().toLowerCase(),
		apiToken: connection.apiToken.trim(),
	};
}

export function sanitizeSettings(settings: LinearPluginSettings): LinearPluginSettings {
	const deduped = new Map<string, WorkspaceTokenMapping>();

	for (const connection of settings.connections) {
		const normalized = normalizeConnection(connection);
		if (!normalized.workspaceSlug) {
			continue;
		}

		deduped.set(normalized.workspaceSlug, normalized);
	}

	return {
		...settings,
		connections: Array.from(deduped.values()),
		preferredCompletedStateName: settings.preferredCompletedStateName.trim(),
		preferredReopenStateName: settings.preferredReopenStateName.trim(),
	};
}

export class ObsidianLinearSettingTab extends PluginSettingTab {
	plugin: ObsidianLinearPlugin;

	constructor(app: App, plugin: ObsidianLinearPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Connections and sync")
			.setHeading();

		containerEl.createEl("p", {
			text: "Map each workspace slug to a personal API token so issue previews and task sync can resolve the right connection automatically.",
		});

		this.renderPendingWorkspaceHint(containerEl);

		new Setting(containerEl)
			.setName("Poll interval")
			.setDesc("How often the plugin refreshes linked issue statuses.")
			.addDropdown((dropdown) => dropdown
				.addOption("0", "Off")
				.addOption("1", "1 minute")
				.addOption("5", "5 minutes")
				.addOption("15", "15 minutes")
				.setValue(String(this.plugin.settings.pollIntervalMinutes))
				.onChange(async (value) => {
					this.plugin.settings.pollIntervalMinutes = Number(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Preferred completed state")
			.setDesc("When you check a task, the plugin tries to use this completed state name first before falling back to the first completed state it finds.")
			.addText((text) => text
				.setPlaceholder("Done")
				.setValue(this.plugin.settings.preferredCompletedStateName)
				.onChange(async (value) => {
					this.plugin.settings.preferredCompletedStateName = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Preferred reopen state")
			.setDesc("When you uncheck a task, the plugin tries this state name if it cannot restore the last known open state.")
			.addText((text) => text
				.setPlaceholder("Backlog")
				.setValue(this.plugin.settings.preferredReopenStateName)
				.onChange(async (value) => {
					this.plugin.settings.preferredReopenStateName = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Reopen strategy")
			.setDesc("Pick how unchecked tasks should be reopened.")
			.addDropdown((dropdown) => dropdown
				.addOption("last-known", "Use last known open state")
				.addOption("preferred-name", "Use preferred reopen state name")
				.addOption("first-available", "Use first available open state")
				.setValue(this.plugin.settings.reopenStateStrategy)
				.onChange(async (value) => {
					this.plugin.settings.reopenStateStrategy = value as ReopenStateStrategy;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Workspace connections")
			.setHeading();

		containerEl.createEl("p", {
			text: "The workspace slug comes from the issue URL, for example `type-the-word` in `https://linear.app/type-the-word/issue/TYP-37/...`.",
		});

		for (const [index, connection] of this.plugin.settings.connections.entries()) {
			this.renderConnection(containerEl, connection, index);
		}

		new Setting(containerEl)
			.setName("Add workspace connection")
			.setDesc("Add another workspace slug and personal access token.")
			.addButton((button) => button
				.setButtonText("Add connection")
				.setCta()
				.onClick(async () => {
					this.plugin.settings.connections.push({
						workspaceSlug: this.plugin.pendingWorkspaceSlug ?? "",
						apiToken: "",
					});
					this.plugin.pendingWorkspaceSlug = undefined;
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(containerEl)
			.setName("Local testing")
			.setHeading();

		this.renderLocalTesting(containerEl);
	}

	private renderPendingWorkspaceHint(containerEl: HTMLElement): void {
		const pendingWorkspace = this.plugin.pendingWorkspaceSlug?.trim().toLowerCase();
		if (!pendingWorkspace) {
			return;
		}

		const alreadyConfigured = this.plugin.settings.connections.some((connection) => (
			connection.workspaceSlug.trim().toLowerCase() === pendingWorkspace
		));

		if (alreadyConfigured) {
			containerEl.createEl("p", {
				cls: "obsidian-linear-settings-hint",
				text: `Workspace "${pendingWorkspace}" is already configured below.`,
			});
			return;
		}

		new Setting(containerEl)
			.setName(`Connect workspace "${pendingWorkspace}"`)
			.setDesc("This workspace was discovered from an issue link in your vault.")
			.addButton((button) => button
				.setButtonText("Add mapping")
				.setCta()
				.onClick(async () => {
					this.plugin.settings.connections.unshift({
						workspaceSlug: pendingWorkspace,
						apiToken: "",
					});
					this.plugin.pendingWorkspaceSlug = undefined;
					await this.plugin.saveSettings();
					this.display();
				}));
	}

	private renderConnection(containerEl: HTMLElement, connection: WorkspaceTokenMapping, index: number): void {
		const setting = new Setting(containerEl)
			.setName(`Connection ${index + 1}`)
			.setDesc("Keep the workspace slug lowercase. Personal access tokens are workspace-scoped.");

		setting.addText((text) => text
			.setPlaceholder("Workspace slug")
			.setValue(connection.workspaceSlug)
			.onChange(async (value) => {
				const targetConnection = this.plugin.settings.connections[index];
				if (!targetConnection) {
					return;
				}

				targetConnection.workspaceSlug = value.trim().toLowerCase();
				await this.plugin.saveSettings();
			}));

		setting.addText((text) => {
			text.inputEl.type = "password";
			text
				.setPlaceholder("Personal access token")
				.setValue(connection.apiToken)
				.onChange(async (value) => {
					const targetConnection = this.plugin.settings.connections[index];
					if (!targetConnection) {
						return;
					}

					targetConnection.apiToken = value.trim();
					await this.plugin.saveSettings();
				});
		});

		setting.addExtraButton((button) => button
			.setIcon("trash")
			.setTooltip("Remove connection")
			.onClick(async () => {
				this.plugin.settings.connections.splice(index, 1);
				await this.plugin.saveSettings();
				this.display();
			}));
	}

	private renderLocalTesting(containerEl: HTMLElement): void {
		const vaultBasePath = this.getVaultBasePath();
		const installCommand = vaultBasePath
			? `pnpm install:vault ${quoteShellPath(vaultBasePath)}`
			: "pnpm install:vault /absolute/path/to/your/vault";

		new Setting(containerEl)
			.setName("Vault path")
			.setDesc(vaultBasePath ?? "This vault path is unavailable in the current adapter.")
			.addButton((button) => button
				.setButtonText("Copy path")
				.onClick(async () => {
					if (!vaultBasePath) {
						new Notice("This vault path is unavailable.");
						return;
					}

					await navigator.clipboard.writeText(vaultBasePath);
					new Notice("Copied vault path.");
				}));

		new Setting(containerEl)
			.setName("Install command")
			.setDesc(installCommand)
			.addButton((button) => button
				.setButtonText("Copy command")
				.setCta()
				.onClick(async () => {
					await navigator.clipboard.writeText(installCommand);
					new Notice("Copied install command.");
				}));

		containerEl.createEl("p", {
			text: "Run that command from the plugin project root to link or install this plugin into the current vault.",
		});
	}

	private getVaultBasePath(): string | null {
		if (!(this.app.vault.adapter instanceof FileSystemAdapter)) {
			return null;
		}

		return this.app.vault.adapter.getBasePath();
	}
}

function quoteShellPath(path: string): string {
	return `"${path.split("\"").join("\\\"")}"`;
}
