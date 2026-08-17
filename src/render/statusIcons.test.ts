import {describe, expect, it} from "vitest";
import {getErrorStatusIcon, getIssueStatusIcon, getLoadingStatusIcon, getMissingConnectionStatusIcon} from "./statusIcons";

describe("statusIcons", () => {
	it("maps completed states to a Linear-style icon and preserves its color", () => {
		expect(getIssueStatusIcon({
			color: "#5E6AD2",
			id: "done",
			name: "Done",
			type: "completed",
		})).toMatchObject({
			color: "#5E6AD2",
			icon: "linear-completed",
			tone: "success",
		});
	});

	it("maps started states to an active icon", () => {
		expect(getIssueStatusIcon({
			id: "progress",
			name: "In Progress",
			type: "started",
		})).toMatchObject({
			icon: "linear-started",
			tone: "active",
		});
	});

	it("uses the workflow category instead of guessing from custom status names", () => {
		expect(getIssueStatusIcon({
			id: "paused",
			name: "Paused",
			type: "started",
		})).toMatchObject({
			icon: "linear-started",
			tone: "active",
		});
	});

	it("maps custom names to their Linear workflow categories", () => {
		expect(getIssueStatusIcon({
			id: "review",
			name: "In Review",
			type: "started",
		})).toMatchObject({
			icon: "linear-started",
			tone: "active",
		});

		expect(getIssueStatusIcon({
			id: "canceled",
			name: "Canceled",
			type: "canceled",
		})).toMatchObject({
			icon: "linear-canceled",
			tone: "warning",
		});

		expect(getIssueStatusIcon({
			id: "duplicate",
			name: "Duplicate",
			type: "canceled",
		})).toMatchObject({
			icon: "linear-canceled",
			tone: "warning",
		});
	});

	it("provides loading, missing, and error icon states", () => {
		expect(getLoadingStatusIcon()).toMatchObject({icon: "loader", spin: true});
		expect(getMissingConnectionStatusIcon()).toMatchObject({icon: "unlink-2"});
		expect(getErrorStatusIcon()).toMatchObject({icon: "triangle-alert"});
	});
});
