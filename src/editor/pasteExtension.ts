import {EditorSelection} from "@codemirror/state";
import {EditorView} from "@codemirror/view";
import type ObsidianLinearPlugin from "../main";
import {extractLinearIssueReferences} from "../linear/workspaces";
import {forceLivePreviewStatusRefresh} from "./livePreviewRefresh";

export function createPasteExtension(plugin: ObsidianLinearPlugin) {
	return EditorView.domEventHandlers({
		paste(event, view) {
			const clipboardText = event.clipboardData?.getData("text/plain") ?? "";
			if (!clipboardText || !isSupportedLinearPasteInput(clipboardText)) {
				return false;
			}

			event.preventDefault();
			void handlePaste(plugin, view, clipboardText);
			return true;
		},
	});
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
