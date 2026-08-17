import {describe, expect, it} from "vitest";
import type {LinearDayIssue} from "../linear/types";
import type {DaySnapshotIssue} from "./snapshots";
import {getCompletedIssuesForDay, getVisiblePlannedIssues} from "./viewState";

const capturedIssue: DaySnapshotIssue = {
	firstSeenAt: "2026-08-17T14:00:00Z",
	id: "issue-1",
	identifier: "TYP-1",
	state: {id: "today", name: "Today", type: "started"},
	title: "Test issue",
	url: "https://linear.app/type-the-word/issue/TYP-1/test-issue",
};

function liveIssue(type: string): LinearDayIssue {
	return {
		...capturedIssue,
		completedAt: type === "completed" ? "2026-08-17T15:00:00Z" : null,
		state: {id: type, name: type, type},
		team: {id: "team", key: "TYP", name: "Type the Word", states: []},
		workspaceSlug: "type-the-word",
	};
}

describe("day view state", () => {
	it("keeps captured issues in the plan while their live state is open", () => {
		const result = getVisiblePlannedIssues([capturedIssue], new Map([[capturedIssue.id, liveIssue("started")]]));
		expect(result).toEqual([capturedIssue]);
	});

	it("removes captured issues from the plan when their live state is completed", () => {
		const result = getVisiblePlannedIssues([capturedIssue], new Map([[capturedIssue.id, liveIssue("completed")]]));
		expect(result).toEqual([]);
	});

	it("includes issues completed during the day without requiring plan membership", () => {
		const completedIssue = liveIssue("completed");
		const result = getCompletedIssuesForDay(
			[completedIssue],
			"2026-08-17T05:00:00.000Z",
			"2026-08-18T05:00:00.000Z",
		);

		expect(result).toEqual([completedIssue]);
	});
});
