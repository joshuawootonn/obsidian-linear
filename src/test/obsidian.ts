import {vi} from "vitest";

export class TAbstractFile {
	constructor(public path = "") {}
}

export class TFile extends TAbstractFile {
	extension = "md";
}

export class Notice {
	constructor(_message: string) {}
}

export const requestUrl = vi.fn();
