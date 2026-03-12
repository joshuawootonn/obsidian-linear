import path from "node:path";
import process from "node:process";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import {getProjectRoot, writeStoredVaultPath} from "./local-vault-config.mjs";

const projectRoot = getProjectRoot(import.meta.url);
const pluginSourceScript = path.join(projectRoot, "scripts", "plugin-source.mjs");
const vaultArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

if (!vaultArg) {
	console.error("Usage: pnpm setup:vault /absolute/path/to/vault");
	process.exit(1);
}

const vaultPath = path.resolve(vaultArg);
if (!fs.existsSync(vaultPath)) {
	console.error(`Vault path does not exist: ${vaultPath}`);
	process.exit(1);
}

const configPath = writeStoredVaultPath(projectRoot, vaultPath);
console.log(`Stored vault path in ${path.relative(projectRoot, configPath)}`);

const result = spawnSync(process.execPath, [pluginSourceScript, "use-local"], {
	cwd: projectRoot,
	stdio: "inherit",
});

process.exit(result.status ?? 1);
