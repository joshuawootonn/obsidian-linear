import {describe, expect, it, vi} from "vitest";

vi.mock("./livePreviewRefresh", () => ({
	forceLivePreviewStatusRefresh: () => undefined,
}));

import {getSupportedLinearPasteInput, isSupportedLinearPasteInput} from "./pasteExtension";

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

	it("supports multiple markdown-link bullets collapsed onto one line", () => {
		const input = "- [TYP-37: Reach out to these people after the Google Classroom trial](https://linear.app/type-the-word/issue/TYP-37/reach-out-to-these-people-after-the-google-classroom-trial) - [TYP-56: When log tooltips go down the background is clipped by the following div](https://linear.app/type-the-word/issue/TYP-56/when-log-tooltips-go-down-the-background-is-clipped-by-the-following)";

		expect(isSupportedLinearPasteInput(input)).toBe(true);
	});

	it("falls back to html clipboard data from Linear", () => {
		const html = [
			"<ul>",
			"<li><a href=\"https://linear.app/type-the-word/issue/TYP-71/crm-for-managing-demo-users\">TYP-71: CRM for managing Demo users</a></li>",
			"<li><a href=\"https://linear.app/type-the-word/issue/TYP-65/prevent-assignment-completion-when-your-accuracy-is-below-a-certain\">TYP-65: Prevent assignment completion when your accuracy is below a certain point.</a></li>",
			"</ul>",
		].join("");

		expect(getSupportedLinearPasteInput("", html)).toBe([
			"- [TYP-71: CRM for managing Demo users](https://linear.app/type-the-word/issue/TYP-71/crm-for-managing-demo-users)",
			"- [TYP-65: Prevent assignment completion when your accuracy is below a certain point.](https://linear.app/type-the-word/issue/TYP-65/prevent-assignment-completion-when-your-accuracy-is-below-a-certain)",
		].join("\n"));
	});

	it("supports markdown-link bullet lists wrapped in fenced code blocks", () => {
		const input = [
			"```",
			"- [TYP-73: Follow up with newsletter responders about CRM](https://linear.app/type-the-word/issue/TYP-73/follow-up-with-newsletter-responders-about-crm)",
			"- [TYP-69: Text the ambassador c-group and see if people could connect me with any schools they know in Milwaukee.](https://linear.app/type-the-word/issue/TYP-69/text-the-ambassador-c-group-and-see-if-people-could-connect-me-with)",
			"```",
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
