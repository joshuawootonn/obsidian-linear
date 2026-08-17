import {requestUrl} from "obsidian";
import type {LinearPluginSettings, ReopenStateStrategy} from "../settings";
import {IssueCache} from "./cache";
import {resolveCompletedState, resolveReopenState} from "./stateSelection";
import type {LinearDayIssue, LinearIssue, LinearTeam, LinearWorkflowState} from "./types";
import {getIssueKey, parseLinearIdentifier, parseLinearIssueUrl} from "./workspaces";

interface GraphQLResponse<T> {
	data?: T;
	errors?: Array<{
		extensions?: {
			code?: string;
		};
		message: string;
	}>;
}

interface IssueNode {
	completedAt?: string | null;
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
}

interface DayIssuesQueryResult {
	viewer: {
		assignedIssues: {
			nodes: IssueNode[];
			pageInfo: {
				endCursor: string | null;
				hasNextPage: boolean;
			};
		};
	};
}

export interface DayIssueQuery {
	dateEnd: string;
	dateStart: string;
	includeCurrentStatus: boolean;
	statusName: string;
	workspaceSlug: string;
}

interface IssueQueryResult {
	teams: {
		nodes: Array<{
			id: string;
			key: string;
			issues: {
				nodes: IssueNode[];
			};
		}>;
	};
}

interface UpdateIssueResult {
	issueUpdate: {
		success: boolean;
		issue: IssueNode | null;
	};
}

const ISSUE_CACHE_TTL_MS = 30 * 60_000;
const DEFAULT_RATE_LIMIT_PAUSE_MS = 60 * 60_000;

export class MissingWorkspaceTokenError extends Error {
	constructor(readonly workspaceSlug: string) {
		super(`No Linear token configured for workspace "${workspaceSlug}".`);
		this.name = "MissingWorkspaceTokenError";
	}
}

export class LinearRateLimitError extends Error {
	constructor(readonly retryAt: number) {
		super(`Linear API rate limit reached. Sync is paused until ${new Date(retryAt).toLocaleTimeString()}.`);
		this.name = "LinearRateLimitError";
	}
}

export class LinearClient {
	private readonly cache = new IssueCache<LinearIssue>(ISSUE_CACHE_TTL_MS);
	private readonly inflight = new Map<string, Promise<LinearIssue>>();
	private rateLimitedUntil = 0;

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
		const inflightRequest = this.inflight.get(issueKey);
		if (inflightRequest) {
			return inflightRequest;
		}

		if (!force) {
			const cachedIssue = this.cache.get(issueKey);
			if (cachedIssue) {
				return cachedIssue;
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
		const issue = await this.fetchIssueByUrl(url);
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

		return this.updateIssue(issue, {
			stateId: targetState.id,
		});
	}

	async setIssueTitle(url: string, title: string): Promise<LinearIssue> {
		const issue = await this.fetchIssueByUrl(url);
		return this.updateIssue(issue, {
			title,
		});
	}

	async setIssueState(url: string, stateId: string): Promise<LinearIssue> {
		const issue = await this.fetchIssueByUrl(url);
		const targetState = issue.team.states.find((state) => state.id === stateId);
		if (!targetState) {
			throw new Error(`Workflow state is not available for ${issue.identifier}.`);
		}

		return this.updateIssue(issue, {stateId: targetState.id});
	}

	async fetchAssignedDayIssues(options: DayIssueQuery): Promise<LinearDayIssue[]> {
		const token = this.getRequiredToken(options.workspaceSlug);
		const filters = [
			`{ completedAt: { gte: ${toGraphQlString(options.dateStart)}, lt: ${toGraphQlString(options.dateEnd)} } }`,
		];
		if (options.includeCurrentStatus) {
			filters.unshift(`{ state: { name: { eqIgnoreCase: ${toGraphQlString(options.statusName)} } } }`);
		}

		const issues: LinearDayIssue[] = [];
		let after: string | null = null;
		do {
			const result: DayIssuesQueryResult = await this.query<DayIssuesQueryResult>(
				token,
				`
					query AssignedLinearDayIssues($after: String) {
						viewer {
							assignedIssues(
								after: $after
								first: 50
								filter: { or: [${filters.join(", ")}] }
							) {
								nodes {
									id
									identifier
									title
									url
									completedAt
									state {
										id
										name
										type
										color
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
												color
											}
										}
									}
								}
								pageInfo {
									endCursor
									hasNextPage
								}
							}
						}
					}
				`,
				{after},
			);
			const connection = result.viewer.assignedIssues;
			for (const node of connection.nodes) {
				const issue = toLinearDayIssue(node, options.workspaceSlug);
				issues.push(issue);
				this.cache.set(getIssueKey(issue), issue);
			}
			after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
		} while (after);

		return issues;
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
										color
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
												color
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

		const issue = toLinearIssue(issueNode, workspaceSlug, fallbackUrl);

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

	private async updateIssue(issue: LinearIssue, input: {
		stateId?: string;
		title?: string;
	}): Promise<LinearIssue> {
		const result = await this.query<UpdateIssueResult>(
			this.getRequiredToken(issue.workspaceSlug),
			`
				mutation UpdateIssue($issueId: String!, $input: IssueUpdateInput!) {
					issueUpdate(id: $issueId, input: $input) {
						success
						issue {
							id
							identifier
							title
							url
							state {
								id
								name
								type
								color
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
										color
									}
								}
							}
						}
					}
				}
			`,
			{
				issueId: issue.id,
				input,
			},
		);

		if (!result.issueUpdate.success || !result.issueUpdate.issue) {
			throw new Error(`Linear did not update ${issue.identifier}.`);
		}

		const updatedIssue = toLinearIssue(result.issueUpdate.issue, issue.workspaceSlug, issue.url);
		this.cache.set(getIssueKey(updatedIssue), updatedIssue);
		return updatedIssue;
	}

	private getTokenForWorkspace(workspaceSlug: string): string | null {
		const normalizedWorkspace = workspaceSlug.trim().toLowerCase();
		const connection = this.getSettings().connections.find((candidate) => (
			candidate.workspaceSlug.trim().toLowerCase() === normalizedWorkspace && candidate.apiToken.trim().length > 0
		));

		return connection?.apiToken ?? null;
	}

	private async query<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
		if (Date.now() < this.rateLimitedUntil) {
			throw new LinearRateLimitError(this.rateLimitedUntil);
		}

		const operationName = extractOperationName(query);
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
			throw: false,
		});

