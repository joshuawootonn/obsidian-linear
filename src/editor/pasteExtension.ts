import {EditorSelection} from "@codemirror/state";
import {EditorView} from "@codemirror/view";
import type ObsidianLinearPlugin from "../main";
import {extractLinearIssueReferences} from "../linear/workspaces";
import {forceLivePreviewStatusRefresh} from "./livePreviewRefresh";

export function createPasteExtension(plugin: ObsidianLinearPlugin) {
	return EditorView.domEventHandlers({
		paste(event, view) {
			const clipboardText = getSupportedLinearPasteInput(
				event.clipboardData?.getData("text/plain") ?? "",
				event.clipboardData?.getData("text/html") ?? "",
			);
			if (!clipboardText) {
				return false;
			}

			event.preventDefault();
			void handlePaste(plugin, view, clipboardText);
			return true;
		},
	});
}

export function getSupportedLinearPasteInput(plainText: string, htmlText = ""): string | null {
	if (plainText && isSupportedLinearPasteInput(plainText)) {
		return plainText;
	}

	if (htmlText) {
		const extractedText = extractLinearPasteTextFromHtml(htmlText);
		if (extractedText && isSupportedLinearPasteInput(extractedText)) {
			return extractedText;
		}
	}

	return null;
}

export function isSupportedLinearPasteInput(input: string): boolean {
	const references = extractLinearIssueReferences(input);
	if (references.length === 0) {
		return false;
	}

	const meaningfulLines = input
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !isIgnorablePasteLine(line));

	return meaningfulLines.every(isSupportedLinearReferenceLine);
}

async function handlePaste(plugin: ObsidianLinearPlugin, view: EditorView, clipboardText: string): Promise<void> {
	const selection = view.state.selection.main;
	const replacement = await plugin.convertLinearUrlsToTasks(clipboardText);

	view.dispatch({
		changes: {
			from: selection.from,
			to: selection.to,
			insert: replacement,
		},
		selection: EditorSelection.cursor(selection.from + replacement.length),
	});

	requestAnimationFrame(() => {
		forceLivePreviewStatusRefresh(view);
	});
}

function isIgnorablePasteLine(line: string): boolean {
	return line === "```";
}

function isSupportedLinearReferenceLine(line: string): boolean {
	let remaining = line.trim();

	while (remaining.length > 0) {
		const match = remaining.match(/^(?:[-*]\s+)?(?:\[[^\]]+\]\((https:\/\/linear\.app\/[^\s)]+)\)|https:\/\/linear\.app\/[^\s)>\]]+)(?:\s+|$)/);
		if (!match) {
			return false;
		}

		remaining = remaining.slice(match[0].length).trimStart();
	}

	return true;
}

function extractLinearPasteTextFromHtml(html: string): string {
	const references: string[] = [];
	const anchorRegex = /<a\b[^>]*href=(["'])(https:\/\/linear\.app\/[^"' ]+)\1[^>]*>([\s\S]*?)<\/a>/gi;

	for (const match of html.matchAll(anchorRegex)) {
		const [, , url, rawLabel] = match;
		if (!url) {
			continue;
		}

		const label = decodeHtmlEntities((rawLabel ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
		references.push(label ? `- [${label}](${url})` : url);
	}

	return references.join("\n");
}

function decodeHtmlEntities(text: string): string {
	return text
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, "\"")
		.replace(/&#39;|&#x27;/g, "'");
}
