import type {LinearTeam, LinearWorkflowState} from "./types";
import type {ReopenStateStrategy} from "../settings";

export function resolveCompletedState(
	team: LinearTeam,
	preferredCompletedStateName?: string,
): LinearWorkflowState | null {
	const completedStates = team.states.filter((state) => state.type === "completed");
	if (completedStates.length === 0) {
		return null;
	}

	return findStateByName(completedStates, preferredCompletedStateName) ?? completedStates[0] ?? null;
}

export function resolveReopenState(
	team: LinearTeam,
	strategy: ReopenStateStrategy,
	lastOpenStateId?: string,
	preferredReopenStateName?: string,
): LinearWorkflowState | null {
	const openStates = team.states.filter((state) => state.type !== "completed" && state.type !== "canceled");
	if (openStates.length === 0) {
		return null;
	}

	if (strategy === "last-known" && lastOpenStateId) {
		const remembered = openStates.find((state) => state.id === lastOpenStateId);
		if (remembered) {
			return remembered;
		}
	}

	if (strategy !== "first-available") {
		const namedState = findStateByName(openStates, preferredReopenStateName);
		if (namedState) {
			return namedState;
		}
	}

	return openStates[0] ?? null;
}

export function findStateByName(
	states: LinearWorkflowState[],
	targetName?: string,
): LinearWorkflowState | null {
	const normalizedName = targetName?.trim().toLowerCase();
	if (!normalizedName) {
		return null;
	}

	return states.find((state) => state.name.trim().toLowerCase() === normalizedName) ?? null;
}
