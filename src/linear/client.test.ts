import {requestUrl} from "obsidian";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import type {LinearPluginSettings} from "../settings";
import {LinearClient, LinearRateLimitError} from "./client";

const ISSUE_URL = "https://linear.app/type-the-word/issue/TYP-37/test-issue";
const mockedRequestUrl = vi.mocked(requestUrl);

const settings: LinearPluginSettings = {
	connections: [{
		apiToken: "test-token",
		workspaceSlug: "type-the-word",
	}],
	pollIntervalMinutes: 30,
	preferredCompletedStateName: "Done",
	preferredReopenStateName: "Backlog",
	reopenStateStrategy: "last-known",
	taskFormat: "single-line",
};

const issueNode = {
	id: "issue-id",
	identifier: "TYP-37",
	state: {
		id: "started-state",
		name: "In Progress",
		type: "started" as const,
	},
	team: {
		id: "team-id",
		key: "TYP",
		name: "Type the Word",
		states: {
			nodes: [
				{id: "started-state", name: "In Progress", type: "started" as const},
				{id: "done-state", name: "Done", type: "completed" as const},
			],
		},
	},
	title: "Test issue",
	url: ISSUE_URL,
};

function response(json: unknown, options: {
	headers?: Record<string, string>;
	status?: number;
	text?: string;
} = {}): Awaited<ReturnType<typeof requestUrl>> {
	return {
		arrayBuffer: new ArrayBuffer(0),
		headers: options.headers ?? {},
		json,
		status: options.status ?? 200,
		text: options.text ?? "",
	};
}

function issueQueryResponse() {
	return response({
		data: {
			teams: {
				nodes: [{
					id: "team-id",
					issues: {
						nodes: [issueNode],
					},
					key: "TYP",
				}],
			},
		},
	});
}

