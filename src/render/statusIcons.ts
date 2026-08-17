import {setIcon} from "obsidian";
import type {LinearWorkflowState} from "../linear/types";

type LinearStatusIcon = "linear-backlog" | "linear-canceled" | "linear-completed" | "linear-started" | "linear-unstarted";

export interface StatusIconConfig {
	color?: string;
	icon: string;
	label: string;
	spin?: boolean;
	tone: "active" | "muted" | "neutral" | "success" | "warning";
}

export function getIssueStatusIcon(state: LinearWorkflowState): StatusIconConfig {
	const type = state.type.trim().toLowerCase();
	return {
		...(isCssHexColor(state.color) ? {color: state.color} : {}),
		icon: getLinearIcon(type),
		label: state.name,
		tone: getTone(type),
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

export function renderStatusIcon(container: HTMLElement, config: StatusIconConfig): void {
	if (config.color) {
		container.style.color = config.color;
	}

	if (!config.icon.startsWith("linear-")) {
		setIcon(container, config.icon);
		return;
	}

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 16 16");
	svg.setAttribute("fill", "none");
	svg.setAttribute("aria-hidden", "true");
	svg.setAttribute("focusable", "false");
	svg.classList.add("obsidian-linear-status-svg");

	const circle = createSvgElement("circle", {
		cx: "8",
		cy: "8",
		r: "5.75",
		stroke: "currentColor",
		"stroke-width": "1.5",
	});

	switch (config.icon as LinearStatusIcon) {
		case "linear-backlog":
			circle.setAttribute("stroke-dasharray", "1.4 1.7");
			svg.append(circle);
			break;
		case "linear-started":
			svg.append(circle);
			svg.append(createSvgElement("path", {
				d: "M8 2.25a5.75 5.75 0 0 1 0 11.5Z",
				fill: "currentColor",
			}));
			break;
		case "linear-completed":
			svg.append(createSvgElement("circle", {
				cx: "8",
				cy: "8",
				r: "6.5",
				fill: "currentColor",
			}));
			svg.append(createSvgElement("path", {
				d: "m4.9 8.1 2 2 4.2-4.3",
				stroke: "var(--background-primary)",
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
				"stroke-width": "1.6",
			}));
			break;
		case "linear-canceled":
			svg.append(circle);
			svg.append(createSvgElement("path", {
				d: "m5.7 5.7 4.6 4.6m0-4.6-4.6 4.6",
				stroke: "currentColor",
				"stroke-linecap": "round",
				"stroke-width": "1.5",
			}));
			break;
		case "linear-unstarted":
		default:
			svg.append(circle);
			break;
	}

	container.append(svg);
}

function getLinearIcon(type: string): LinearStatusIcon {
	switch (type) {
		case "backlog":
			return "linear-backlog";
		case "started":
			return "linear-started";
		case "completed":
			return "linear-completed";
		case "canceled":
			return "linear-canceled";
		case "unstarted":
		default:
			return "linear-unstarted";
	}
}

function getTone(type: string): StatusIconConfig["tone"] {
	switch (type) {
		case "started":
			return "active";
		case "completed":
			return "success";
		case "canceled":
			return "warning";
		case "backlog":
		case "unstarted":
			return "muted";
		default:
			return "neutral";
	}
}

function isCssHexColor(value: string | undefined): value is string {
	return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value);
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
	tag: K,
	attributes: Record<string, string>,
): SVGElementTagNameMap[K] {
	const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
	for (const [name, value] of Object.entries(attributes)) {
		element.setAttribute(name, value);
	}
	return element;
}
