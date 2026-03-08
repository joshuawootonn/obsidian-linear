import {EditorSelection} from "@codemirror/state";
import {EditorView} from "@codemirror/view";
import type ObsidianLinearPlugin from "../main";
import {extractLinearIssueReferences, normalizeLinearReferenceInput} from "../linear/workspaces";
import {forceLivePreviewStatusRefresh} from "./livePreviewRefresh";

export function createPasteExtension(plugin: ObsidianLinearPlugin) {
	return EditorView.domEventHandlers({
		paste(event, view) {
			const clipboardText = getSupportedLinearPasteInput(
				event.clipboardData?.getData("text/plain") ?? "",
				event.clipboardData?.getData("text/markdown") ?? "",
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

export function getSupportedLinearPasteInput(plainText: string, markdownText = "", htmlText = ""): string | null {
	const normalizedPlainText = normalizeLinearReferenceInput(plainText);
	if (normalizedPlainText && isSupportedLinearPasteInput(normalizedPlainText)) {
		return normalizedPlainText;
	}

	const normalizedMarkdownText = normalizeLinearReferenceInput(markdownText);
	if (normalizedMarkdownText && isSupportedLinearPasteInput(normalizedMarkdownText)) {
		return normalizedMarkdownText;
	}

	if (htmlText) {
		const extractedText = normalizeLinearReferenceInput(extractLinearPasteTextFromHtml(htmlText));
		if (extractedText && isSupportedLinearPasteInput(extractedText)) {
			return extractedText;
		}
	}

	return null;
}

export function isSupportedLinearPasteInput(input: string): boolean {
	const normalizedInput = normalizeLinearReferenceInput(input);
	return extractLinearIssueReferences(normalizedInput).length > 0;
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
