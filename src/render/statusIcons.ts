import type {LinearWorkflowState} from "../linear/types";

export interface StatusIconConfig {
	icon: string;
	label: string;
	spin?: boolean;
	tone: "active" | "muted" | "neutral" | "success" | "warning";
}

export function getIssueStatusIcon(state: LinearWorkflowState): StatusIconConfig {
	const normalizedName = state.name.trim().toLowerCase();

	if (state.type === "completed") {
		return {
			icon: "check",
			label: state.name,
			tone: "success",
		};
	}

	if (/duplicate/.test(normalizedName)) {
		return {
			icon: "copy",
			label: state.name,
			tone: "warning",
		};
	}

	if (/review|in review|qa|verify|verification/.test(normalizedName)) {
		return {
			icon: "search",
			label: state.name,
			tone: "active",
		};
	}

	if (/pause|paused|blocked|on hold|stuck/.test(normalizedName)) {
		return {
			icon: "pause",
			label: state.name,
			tone: "warning",
		};
	}

	if (state.type === "canceled") {
		return {
			icon: "x",
			label: state.name,
			tone: "warning",
		};
	}

	if (state.type === "started") {
		return {
			icon: "play",
			label: state.name,
			tone: "active",
		};
	}

	if (state.type === "backlog" || state.type === "unstarted") {
		return {
			icon: "list-todo",
			label: state.name,
			tone: "muted",
		};
	}

	return {
		icon: "minus",
		label: state.name,
		tone: "neutral",
	};
}

export function getLoadingStatusIcon(): StatusIconConfig {
	return {
		icon: "loader",
		label: "Loading",
		spin: true,
		tone: "neutral",
	};
}

export function getMissingConnectionStatusIcon(): StatusIconConfig {
	return {
		icon: "unlink-2",
		label: "Workspace not connected",
		tone: "warning",
	};
}

export function getErrorStatusIcon(): StatusIconConfig {
	return {
		icon: "triangle-alert",
		label: "Could not load issue",
		tone: "warning",
	};
}
