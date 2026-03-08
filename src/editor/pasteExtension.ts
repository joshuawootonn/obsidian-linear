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

	const normalizedInput = input
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	return normalizedInput.length === references.length;
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
