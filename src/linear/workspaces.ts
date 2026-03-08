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

const LINEAR_HOST = "linear.app";

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

export function extractLinearIssueUrls(input: string): ParsedLinearIssueUrl[] {
	const matches = input.match(/https:\/\/linear\.app\/[^\s)>\]]+/g) ?? [];
	const seen = new Set<string>();
	const urls: ParsedLinearIssueUrl[] = [];

	for (const match of matches) {
		const parsed = parseLinearIssueUrl(match);
		if (!parsed) {
			continue;
		}

		const key = getIssueKey(parsed);
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		urls.push(parsed);
	}

	return urls;
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
