import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const DEV_CONFIG_FILENAME = ".obsidian-dev.json";

export function getProjectRoot(importMetaUrl) {
	return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..");
}

export function getDevConfigPath(projectRoot) {
	return path.join(projectRoot, DEV_CONFIG_FILENAME);
}

export function readStoredVaultPath(projectRoot) {
	const configPath = getDevConfigPath(projectRoot);
	if (!fs.existsSync(configPath)) {
		return null;
	}

	const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
	if (typeof rawConfig.vaultPath !== "string" || rawConfig.vaultPath.trim().length === 0) {
		return null;
	}

	return path.resolve(rawConfig.vaultPath);
}

export function writeStoredVaultPath(projectRoot, vaultPath) {
	const configPath = getDevConfigPath(projectRoot);
	fs.writeFileSync(configPath, JSON.stringify({
		vaultPath: path.resolve(vaultPath),
	}, null, "\t") + "\n");
	return configPath;
}
