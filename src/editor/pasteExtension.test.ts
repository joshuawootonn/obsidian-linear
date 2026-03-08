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

		expect(getSupportedLinearPasteInput("", "", html)).toBe([
			"- [TYP-71: CRM for managing Demo users](https://linear.app/type-the-word/issue/TYP-71/crm-for-managing-demo-users)",
			"- [TYP-65: Prevent assignment completion when your accuracy is below a certain point.](https://linear.app/type-the-word/issue/TYP-65/prevent-assignment-completion-when-your-accuracy-is-below-a-certain)",
		].join("\n"));
	});

	it("accepts markdown clipboard data for exact copied issue groups", () => {
		const markdown = [
			"- [TYP-71: CRM for managing Demo users](https://linear.app/type-the-word/issue/TYP-71/crm-for-managing-demo-users)",
			"- [TYP-65: Prevent assignment completion when your accuracy is below a certain point.](https://linear.app/type-the-word/issue/TYP-65/prevent-assignment-completion-when-your-accuracy-is-below-a-certain)",
			"- [TYP-74: Ask Cam Pak if he is connected with Christian schools in OK](https://linear.app/type-the-word/issue/TYP-74/ask-cam-pak-if-he-is-connected-with-christian-schools-in-ok)",
			"- [TYP-73: Follow up with newsletter responders about CRM](https://linear.app/type-the-word/issue/TYP-73/follow-up-with-newsletter-responders-about-crm)",
			"- [TYP-72: Migrate existing users to CRM](https://linear.app/type-the-word/issue/TYP-72/migrate-existing-users-to-crm)",
			"- [TYP-69: Text the ambassador c-group and see if people could connect me with any schools they know in Milwaukee.](https://linear.app/type-the-word/issue/TYP-69/text-the-ambassador-c-group-and-see-if-people-could-connect-me-with)",
			"- [TYP-68: Text Jared and ask him if he can connect me with his kids' Christian school or any other Christian schools in Milwaukee?](https://linear.app/type-the-word/issue/TYP-68/text-jared-and-ask-him-if-he-can-connect-me-with-his-kids-christian)",
			"- [TYP-67: Text Seth Peterson and ask him to connect me with the Lutheran guy and the Christian school he knows in Madison](https://linear.app/type-the-word/issue/TYP-67/text-seth-peterson-and-ask-him-to-connect-me-with-the-lutheran-guy-and)",
			"- [TYP-50: Text Matt Penner and ask him to connect you with the school his daughter goes to](https://linear.app/type-the-word/issue/TYP-50/text-matt-penner-and-ask-him-to-connect-you-with-the-school-his)",
		].join("\n");

		expect(getSupportedLinearPasteInput("", markdown, "")).toBe(markdown);
	});

	it("accepts exact copied issue groups with hidden clipboard characters", () => {
		const markdown = [
			"\u200B- [TYP-71: CRM for managing Demo users](https://linear.app/type-the-word/issue/TYP-71/crm-for-managing-demo-users)",
			"\u200B- [TYP-65: Prevent assignment completion when your accuracy is below a certain point.](https://linear.app/type-the-word/issue/TYP-65/prevent-assignment-completion-when-your-accuracy-is-below-a-certain)",
			"\u200B- [TYP-69: Text the ambassador c-group and see if people could connect me with any schools they know in Milwaukee.](https://linear.app/type-the-word/issue/TYP-69/text-the-ambassador-c-group-and-see-if-people-could-connect-me-with)",
			"\u200B- [TYP-68: Text Jared and ask him if he can connect me with his kids' Christian school or any other Christian schools in Milwaukee?](https://linear.app/type-the-word/issue/TYP-68/text-jared-and-ask-him-if-he-can-connect-me-with-his-kids-christian)",
			"\u200B- [TYP-67: Text Seth Peterson and ask him to connect me with the Lutheran guy and the Christian school he knows in Madison](https://linear.app/type-the-word/issue/TYP-67/text-seth-peterson-and-ask-him-to-connect-me-with-the-lutheran-guy-and)",
			"\u200B- [TYP-50: Text Matt Penner and ask him to connect you with the school his daughter goes to](https://linear.app/type-the-word/issue/TYP-50/text-matt-penner-and-ask-him-to-connect-you-with-the-school-his)",
		].join("\n");

		expect(getSupportedLinearPasteInput(markdown, "", "")).toBe([
			"- [TYP-71: CRM for managing Demo users](https://linear.app/type-the-word/issue/TYP-71/crm-for-managing-demo-users)",
			"- [TYP-65: Prevent assignment completion when your accuracy is below a certain point.](https://linear.app/type-the-word/issue/TYP-65/prevent-assignment-completion-when-your-accuracy-is-below-a-certain)",
			"- [TYP-69: Text the ambassador c-group and see if people could connect me with any schools they know in Milwaukee.](https://linear.app/type-the-word/issue/TYP-69/text-the-ambassador-c-group-and-see-if-people-could-connect-me-with)",
			"- [TYP-68: Text Jared and ask him if he can connect me with his kids' Christian school or any other Christian schools in Milwaukee?](https://linear.app/type-the-word/issue/TYP-68/text-jared-and-ask-him-if-he-can-connect-me-with-his-kids-christian)",
			"- [TYP-67: Text Seth Peterson and ask him to connect me with the Lutheran guy and the Christian school he knows in Madison](https://linear.app/type-the-word/issue/TYP-67/text-seth-peterson-and-ask-him-to-connect-me-with-the-lutheran-guy-and)",
			"- [TYP-50: Text Matt Penner and ask him to connect you with the school his daughter goes to](https://linear.app/type-the-word/issue/TYP-50/text-matt-penner-and-ask-him-to-connect-you-with-the-school-his)",
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

	it("accepts mixed multiline input when it contains Linear issue links", () => {
		const input = [
			"notes before the links",
			"https://linear.app/type-the-word/issue/TYP-37/reach-out-to-these-people-after-the-google-classroom-trial",
			"not a linear issue",
			"- [TYP-56: When log tooltips go down the background is clipped by the following div](https://linear.app/type-the-word/issue/TYP-56/when-log-tooltips-go-down-the-background-is-clipped-by-the-following)",
		].join("\n");

		expect(isSupportedLinearPasteInput(input)).toBe(true);
		expect(getSupportedLinearPasteInput(input, "", "")).toBe(input);
	});

	it("rejects clipboard input with no Linear issue links", () => {
		const input = [
			"notes before the links",
			"still not a linear issue",
		].join("\n");

		expect(isSupportedLinearPasteInput(input)).toBe(false);
	});
});
