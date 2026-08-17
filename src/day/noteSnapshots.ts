import {getDaySnapshotKey, sanitizeDaySnapshots, type DaySnapshot, type DaySnapshots} from "./snapshots";

const SNAPSHOT_COMMENT_PATTERN = /\n?<!-- obsidian-linear-day-snapshots\n([\s\S]*?)\n-->\n?/;
const SNAPSHOT_COMMENT_GLOBAL_PATTERN = /<!-- obsidian-linear-day-snapshots\n[\s\S]*?\n-->/g;

interface NoteSnapshotPayload {
	snapshots: DaySnapshots;
	version: 1;
}

export function extractNoteDaySnapshots(content: string): DaySnapshots {
	const match = SNAPSHOT_COMMENT_PATTERN.exec(content);
	if (!match?.[1]) {
		return {};
	}

	try {
		const payload = JSON.parse(match[1]) as Partial<NoteSnapshotPayload>;
		return payload.version === 1 ? sanitizeDaySnapshots(payload.snapshots) : {};
	} catch {
		return {};
	}
}

export function upsertNoteDaySnapshot(content: string, snapshot: DaySnapshot): string {
	const snapshots = extractNoteDaySnapshots(content);
	const key = getDaySnapshotKey(snapshot);
	const existing = snapshots[key];
	snapshots[key] = existing
		? {...snapshot, issues: {...existing.issues, ...snapshot.issues}}
		: snapshot;
	const payload: NoteSnapshotPayload = {snapshots, version: 1};
	const comment = `<!-- obsidian-linear-day-snapshots\n${JSON.stringify(payload)}\n-->`;

	if (SNAPSHOT_COMMENT_PATTERN.test(content)) {
		return content.replace(SNAPSHOT_COMMENT_PATTERN, `\n${comment}\n`);
	}

	const separator = content.endsWith("\n") ? "\n" : "\n\n";
	return `${content}${separator}${comment}\n`;
}

export function getNoteDaySnapshotRanges(content: string): Array<{from: number; to: number}> {
	const ranges: Array<{from: number; to: number}> = [];
	for (const match of content.matchAll(SNAPSHOT_COMMENT_GLOBAL_PATTERN)) {
		if (match.index !== undefined) {
			ranges.push({from: match.index, to: match.index + match[0].length});
		}
	}
	return ranges;
}
