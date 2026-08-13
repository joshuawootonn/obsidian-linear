import {TFile} from "obsidian";
import {describe, expect, it, vi} from "vitest";
import type ObsidianLinearPlugin from "../main";
import {TaskSyncService} from "./taskSync";

const ISSUE_URL = "https://linear.app/type-the-word/issue/TYP-37/reach-out";

describe("TaskSyncService", () => {
	it("does not complete a Linear issue when the regular task above it is checked", async () => {
		let markdown = [
			"- [ ] Buy groceries",
			`- [ ] [TYP-37](${ISSUE_URL}) Reach out`,
		].join("\n");
		const setIssueChecked = vi.fn();
		const file = Object.assign(new TFile(), {path: "Tasks.md"});
		const plugin = {
			app: {
				vault: {
					cachedRead: vi.fn(async () => markdown),
				},
			},
			client: {
				setIssueChecked,
			},
			settings: {
				preferredCompletedStateName: "Done",
				preferredReopenStateName: "Backlog",
				reopenStateStrategy: "last-known",
			},
		} as unknown as ObsidianLinearPlugin;
		const service = new TaskSyncService(plugin);

		await service.handleVaultModify(file);
		markdown = [
			"- [x] Buy groceries",
			`- [ ] [TYP-37](${ISSUE_URL}) Reach out`,
		].join("\n");
		await service.handleVaultModify(file);

		expect(setIssueChecked).not.toHaveBeenCalled();
	});
});
