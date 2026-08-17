export type LinearWorkflowType = string;

export interface LinearWorkflowState {
	id: string;
	name: string;
	type: LinearWorkflowType;
	color?: string;
}

export interface LinearTeam {
	id: string;
	key: string;
	name: string;
	states: LinearWorkflowState[];
}

export interface LinearIssue {
	id: string;
	identifier: string;
	title: string;
	url: string;
	workspaceSlug: string;
	state: LinearWorkflowState;
	team: LinearTeam;
}

export interface LinearDayIssue extends LinearIssue {
	completedAt: string | null;
}

export interface TaskSeed {
	identifier: string;
	title: string;
	url: string;
}
