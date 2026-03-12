import process from "node:process";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {getProjectRoot} from "./local-vault-config.mjs";

const projectRoot = getProjectRoot(import.meta.url);
const setupVaultScript = path.join(projectRoot, "scripts", "setup-vault.mjs");
const result = spawnSync(process.execPath, [setupVaultScript, ...process.argv.slice(2)], {
	cwd: projectRoot,
	stdio: "inherit",
});

process.exit(result.status ?? 1);
