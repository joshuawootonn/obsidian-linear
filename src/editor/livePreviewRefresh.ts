import {StateEffect} from "@codemirror/state";
import type {EditorView} from "@codemirror/view";

export const forceLivePreviewStatusRefreshEffect = StateEffect.define<void>();

export function forceLivePreviewStatusRefresh(view: EditorView): void {
	view.dispatch({
		effects: forceLivePreviewStatusRefreshEffect.of(undefined),
	});
}
