import {parseLinearIssueUrl} from "../linear/workspaces";

export interface LivePreviewStatusMatch {
	identifier: string;
	url: string;
	workspaceSlug: string;
	linkStart: number;
}

const INLINE_TASK_LINK_REGEX = /^\s*[-*]\s+\[[ xX]\]\s+\[([A-Z][A-Z0-9]*-\d+)\]\((https:\/\/linear\.app\/[^\s)]+)\)/;

export function getLivePreviewStatusMatch(lineText: string): LivePreviewStatusMatch | null {
	const match = lineText.match(INLINE_TASK_LINK_REGEX);
	if (!match) {
		return null;
	}

	const [, identifier, url] = match;
	if (!identifier || !url) {
		return null;
	}

	const parsedUrl = parseLinearIssueUrl(url);
	if (!parsedUrl) {
		return null;
	}

	const linkStart = lineText.indexOf(`[${identifier}](`);
	if (linkStart < 0) {
		return null;
	}

	return {
		identifier,
		url: parsedUrl.normalizedUrl,
		workspaceSlug: parsedUrl.workspaceSlug,
		linkStart,
	};
}
