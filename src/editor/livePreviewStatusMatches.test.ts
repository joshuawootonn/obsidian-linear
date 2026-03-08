import {describe, expect, it} from "vitest";
import {getLivePreviewStatusMatch} from "./livePreviewStatusMatches";

describe("livePreviewStatusMatches", () => {
	it("matches inline linked task lines", () => {
		const match = getLivePreviewStatusMatch(
			"- [x] [TYP-50](https://linear.app/type-the-word/issue/TYP-50/text-matt-penner) Text Matt Penner",
		);

		expect(match).toEqual({
			identifier: "TYP-50",
			url: "https://linear.app/type-the-word/issue/TYP-50/text-matt-penner",
			workspaceSlug: "type-the-word",
			linkStart: 6,
		});
	});

	it("ignores non-task lines and legacy two-line tasks", () => {
		expect(getLivePreviewStatusMatch("[TYP-50](https://linear.app/type-the-word/issue/TYP-50/text-matt-penner)")).toBeNull();
		expect(getLivePreviewStatusMatch("- [ ] [TYP-50] Text Matt Penner")).toBeNull();
	});

	it("ignores non-linear task links", () => {
		expect(getLivePreviewStatusMatch("- [ ] [TYP-50](https://example.com) Text Matt Penner")).toBeNull();
	});
});
