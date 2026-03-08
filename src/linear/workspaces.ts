export interface ParsedLinearIssueUrl {
	rawUrl: string;
	normalizedUrl: string;
	workspaceSlug: string;
	identifier: string;
	issueSlug: string;
}

export interface ParsedLinearIdentifier {
	teamKey: string;
	issueNumber: number;
}

export interface ParsedLinearIssueReference extends ParsedLinearIssueUrl {
	title: string | null;
}

const LINEAR_HOST = "linear.app";
const LINEAR_URL_REGEX = /https:\/\/linear\.app\/[^\s)>\]]+/;
const LINEAR_MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\((https:\/\/linear\.app\/[^\s)]+)\)/;

export function normalizeWorkspaceSlug(workspaceSlug: string): string {
	return workspaceSlug.trim().toLowerCase();
}

export function parseLinearIssueUrl(input: string): ParsedLinearIssueUrl | null {
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(input.trim());
	} catch {
		return null;
	}

	if (parsedUrl.hostname !== LINEAR_HOST) {
		return null;
	}

	const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
	if (pathSegments.length < 4) {
		return null;
	}

	const [workspaceSlug, typeSegment, identifier, ...slugParts] = pathSegments;
	if (typeSegment !== "issue") {
		return null;
	}

	const normalizedWorkspace = normalizeWorkspaceSlug(workspaceSlug ?? "");
	if (!normalizedWorkspace || !identifier) {
		return null;
	}

	const issueSlug = slugParts.join("-");
	const normalizedUrl = `https://${LINEAR_HOST}/${normalizedWorkspace}/issue/${identifier}${issueSlug ? `/${issueSlug}` : ""}`;

	return {
		rawUrl: input.trim(),
		normalizedUrl,
		workspaceSlug: normalizedWorkspace,
		identifier: identifier.toUpperCase(),
		issueSlug,
	};
}

export function extractLinearIssueReferences(input: string): ParsedLinearIssueReference[] {
	const seen = new Set<string>();
	const references: ParsedLinearIssueReference[] = [];

	for (const rawLine of input.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) {
			continue;
		}

		const reference = parseLinearIssueReferenceFromLine(line);
		if (!reference) {
			continue;
		}

		const key = getIssueKey(reference);
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		references.push(reference);
	}

	return references;
}

export function extractLinearIssueUrls(input: string): ParsedLinearIssueUrl[] {
	return extractLinearIssueReferences(input).map(({title: _title, ...url}) => url);
}

export function getIssueKey(parsed: Pick<ParsedLinearIssueUrl, "workspaceSlug" | "identifier">): string {
	return `${normalizeWorkspaceSlug(parsed.workspaceSlug)}:${parsed.identifier.toUpperCase()}`;
}

export function parseLinearIdentifier(identifier: string): ParsedLinearIdentifier | null {
	const trimmed = identifier.trim().toUpperCase();
	const match = trimmed.match(/^([A-Z][A-Z0-9]*)-(\d+)$/);
	if (!match) {
		return null;
	}

	const [, teamKey, issueNumber] = match;
	if (!teamKey || !issueNumber) {
		return null;
	}

	return {
		teamKey,
		issueNumber: Number(issueNumber),
	};
}

function parseLinearIssueReferenceFromLine(line: string): ParsedLinearIssueReference | null {
	const markdownLinkMatch = line.match(LINEAR_MARKDOWN_LINK_REGEX);
	if (markdownLinkMatch) {
		const [, label, url] = markdownLinkMatch;
		if (!label || !url) {
			return null;
		}

		const parsed = parseLinearIssueUrl(url);
		if (!parsed) {
			return null;
		}

		return {
			...parsed,
			title: parseMarkdownLinkTitle(label, parsed.identifier),
		};
	}

	const rawUrlMatch = line.match(LINEAR_URL_REGEX);
	if (!rawUrlMatch) {
		return null;
	}

	const parsed = parseLinearIssueUrl(rawUrlMatch[0]);
	if (!parsed) {
		return null;
	}

	return {
		...parsed,
		title: null,
	};
}

function parseMarkdownLinkTitle(label: string, identifier: string): string | null {
	const trimmedLabel = label.trim();
	if (!trimmedLabel) {
		return null;
	}

	const escapedIdentifier = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const withoutIdentifier = trimmedLabel
		.replace(new RegExp(`^${escapedIdentifier}\\s*[:\\-–—]?\\s*`, "i"), "")
		.trim();

	if (withoutIdentifier) {
		return withoutIdentifier;
	}

	return trimmedLabel.toUpperCase() === identifier ? null : trimmedLabel;
}
