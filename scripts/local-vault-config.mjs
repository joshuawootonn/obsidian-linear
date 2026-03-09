import fs from "node:fs";
import path from "node:path";

export const LOCAL_CONFIG_DIRNAME = ".local";
export const LOCAL_CONFIG_FILENAME = "obsidian-vault.json";

export function getProjectRoot(importMetaUrl) {
	return path.resolve(path.dirname(new URL(importMetaUrl).pathname), "..");
}

export function getLocalConfigPath(projectRoot) {
	return path.join(projectRoot, LOCAL_CONFIG_DIRNAME, LOCAL_CONFIG_FILENAME);
}

export function readStoredVaultPath(projectRoot) {
	const configPath = getLocalConfigPath(projectRoot);
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
	const configPath = getLocalConfigPath(projectRoot);
	fs.mkdirSync(path.dirname(configPath), {recursive: true});
	fs.writeFileSync(configPath, JSON.stringify({
		vaultPath: path.resolve(vaultPath),
	}, null, "\t") + "\n");
	return configPath;
}
