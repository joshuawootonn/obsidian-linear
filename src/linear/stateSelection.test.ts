import {describe, expect, it} from "vitest";
import {resolveCompletedState, resolveReopenState} from "./stateSelection";
import type {LinearTeam} from "./types";

const team: LinearTeam = {
	id: "team-1",
	key: "TYP",
	name: "Type the Word",
	states: [
		{id: "state-backlog", name: "Backlog", type: "backlog"},
		{id: "state-progress", name: "In Progress", type: "started"},
		{id: "state-done", name: "Done", type: "completed"},
		{id: "state-canceled", name: "Canceled", type: "canceled"},
	],
};

describe("stateSelection", () => {
	it("prefers a matching completed state by name", () => {
		expect(resolveCompletedState(team, "done")?.id).toBe("state-done");
	});

	it("uses the last known open state when reopening", () => {
		expect(resolveReopenState(team, "last-known", "state-progress", "Backlog")?.id).toBe("state-progress");
	});

	it("falls back to the preferred reopen state name", () => {
		expect(resolveReopenState(team, "preferred-name", undefined, "backlog")?.id).toBe("state-backlog");
	});

	it("skips completed and canceled states when reopening", () => {
		expect(resolveReopenState(team, "first-available")?.id).toBe("state-backlog");
	});
});