describe("LinearClient request control", () => {
	beforeEach(() => {
		mockedRequestUrl.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("shares an in-flight request even when callers force a refresh", async () => {
		mockedRequestUrl.mockResolvedValue(issueQueryResponse());

		const client = new LinearClient(() => settings);
		const first = client.fetchIssueByUrl(ISSUE_URL, true);
		const second = client.fetchIssueByUrl(ISSUE_URL, true);

		expect(mockedRequestUrl).toHaveBeenCalledTimes(1);

		const [firstIssue, secondIssue] = await Promise.all([first, second]);
		expect(firstIssue).toEqual(secondIssue);
	});

	it("keeps issue reads cached for 30 minutes", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-26T12:00:00Z"));
		mockedRequestUrl.mockResolvedValue(issueQueryResponse());

		const client = new LinearClient(() => settings);
		await client.fetchIssueByUrl(ISSUE_URL);
		vi.advanceTimersByTime(29 * 60_000);
		await client.fetchIssueByUrl(ISSUE_URL);

		expect(mockedRequestUrl).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(2 * 60_000);
		await client.fetchIssueByUrl(ISSUE_URL);
		expect(mockedRequestUrl).toHaveBeenCalledTimes(2);
	});

	it("stops sending requests until Linear's rate-limit reset", async () => {
		const resetAt = Date.now() + 20 * 60_000;
		mockedRequestUrl.mockResolvedValue(response({
			errors: [{
				extensions: {code: "RATELIMITED"},
				message: "Rate limit exceeded",
			}],
		}, {
			headers: {
				"X-RateLimit-Requests-Reset": String(resetAt),
			},
			status: 400,
		}));

		const client = new LinearClient(() => settings);
		await expect(client.fetchIssueByUrl(ISSUE_URL)).rejects.toMatchObject({
			retryAt: resetAt,
		});
		await expect(client.fetchIssueByUrl(ISSUE_URL)).rejects.toBeInstanceOf(LinearRateLimitError);

		expect(mockedRequestUrl).toHaveBeenCalledTimes(1);
	});

	it("stops before another request when the successful response exhausts the quota", async () => {
		const resetAt = Date.now() + 20 * 60_000;
		mockedRequestUrl.mockResolvedValue({
			...issueQueryResponse(),
			headers: {
				"X-RateLimit-Requests-Remaining": "0",
				"X-RateLimit-Requests-Reset": String(resetAt),
			},
		});

		const client = new LinearClient(() => settings);
		await client.fetchIssueByUrl(ISSUE_URL);
		await expect(client.fetchIssueByUrl(ISSUE_URL, true)).rejects.toBeInstanceOf(LinearRateLimitError);

		expect(mockedRequestUrl).toHaveBeenCalledTimes(1);
	});

	it("uses the mutation response as the updated cache value", async () => {
		mockedRequestUrl
			.mockResolvedValueOnce(issueQueryResponse())
			.mockResolvedValueOnce(response({
				data: {
					issueUpdate: {
						issue: {
							...issueNode,
							title: "Updated title",
						},
						success: true,
					},
				},
			}));

		const client = new LinearClient(() => settings);
		await client.fetchIssueByUrl(ISSUE_URL);
		const updatedIssue = await client.setIssueTitle(ISSUE_URL, "Updated title");
		const cachedIssue = await client.fetchIssueByUrl(ISSUE_URL);

		expect(updatedIssue.title).toBe("Updated title");
		expect(cachedIssue.title).toBe("Updated title");
		expect(mockedRequestUrl).toHaveBeenCalledTimes(2);
	});

	it("fetches assigned Today and completed issues with pagination", async () => {
		mockedRequestUrl
			.mockResolvedValueOnce(response({
				data: {
					viewer: {
						assignedIssues: {
							nodes: [{...issueNode, completedAt: null}],
							pageInfo: {endCursor: "next-page", hasNextPage: true},
						},
					},
				},
			}))
			.mockResolvedValueOnce(response({
				data: {
					viewer: {
						assignedIssues: {
							nodes: [{...issueNode, completedAt: "2026-08-17T18:00:00Z", id: "completed-issue"}],
							pageInfo: {endCursor: null, hasNextPage: false},
						},
					},
				},
			}));

		const client = new LinearClient(() => settings);
		const issues = await client.fetchAssignedDayIssues({
			dateEnd: "2026-08-18T05:00:00.000Z",
			dateStart: "2026-08-17T05:00:00.000Z",
			includeCurrentStatus: true,
			statusName: "Today",
			workspaceSlug: "type-the-word",
		});

		expect(issues).toHaveLength(2);
		expect(issues[1]?.completedAt).toBe("2026-08-17T18:00:00Z");
		expect(mockedRequestUrl).toHaveBeenCalledTimes(2);
		const firstRequest = mockedRequestUrl.mock.calls[0]?.[0] as {body?: string} | undefined;
		const firstBody = JSON.parse(firstRequest?.body ?? "{}") as {query?: string; variables?: {after?: string | null}};
		expect(firstBody.query).toContain("eqIgnoreCase: \"Today\"");
		expect(firstBody.query).toContain("completedAt");
		expect(firstBody.variables?.after).toBeNull();
		const secondRequest = mockedRequestUrl.mock.calls[1]?.[0] as {body?: string} | undefined;
		const secondBody = JSON.parse(secondRequest?.body ?? "{}") as {variables?: {after?: string}};
		expect(secondBody.variables?.after).toBe("next-page");
	});

	it("changes an issue directly to a selected workflow state", async () => {
		mockedRequestUrl
			.mockResolvedValueOnce(issueQueryResponse())
			.mockResolvedValueOnce(response({
				data: {
					issueUpdate: {
						issue: {...issueNode, state: issueNode.team.states.nodes[1]},
						success: true,
					},
				},
			}));

		const client = new LinearClient(() => settings);
		const updated = await client.setIssueState(ISSUE_URL, "done-state");

		expect(updated.state.name).toBe("Done");
		const mutationRequest = mockedRequestUrl.mock.calls[1]?.[0] as {body?: string} | undefined;
		const mutationBody = JSON.parse(mutationRequest?.body ?? "{}") as {
			variables?: {input?: {stateId?: string}};
		};
		expect(mutationBody.variables?.input?.stateId).toBe("done-state");
	});
});
