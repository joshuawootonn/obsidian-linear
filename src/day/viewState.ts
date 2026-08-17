import type {LinearDayIssue} from "../linear/types";
import type {DaySnapshotIssue} from "./snapshots";

export function getVisiblePlannedIssues(
	issues: DaySnapshotIssue[],
	liveById: ReadonlyMap<string, LinearDayIssue>,
): DaySnapshotIssue[] {
	return issues.filter((issue) => {
		const state = liveById.get(issue.id)?.state ?? issue.state;
		return state.type.trim().toLowerCase() !== "completed";
	});
}

export function getCompletedIssuesForDay(
	issues: LinearDayIssue[],
	dateStart: string,
	dateEnd: string,
): LinearDayIssue[] {
	const start = Date.parse(dateStart);
	const end = Date.parse(dateEnd);
	return issues.filter((issue) => {
		if (!issue.completedAt) {
			return false;
		}
		const completedAt = Date.parse(issue.completedAt);
		return completedAt >= start && completedAt < end;
	});
}
