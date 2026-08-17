import {describe, expect, it} from "vitest";
import type {LinearDayIssue} from "../linear/types";
import {
	captureDayIssues,
	getDaySnapshot,
	sanitizeDaySnapshots,
	type DaySnapshotIdentity,
	type DaySnapshots,
} from "./snapshots";

const identity: DaySnapshotIdentity = {
	date: "2026-08-17",
	statusName: "Today",
	timezone: "America/Chicago",
	workspaceSlug: "type-the-word",
};

function issue(id: string, title = `Issue ${id}`): LinearDayIssue {
	return {
		completedAt: null,
		id,
		identifier: `TYP-${id}`,
		state: {color: "#5E6AD2", id: "today", name: "Today", type: "started"},
		team: {id: "team", key: "TYP", name: "Type the Word", states: []},
		title,
		url: `https://linear.app/type-the-word/issue/TYP-${id}/issue`,
		workspaceSlug: "type-the-word",
	};
}

describe("day snapshots", () => {
	it("keeps observed Today membership append-only", () => {
		const snapshots: DaySnapshots = {};
		const first = captureDayIssues(snapshots, identity, [issue("1")], "2026-08-17T14:00:00Z");
		const second = captureDayIssues(snapshots, identity, [issue("2")], "2026-08-17T15:00:00Z");

		expect(first.changed).toBe(true);
		expect(second.changed).toBe(true);
		expect(Object.keys(second.snapshot.issues)).toEqual(["1", "2"]);
		expect(second.snapshot.issues["1"]?.firstSeenAt).toBe("2026-08-17T14:00:00Z");
	});

	it("does not rewrite an issue that was already captured", () => {
		const snapshots: DaySnapshots = {};
		captureDayIssues(snapshots, identity, [issue("1", "Original")], "2026-08-17T14:00:00Z");
		const result = captureDayIssues(snapshots, identity, [issue("1", "Renamed")], "2026-08-17T15:00:00Z");

		expect(result.changed).toBe(false);
		expect(result.snapshot.issues["1"]?.title).toBe("Original");
	});

	it("drops malformed persisted snapshots", () => {
		const snapshots = sanitizeDaySnapshots({
			bad: {date: "2026-08-17"},
			good: captureDayIssues({}, identity, [issue("1")], "2026-08-17T14:00:00Z").snapshot,
		});

		expect(getDaySnapshot(snapshots, identity)?.issues["1"]?.identifier).toBe("TYP-1");
		expect(Object.keys(snapshots)).toHaveLength(1);
	});
});
