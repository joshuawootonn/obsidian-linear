import {describe, expect, it} from "vitest";
import {isSupportedLinearPasteInput} from "./pasteExtension";

describe("pasteExtension", () => {
	it("supports plain copied Linear URL lists", () => {
		const input = [
			"https://linear.app/type-the-word/issue/TYP-37/reach-out-to-these-people-after-the-google-classroom-trial",
			"https://linear.app/type-the-word/issue/TYP-56/when-log-tooltips-go-down-the-background-is-clipped-by-the-following",
		].join("\n");

		expect(isSupportedLinearPasteInput(input)).toBe(true);
	});

	it("supports markdown-link bullet lists copied from Linear", () => {
		const input = [
			"- [TYP-73: Follow up with newsletter responders about CRM](https://linear.app/type-the-word/issue/TYP-73/follow-up-with-newsletter-responders-about-crm)",
			"- [TYP-69: Text the ambassador c-group and see if people could connect me with any schools they know in Milwaukee.](https://linear.app/type-the-word/issue/TYP-69/text-the-ambassador-c-group-and-see-if-people-could-connect-me-with)",
		].join("\n");

		expect(isSupportedLinearPasteInput(input)).toBe(true);
	});

	it("rejects mixed multiline input where some lines are not Linear references", () => {
		const input = [
			"https://linear.app/type-the-word/issue/TYP-37/reach-out-to-these-people-after-the-google-classroom-trial",
			"not a linear issue",
		].join("\n");

		expect(isSupportedLinearPasteInput(input)).toBe(false);
	});
});
