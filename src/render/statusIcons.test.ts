import {describe, expect, it} from "vitest";
import {getErrorStatusIcon, getIssueStatusIcon, getLoadingStatusIcon, getMissingConnectionStatusIcon} from "./statusIcons";

describe("statusIcons", () => {
	it("maps completed states to a success icon", () => {
		expect(getIssueStatusIcon({
			id: "done",
			name: "Done",
			type: "completed",
		})).toMatchObject({
			icon: "check",
			tone: "success",
		});
	});

	it("maps started states to an active icon", () => {
		expect(getIssueStatusIcon({
			id: "progress",
			name: "In Progress",
			type: "started",
		})).toMatchObject({
			icon: "play",
			tone: "active",
		});
	});

	it("maps paused-like states to a warning icon", () => {
		expect(getIssueStatusIcon({
			id: "paused",
			name: "Paused",
			type: "started",
		})).toMatchObject({
			icon: "pause",
			tone: "warning",
		});
	});

	it("maps review, canceled, and duplicate states explicitly", () => {
		expect(getIssueStatusIcon({
			id: "review",
			name: "In Review",
			type: "started",
		})).toMatchObject({
			icon: "search",
			tone: "active",
		});

		expect(getIssueStatusIcon({
			id: "canceled",
			name: "Canceled",
			type: "canceled",
		})).toMatchObject({
			icon: "x",
			tone: "warning",
		});

		expect(getIssueStatusIcon({
			id: "duplicate",
			name: "Duplicate",
			type: "canceled",
		})).toMatchObject({
			icon: "copy",
			tone: "warning",
		});
	});

	it("provides loading, missing, and error icon states", () => {
		expect(getLoadingStatusIcon()).toMatchObject({icon: "loader", spin: true});
		expect(getMissingConnectionStatusIcon()).toMatchObject({icon: "unlink-2"});
		expect(getErrorStatusIcon()).toMatchObject({icon: "triangle-alert"});
	});
});
