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