		let payload: GraphQLResponse<T> | undefined;
		try {
			payload = response.json as GraphQLResponse<T>;
		} catch {
			payload = undefined;
		}

		const rateLimitReset = parseRateLimitReset(getResponseHeader(response.headers, "x-ratelimit-requests-reset"));
		const rateLimitRemaining = Number(getResponseHeader(response.headers, "x-ratelimit-requests-remaining"));
		const isRateLimited = (
			response.status === 429 ||
			payload?.errors?.some((error) => (
				error.extensions?.code === "RATELIMITED" ||
				error.message.toLowerCase().includes("rate limit")
			)) === true
		);

		if (isRateLimited) {
			this.rateLimitedUntil = rateLimitReset ?? Date.now() + DEFAULT_RATE_LIMIT_PAUSE_MS;
			throw new LinearRateLimitError(this.rateLimitedUntil);
		}

		if (
			rateLimitReset &&
			Number.isFinite(rateLimitRemaining) &&
			rateLimitRemaining <= 0
		) {
			this.rateLimitedUntil = rateLimitReset;
		}

		if (response.status >= 400 || payload?.errors?.length) {
			const messages = payload?.errors?.map((error) => error.message).join("; ");
			console.error("[obsidian-linear] Linear API request failed", {
				operationName,
				status: response.status,
				variables,
				errors: payload?.errors,
				body: response.text,
			});
			throw new Error(
				messages
					? `Linear API error (${operationName}, status ${response.status}): ${messages}`
					: `Linear API request failed (${operationName}) with status ${response.status}.`,
			);
		}

		if (!payload?.data) {
			console.error("[obsidian-linear] Linear API returned no data", {
				operationName,
				status: response.status,
				body: response.text,
			});
			throw new Error("Linear API returned no data.");
		}

		return payload.data;
	}
}

function extractOperationName(query: string): string {
	const match = query.match(/(?:query|mutation)\s+([A-Za-z0-9_]+)/);
	return match?.[1] ?? "anonymous";
}

function getResponseHeader(headers: Record<string, string>, name: string): string | undefined {
	const normalizedName = name.toLowerCase();
	const matchingHeader = Object.entries(headers).find(([key]) => key.toLowerCase() === normalizedName);
	return matchingHeader?.[1];
}

function parseRateLimitReset(value: string | undefined): number | null {
	if (!value) {
		return null;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= Date.now()) {
		return null;
	}

	return parsed;
}

function toLinearIssue(issueNode: IssueNode, workspaceSlug: string, fallbackUrl: string): LinearIssue {
	const team: LinearTeam = {
		id: issueNode.team.id,
		key: issueNode.team.key,
		name: issueNode.team.name,
		states: issueNode.team.states.nodes,
	};

	return {
		id: issueNode.id,
		identifier: issueNode.identifier,
		title: issueNode.title,
		url: issueNode.url || fallbackUrl,
		workspaceSlug,
		state: issueNode.state,
		team,
	};
}

function toLinearDayIssue(issueNode: IssueNode, workspaceSlug: string): LinearDayIssue {
	return {
		...toLinearIssue(issueNode, workspaceSlug, issueNode.url),
		completedAt: issueNode.completedAt ?? null,
	};
}

function toGraphQlString(value: string): string {
	return JSON.stringify(value);
}
