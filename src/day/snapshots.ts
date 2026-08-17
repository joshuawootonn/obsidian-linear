import type {LinearDayIssue, LinearWorkflowState} from "../linear/types";

export const DAY_SNAPSHOT_VERSION = 1;

export interface DaySnapshotIssue {
	firstSeenAt: string;
	id: string;
	identifier: string;
	state: LinearWorkflowState;
	title: string;
	url: string;
}

export interface DaySnapshot {
	date: string;
	issues: Record<string, DaySnapshotIssue>;
	statusName: string;
	timezone: string;
	updatedAt: string;
	version: typeof DAY_SNAPSHOT_VERSION;
	workspaceSlug: string;
}

export type DaySnapshots = Record<string, DaySnapshot>;

export interface DaySnapshotIdentity {
	date: string;
	statusName: string;
	timezone: string;
	workspaceSlug: string;
}

export function getDaySnapshotKey(identity: Pick<DaySnapshotIdentity, "date" | "statusName" | "workspaceSlug">): string {
	return [
		identity.workspaceSlug.trim().toLowerCase(),
		identity.date,
		identity.statusName.trim().toLowerCase(),
	].join(":");
}

export function getDaySnapshot(snapshots: DaySnapshots, identity: DaySnapshotIdentity): DaySnapshot | null {
	return snapshots[getDaySnapshotKey(identity)] ?? null;
}

export function captureDayIssues(
	snapshots: DaySnapshots,
	identity: DaySnapshotIdentity,
	issues: LinearDayIssue[],
	capturedAt: string,
): {changed: boolean; snapshot: DaySnapshot} {
	const key = getDaySnapshotKey(identity);
	const existing = snapshots[key];
	const snapshot: DaySnapshot = existing ?? {
		date: identity.date,
		issues: {},
		statusName: identity.statusName,
		timezone: identity.timezone,
		updatedAt: capturedAt,
		version: DAY_SNAPSHOT_VERSION,
		workspaceSlug: identity.workspaceSlug,
	};
	let changed = !existing;

	for (const issue of issues) {
		if (snapshot.issues[issue.id]) {
			continue;
		}

		snapshot.issues[issue.id] = {
			firstSeenAt: capturedAt,
			id: issue.id,
			identifier: issue.identifier,
			state: issue.state,
			title: issue.title,
			url: issue.url,
		};
		changed = true;
	}

	if (changed) {
		snapshot.updatedAt = capturedAt;
		snapshots[key] = snapshot;
	}

	return {changed, snapshot};
}

export function sanitizeDaySnapshots(value: unknown): DaySnapshots {
	if (!isRecord(value)) {
		return {};
	}

	const snapshots: DaySnapshots = {};
	for (const candidate of Object.values(value)) {
		const snapshot = sanitizeDaySnapshot(candidate);
		if (snapshot) {
			snapshots[getDaySnapshotKey(snapshot)] = snapshot;
		}
	}

	return snapshots;
}

export function mergeDaySnapshots(target: DaySnapshots, source: DaySnapshots): boolean {
	let changed = false;
	for (const [key, incoming] of Object.entries(source)) {
		const existing = target[key];
		if (!existing) {
			target[key] = incoming;
			changed = true;
			continue;
		}

		for (const [issueId, issue] of Object.entries(incoming.issues)) {
			if (!existing.issues[issueId]) {
				existing.issues[issueId] = issue;
				changed = true;
			}
		}
	}
	return changed;
}

function sanitizeDaySnapshot(value: unknown): DaySnapshot | null {
	if (
		!isRecord(value) ||
		value.version !== DAY_SNAPSHOT_VERSION ||
		!isString(value.date) ||
		!isString(value.statusName) ||
		!isString(value.timezone) ||
		!isString(value.updatedAt) ||
		!isString(value.workspaceSlug) ||
		!isRecord(value.issues)
	) {
		return null;
	}

	const issues: Record<string, DaySnapshotIssue> = {};
	for (const issueValue of Object.values(value.issues)) {
		const issue = sanitizeSnapshotIssue(issueValue);
		if (issue) {
			issues[issue.id] = issue;
		}
	}

	return {
		date: value.date,
		issues,
		statusName: value.statusName,
		timezone: value.timezone,
		updatedAt: value.updatedAt,
		version: DAY_SNAPSHOT_VERSION,
		workspaceSlug: value.workspaceSlug,
	};
}

function sanitizeSnapshotIssue(value: unknown): DaySnapshotIssue | null {
	if (
		!isRecord(value) ||
		!isString(value.firstSeenAt) ||
		!isString(value.id) ||
		!isString(value.identifier) ||
		!isString(value.title) ||
		!isString(value.url) ||
		!isRecord(value.state) ||
		!isString(value.state.id) ||
		!isString(value.state.name) ||
		!isString(value.state.type)
	) {
		return null;
	}

	return {
		firstSeenAt: value.firstSeenAt,
		id: value.id,
		identifier: value.identifier,
		state: {
			id: value.state.id,
			name: value.state.name,
			type: value.state.type,
			...(isString(value.state.color) ? {color: value.state.color} : {}),
		},
		title: value.title,
		url: value.url,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}
