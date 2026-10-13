import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { probeProcess } from "./win32/process.js";

const SESSION_FILE_PATTERN = /^(\d+)\.json$/;
const INTERACTIVE_KIND = "interactive";

/**
 * Running interactive Claude Code session, as described by its file in `~/.claude/sessions`.
 */
export type ClaudeSession = {
	pid: number;
	sessionId: string;
	name: string;
	cwd: string;
	status: string;

	/**
	 * Unix time in milliseconds at which the session was started.
	 */
	startedAt: number;

	/**
	 * Unix time in milliseconds at which {@link ClaudeSession.status} last changed.
	 */
	statusUpdatedAt: number;
};

/**
 * Interactive sessions whose process is running, ordered by start time.
 */
export type SessionListing = {
	reachable: ClaudeSession[];

	/**
	 * Sessions whose process cannot be opened, which is the case for elevated processes.
	 */
	inaccessible: ClaudeSession[];
};

/**
 * The session directory or one of its files could not be read or does not have the expected content.
 */
export class SessionFileError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "SessionFileError";
	}
}

/**
 * Lists the interactive Claude Code sessions of the current user.
 * @throws {SessionFileError} When the session directory or a session file cannot be read or parsed.
 */
export function listInteractiveSessions(): SessionListing {
	const directory = path.join(os.homedir(), ".claude", "sessions");

	let fileNames: string[];
	try {
		fileNames = fs.readdirSync(directory);
	} catch (error) {
		throw new SessionFileError(`Cannot list session directory ${directory}`, { cause: error });
	}

	const listing: SessionListing = { reachable: [], inaccessible: [] };
	for (const fileName of fileNames) {
		const match = SESSION_FILE_PATTERN.exec(fileName);
		if (match === null) {
			continue;
		}

		const file = path.join(directory, fileName);
		let text: string;
		try {
			text = fs.readFileSync(file, "utf8");
		} catch (error) {
			// The session ended between listing the directory and reading its file.
			if (isNodeError(error) && error.code === "ENOENT") {
				continue;
			}
			throw new SessionFileError(`Cannot read session file ${file}`, { cause: error });
		}

		const parsed = parseSessionFile(file, Number(match[1]), text);
		if (parsed === "not-interactive") {
			continue;
		}

		const probe = probeProcess(parsed.session.pid);
		switch (probe.state) {
			case "gone":
				break;
			case "inaccessible":
				listing.inaccessible.push(parsed.session);
				break;
			case "running":
				// A differing creation time means the process ID was reused after the session ended.
				if (probe.creationTime === parsed.processCreationTime) {
					listing.reachable.push(parsed.session);
				}
				break;
		}
	}

	listing.reachable.sort((a, b) => a.startedAt - b.startedAt);
	listing.inaccessible.sort((a, b) => a.startedAt - b.startedAt);
	return listing;
}

type ParsedSessionFile = {
	session: ClaudeSession;
	processCreationTime: bigint;
};

function parseSessionFile(file: string, pidFromFileName: number, text: string): ParsedSessionFile | "not-interactive" {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (error) {
		throw new SessionFileError(`Session file ${file} is not valid JSON`, { cause: error });
	}
	if (typeof json !== "object" || json === null || Array.isArray(json)) {
		throw new SessionFileError(`Session file ${file} does not contain a JSON object`);
	}

	const fields = json as Record<string, unknown>;
	if (requireString(file, fields, "kind") !== INTERACTIVE_KIND) {
		return "not-interactive";
	}

	const pid = requireNumber(file, fields, "pid");
	if (pid !== pidFromFileName) {
		throw new SessionFileError(`Session file ${file} describes process ${pid}`);
	}

	const procStart = requireString(file, fields, "procStart");
	if (!/^\d+$/.test(procStart)) {
		throw new SessionFileError(`Session file ${file} has a non-numeric "procStart": ${JSON.stringify(procStart)}`);
	}

	return {
		session: {
			pid,
			sessionId: requireString(file, fields, "sessionId"),
			name: requireString(file, fields, "name"),
			cwd: requireString(file, fields, "cwd"),
			status: requireString(file, fields, "status"),
			startedAt: requireNumber(file, fields, "startedAt"),
			statusUpdatedAt: requireNumber(file, fields, "statusUpdatedAt"),
		},
		processCreationTime: BigInt(procStart),
	};
}

function requireString(file: string, fields: Record<string, unknown>, key: string): string {
	const value = fields[key];
	if (typeof value !== "string") {
		throw new SessionFileError(`Session file ${file} has no string "${key}"`);
	}
	return value;
}

function requireNumber(file: string, fields: Record<string, unknown>, key: string): number {
	const value = fields[key];
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new SessionFileError(`Session file ${file} has no numeric "${key}"`);
	}
	return value;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
