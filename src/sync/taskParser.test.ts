import {describe, expect, it} from "vitest";
import {buildTaskLine, buildTasksFromSeeds, createTaskSnapshot, parseTaskReferences, syncTasksWithLinear} from "./taskParser";

describe("taskParser", () => {
	it("builds inline-link markdown tasks from issue seeds", () => {
		const markdown = buildTasksFromSeeds([
			{
				identifier: "TYP-37",
				title: "Reach out to these people",
				url: "https://linear.app/type-the-word/issue/TYP-37/reach-out",
			},
		], "two-line");

		expect(markdown).toBe(
			"- [ ] [TYP-37](https://linear.app/type-the-word/issue/TYP-37/reach-out) Reach out to these people",
		);
	});

	it("parses both inline-link and legacy two-line task references", () => {
		const markdown = [
			"- [ ] [TYP-37] Reach out",
			"  https://linear.app/type-the-word/issue/TYP-37/reach-out",
			"- [x] [BUG-1](https://linear.app/another-org/issue/BUG-1/fix-clipping) Fix clipping",
		].join("\n");

		const tasks = parseTaskReferences(markdown);

		expect(tasks).toHaveLength(2);
		expect(tasks[0]).toMatchObject({
			checked: false,
			issueKey: "type-the-word:TYP-37",
			legacyUrlLineNumber: 1,
			titleText: "Reach out",
			urlLineNumber: 1,
		});
		expect(tasks[1]).toMatchObject({
			checked: true,
			issueKey: "another-org:BUG-1",
			urlLineNumber: 2,
			legacyUrlLineNumber: null,
			titleText: "Fix clipping",
		});
	});

	it("creates snapshots and syncs checkbox states while normalizing legacy tasks", () => {
		const original = [
			"- [ ] [TYP-37] Reach out",
			"  https://linear.app/type-the-word/issue/TYP-37/reach-out",
			"- [x] [BUG-1](https://linear.app/another-org/issue/BUG-1/fix-clipping) Fix clipping",
		].join("\n");

		const snapshot = createTaskSnapshot(parseTaskReferences(original));
		expect(snapshot).toEqual(new Map([
			["type-the-word:TYP-37", {
				checked: false,
				titleText: "Reach out",
			}],
			["another-org:BUG-1", {
				checked: true,
				titleText: "Fix clipping",
			}],
		]));

		const synced = syncTasksWithLinear(original, new Map([
			["type-the-word:TYP-37", {
				checked: true,
				title: "Reach out to these people",
			}],
			["another-org:BUG-1", {
				checked: false,
				title: "Fix clipping for tooltips",
			}],
		]));

		expect(synced.changed).toBe(true);
		expect(synced.markdown).toContain("- [x] [TYP-37](https://linear.app/type-the-word/issue/TYP-37/reach-out) Reach out to these people");
		expect(synced.markdown).toContain("- [ ] [BUG-1](https://linear.app/another-org/issue/BUG-1/fix-clipping) Fix clipping for tooltips");
		expect(synced.markdown).not.toContain("\n  https://linear.app/type-the-word/issue/TYP-37/reach-out");
	});

	it("leaves markdown untouched when desired state matches current state", () => {
		const original = "- [ ] [TYP-37](https://linear.app/type-the-word/issue/TYP-37/reach-out) Reach out";
		const synced = syncTasksWithLinear(original, new Map([
			["type-the-word:TYP-37", {
				checked: false,
				title: "Reach out",
			}],
		]));

		expect(synced).toEqual({
			changed: false,
			markdown: original,
		});
	});

	it("builds a normalized inline task line", () => {
		expect(buildTaskLine({
			checked: true,
			identifier: "TYP-50",
			title: "Text Matt Penner",
			url: "https://linear.app/type-the-word/issue/TYP-50/text-matt-penner",
		})).toBe(
			"- [x] [TYP-50](https://linear.app/type-the-word/issue/TYP-50/text-matt-penner) Text Matt Penner",
		);
	});
});
