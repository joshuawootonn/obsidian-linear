import {describe, expect, it} from "vitest";
import {
	extractLinearIssueUrls,
	getIssueKey,
	normalizeWorkspaceSlug,
	parseLinearIdentifier,
	parseLinearIssueUrl,
} from "./workspaces";

describe("workspaces", () => {
	it("normalizes workspace slugs to lowercase", () => {
		expect(normalizeWorkspaceSlug(" Type-The-Word ")).toBe("type-the-word");
	});

	it("parses Linear issue URLs into normalized workspace and identifier parts", () => {
		expect(parseLinearIssueUrl("https://linear.app/Type-The-Word/issue/typ-37/reach-out")).toEqual({
			rawUrl: "https://linear.app/Type-The-Word/issue/typ-37/reach-out",
			normalizedUrl: "https://linear.app/type-the-word/issue/typ-37/reach-out",
			workspaceSlug: "type-the-word",
			identifier: "TYP-37",
			issueSlug: "reach-out",
		});
	});

	it("rejects non-issue Linear URLs", () => {
		expect(parseLinearIssueUrl("https://linear.app/type-the-word/project/roadmap")).toBeNull();
		expect(parseLinearIssueUrl("not-a-url")).toBeNull();
	});

	it("parses Linear display identifiers into team key and issue number", () => {
		expect(parseLinearIdentifier(" typ-37 ")).toEqual({
			teamKey: "TYP",
			issueNumber: 37,
		});
		expect(parseLinearIdentifier("invalid")).toBeNull();
	});

	it("extracts and deduplicates issue URLs by workspace and identifier", () => {
		const input = [
			"https://linear.app/type-the-word/issue/TYP-37/reach-out",
			"https://linear.app/type-the-word/issue/typ-37/reach-out-again",
			"https://linear.app/another-org/issue/BUG-1/a-bug",
		].join("\n");

		const issues = extractLinearIssueUrls(input);

		expect(issues).toHaveLength(2);
		expect(issues.map(getIssueKey)).toEqual([
			"type-the-word:TYP-37",
			"another-org:BUG-1",
		]);
	});
});
