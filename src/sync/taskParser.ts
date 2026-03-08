import type {TaskFormat} from "../settings";
import type {TaskSeed} from "../linear/types";
import {extractLinearIssueUrls, getIssueKey, parseLinearIssueUrl} from "../linear/workspaces";

export interface ParsedTaskReference {
	checked: boolean;
	displayText: string;
	issueKey: string;
	legacyUrlLineNumber: number | null;
	line: string;
	taskLineNumber: number;
	titleText: string;
	url: string;
	urlLineNumber: number;
	workspaceSlug: string;
	identifier: string;
}

const TASK_LINE_REGEX = /^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*)$/;

export function parseTaskReferences(markdown: string): ParsedTaskReference[] {
	const lines = markdown.split(/\r?\n/);
	const tasks: ParsedTaskReference[] = [];

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (line === undefined) {
			continue;
		}

		const taskMatch = line.match(TASK_LINE_REGEX);
		if (!taskMatch) {
			continue;
		}

		const inlineIssue = parseLinearIssueFromLine(line);
		const nextLineIssue = inlineIssue ? null : parseLinearIssueFromLine(lines[index + 1] ?? "");
		const issue = inlineIssue ?? nextLineIssue;
		if (!issue) {
			continue;
		}

		const checkedMarker = taskMatch[2] ?? " ";
		const displayText = taskMatch[4] ?? "";
		const legacyUrlLineNumber = inlineIssue ? null : index + 1;

		tasks.push({
			checked: checkedMarker.toLowerCase() === "x",
			displayText,
			issueKey: getIssueKey(issue),
			legacyUrlLineNumber,
			line,
			taskLineNumber: index,
			titleText: extractTaskTitle(displayText),
			url: issue.normalizedUrl,
			urlLineNumber: inlineIssue ? index : index + 1,
			workspaceSlug: issue.workspaceSlug,
			identifier: issue.identifier,
		});
	}

	return tasks;
}

export function buildTasksFromSeeds(seeds: TaskSeed[], _format: TaskFormat): string {
	return seeds.map((seed) => {
		const title = seed.title.trim() || seed.identifier;
		return buildTaskLine({
			checked: false,
			identifier: seed.identifier,
			title,
			url: seed.url,
		});
	}).join("\n");
}

export function syncTaskCheckboxes(markdown: string, desiredCheckedByIssueKey: Map<string, boolean>): {changed: boolean; markdown: string} {
	const lines = markdown.split(/\r?\n/);
	const skippedLines = new Set<number>();
	const replacements = new Map<number, string>();
	let changed = false;

	for (const task of parseTaskReferences(markdown)) {
		const desiredChecked = desiredCheckedByIssueKey.get(task.issueKey) ?? task.checked;
		const normalizedLine = buildTaskLine({
			checked: desiredChecked,
			identifier: task.identifier,
			title: task.titleText || task.identifier,
			url: task.url,
		});

		if (task.legacyUrlLineNumber !== null) {
			skippedLines.add(task.legacyUrlLineNumber);
			changed = true;
		}

		const currentLine = lines[task.taskLineNumber];
		if (currentLine === undefined) {
			continue;
		}

		replacements.set(task.taskLineNumber, normalizedLine);
		if (currentLine !== normalizedLine) {
			changed = true;
		}
	}

	if (!changed) {
		return {
			changed: false,
			markdown,
		};
	}

	const normalizedLines: string[] = [];
	for (const [index, line] of lines.entries()) {
		if (skippedLines.has(index)) {
			continue;
		}

		normalizedLines.push(replacements.get(index) ?? line ?? "");
	}

	return {
		changed: true,
		markdown: normalizedLines.join("\n"),
	};
}

export function createTaskSnapshot(tasks: ParsedTaskReference[]): Map<string, boolean> {
	return new Map(tasks.map((task) => [task.issueKey, task.checked]));
}

export function buildTaskLine(task: {
	checked: boolean;
	identifier: string;
	title: string;
	url: string;
}): string {
	const title = task.title.trim() || task.identifier;
	return `- [${task.checked ? "x" : " "}] [${task.identifier}](${task.url}) ${title}`;
}

function parseLinearIssueFromLine(line: string): ReturnType<typeof parseLinearIssueUrl> {
	const matches = extractLinearIssueUrls(line);
	return matches[0] ?? null;
}

function extractTaskTitle(displayText: string): string {
	return displayText
		.replace(/^\[[^\]]+\]\(https:\/\/linear\.app\/[^\s)]+\)\s*/, "")
		.replace(/^\[[^\]]+\]\s*/, "")
		.replace(/\s*https:\/\/linear\.app\/[^\s)>\]]+\s*$/, "")
		.trim();
}
