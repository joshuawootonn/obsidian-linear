import process from "node:process";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {getProjectRoot} from "./local-vault-config.mjs";

if (process.argv.slice(2).length > 0) {
	console.error("install-local-vault.mjs no longer accepts a vault path override. Run pnpm setup:vault /absolute/path/to/vault first.");
	process.exit(1);
}

const projectRoot = getProjectRoot(import.meta.url);
const pluginSourceScript = path.join(projectRoot, "scripts", "plugin-source.mjs");
const result = spawnSync(process.execPath, [pluginSourceScript, "use-local"], {
	cwd: projectRoot,
	stdio: "inherit",
});

process.exit(result.status ?? 1);
