import {requestUrl} from "obsidian";
import type {LinearPluginSettings, ReopenStateStrategy} from "../settings";
import {IssueCache} from "./cache";
import {resolveCompletedState, resolveReopenState} from "./stateSelection";
import type {LinearIssue, LinearTeam, LinearWorkflowState} from "./types";
import {getIssueKey, parseLinearIdentifier, parseLinearIssueUrl} from "./workspaces";

interface GraphQLResponse<T> {
	data?: T;
	errors?: Array<{message: string}>;
}

interface IssueQueryResult {
	teams: {
		nodes: Array<{
			id: string;
			key: string;
			issues: {
				nodes: Array<{
					id: string;
					identifier: string;
					title: string;
					url: string;
					state: LinearWorkflowState;
					team: {
						id: string;
						key: string;
						name: string;
						states: {
							nodes: LinearWorkflowState[];
						};
					};
				}>;
			};
		}>;
	};
}

interface UpdateIssueResult {
	issueUpdate: {
		success: boolean;
		issue: {
			id: string;
		} | null;
	};
}

export class MissingWorkspaceTokenError extends Error {
	constructor(readonly workspaceSlug: string) {
		super(`No Linear token configured for workspace "${workspaceSlug}".`);
		this.name = "MissingWorkspaceTokenError";
	}
}

export class LinearClient {
	private readonly cache = new IssueCache<LinearIssue>(60_000);
	private readonly inflight = new Map<string, Promise<LinearIssue>>();

	constructor(private readonly getSettings: () => LinearPluginSettings) {}

	hasWorkspaceToken(workspaceSlug: string): boolean {
		return this.getTokenForWorkspace(workspaceSlug) !== null;
	}

	async fetchIssueByUrl(url: string, force = false): Promise<LinearIssue> {
		const parsed = parseLinearIssueUrl(url);
		if (!parsed) {
			throw new Error("Invalid Linear issue URL.");
		}

		const issueKey = getIssueKey(parsed);
		if (!force) {
			const cachedIssue = this.cache.get(issueKey);
			if (cachedIssue) {
				return cachedIssue;
			}

			const inflightRequest = this.inflight.get(issueKey);
			if (inflightRequest) {
				return inflightRequest;
			}
		}

		const request = this.fetchIssueByIdentifier(parsed.workspaceSlug, parsed.identifier, parsed.normalizedUrl)
			.finally(() => {
				this.inflight.delete(issueKey);
			});

		this.inflight.set(issueKey, request);
		return request;
	}

	async setIssueChecked(
		url: string,
		checked: boolean,
		options: {
			lastOpenStateId?: string;
			reopenStrategy: ReopenStateStrategy;
			preferredCompletedStateName?: string;
			preferredReopenStateName?: string;
		},
	): Promise<LinearIssue> {
		const issue = await this.fetchIssueByUrl(url, true);
		const targetState = checked
			? resolveCompletedState(issue.team, options.preferredCompletedStateName)
			: resolveReopenState(
				issue.team,
				options.reopenStrategy,
				options.lastOpenStateId,
				options.preferredReopenStateName,
			);

		if (!targetState) {
			throw new Error(`Could not determine a Linear workflow state for ${issue.identifier}.`);
		}

		await this.query<UpdateIssueResult>(
			this.getRequiredToken(issue.workspaceSlug),
			`
				mutation UpdateIssueState($issueId: String!, $stateId: String!) {
					issueUpdate(id: $issueId, input: { stateId: $stateId }) {
						success
						issue {
							id
						}
					}
				}
			`,
			{
				issueId: issue.id,
				stateId: targetState.id,
			},
		);

		this.cache.delete(getIssueKey(issue));
		return this.fetchIssueByUrl(url, true);
	}

	private async fetchIssueByIdentifier(workspaceSlug: string, identifier: string, fallbackUrl: string): Promise<LinearIssue> {
		const token = this.getRequiredToken(workspaceSlug);
		const parsedIdentifier = parseLinearIdentifier(identifier);
		if (!parsedIdentifier) {
			throw new Error(`Invalid Linear issue identifier "${identifier}".`);
		}

		const result = await this.query<IssueQueryResult>(
			token,
			`
				query IssueByIdentifier($teamKey: String!, $issueNumber: Float!) {
					teams(filter: { key: { eq: $teamKey } }, first: 1) {
						nodes {
							id
								key
							issues(filter: { number: { eq: $issueNumber } }, first: 1) {
								nodes {
									id
									identifier
									title
									url
									state {
										id
										name
										type
									}
									team {
										id
										key
										name
										states {
											nodes {
												id
												name
												type
											}
										}
									}
								}
							}
						}
					}
				}
			`,
			{
				teamKey: parsedIdentifier.teamKey,
				issueNumber: parsedIdentifier.issueNumber,
			},
		);

		const issueNode = result.teams.nodes[0]?.issues.nodes[0];
		if (!issueNode) {
			throw new Error(`Linear issue ${identifier} was not found in workspace "${workspaceSlug}".`);
		}

		const team: LinearTeam = {
			id: issueNode.team.id,
			key: issueNode.team.key,
			name: issueNode.team.name,
			states: issueNode.team.states.nodes,
		};

		const issue: LinearIssue = {
			id: issueNode.id,
			identifier: issueNode.identifier,
			title: issueNode.title,
			url: issueNode.url || fallbackUrl,
			workspaceSlug,
			state: issueNode.state,
			team,
		};

		this.cache.set(getIssueKey(issue), issue);
		return issue;
	}

	private getRequiredToken(workspaceSlug: string): string {
		const token = this.getTokenForWorkspace(workspaceSlug);
		if (!token) {
			throw new MissingWorkspaceTokenError(workspaceSlug);
		}

		return token;
	}

	private getTokenForWorkspace(workspaceSlug: string): string | null {
		const normalizedWorkspace = workspaceSlug.trim().toLowerCase();
		const connection = this.getSettings().connections.find((candidate) => (
			candidate.workspaceSlug.trim().toLowerCase() === normalizedWorkspace && candidate.apiToken.trim().length > 0
		));

		return connection?.apiToken ?? null;
	}

	private async query<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
		const response = await requestUrl({
			url: "https://api.linear.app/graphql",
			method: "POST",
			contentType: "application/json",
			headers: {
				Authorization: token,
			},
			body: JSON.stringify({
				query,
				variables,
			}),
		});

		const payload = response.json as GraphQLResponse<T>;
		if (payload.errors?.length) {
			throw new Error(payload.errors.map((error) => error.message).join("; "));
		}

		if (!payload.data) {
			throw new Error("Linear API returned no data.");
		}

		return payload.data;
	}
}
