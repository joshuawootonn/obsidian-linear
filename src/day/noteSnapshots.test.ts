import {describe, expect, it} from "vitest";
import {captureDayIssues, type DaySnapshotIdentity} from "./snapshots";
import {extractNoteDaySnapshots, getNoteDaySnapshotRanges, upsertNoteDaySnapshot} from "./noteSnapshots";
import type {LinearDayIssue} from "../linear/types";

const identity: DaySnapshotIdentity = {
	date: "2026-08-17",
	statusName: "Today",
	timezone: "America/Chicago",
	workspaceSlug: "type-the-word",
};

function snapshot(issueId: string) {
	const issue: LinearDayIssue = {
		completedAt: null,
		id: issueId,
		identifier: `TYP-${issueId}`,
		state: {id: "today", name: "Today", type: "started"},
		team: {id: "team", key: "TYP", name: "Type the Word", states: []},
		title: `Issue ${issueId}`,
		url: `https://linear.app/type-the-word/issue/TYP-${issueId}/issue`,
		workspaceSlug: "type-the-word",
	};
	return captureDayIssues({}, identity, [issue], "2026-08-17T14:00:00Z").snapshot;
}

describe("note snapshots", () => {
	it("appends an invisible portable snapshot comment", () => {
		const content = upsertNoteDaySnapshot("# Daily note\n", snapshot("1"));

		expect(content).toContain("<!-- obsidian-linear-day-snapshots");
		expect(Object.values(extractNoteDaySnapshots(content))[0]?.issues["1"]?.identifier).toBe("TYP-1");
	});

	it("updates the existing comment instead of adding another", () => {
		const first = upsertNoteDaySnapshot("# Daily note\n", snapshot("1"));
		const second = upsertNoteDaySnapshot(first, snapshot("2"));

		expect(second.match(/obsidian-linear-day-snapshots/g)).toHaveLength(1);
		expect(Object.keys(Object.values(extractNoteDaySnapshots(second))[0]?.issues ?? {})).toEqual(["1", "2"]);
	});

	it("ignores a malformed snapshot comment", () => {
		expect(extractNoteDaySnapshots("<!-- obsidian-linear-day-snapshots\nnot-json\n-->")).toEqual({});
	});

	it("locates metadata comments so Live Preview can hide them", () => {
		const content = upsertNoteDaySnapshot("# Daily note\n", snapshot("1"));
		const ranges = getNoteDaySnapshotRanges(content);

		expect(content.slice(ranges[0]?.from, ranges[0]?.to)).toContain("obsidian-linear-day-snapshots");
	});
});
