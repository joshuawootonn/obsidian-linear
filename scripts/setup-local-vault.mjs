import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {getProjectRoot, writeStoredVaultPath} from "./local-vault-config.mjs";

const args = process.argv.slice(2);
const vaultArg = args.find((arg) => !arg.startsWith("--"));
const copyMode = args.includes("--copy");

if (!vaultArg) {
	console.error("Usage: pnpm setup-vault /absolute/path/to/vault [--copy]");
	process.exit(1);
}

const projectRoot = getProjectRoot(import.meta.url);
const vaultPath = path.resolve(vaultArg);

if (!fs.existsSync(vaultPath)) {
	console.error(`Vault path does not exist: ${vaultPath}`);
	process.exit(1);
}

const configPath = writeStoredVaultPath(projectRoot, vaultPath);
console.log(`Stored vault path in ${path.relative(projectRoot, configPath)}`);

const installScriptPath = path.join(projectRoot, "scripts", "install-local-vault.mjs");
const installArgs = [installScriptPath];
if (copyMode) {
	installArgs.push("--copy");
}

const {status} = await import("node:child_process").then(({spawnSync}) => spawnSync(
	process.execPath,
	installArgs,
	{
		cwd: projectRoot,
		stdio: "inherit",
	},
));

if (status !== 0) {
	process.exit(status ?? 1);
}
