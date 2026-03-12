import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
	getDevConfigPath,
	getProjectRoot,
	readStoredVaultPath,
	writeStoredVaultPath,
} from "./local-vault-config.mjs";

const BUILD_ARTIFACTS = ["manifest.json", "main.js", "styles.css"];

const projectRoot = getProjectRoot(import.meta.url);
const manifest = readManifest(projectRoot);
const pluginId = manifest.id;
const repoPluginPath = path.join(projectRoot, ".obsidian", "plugins", pluginId);

const {command, extraArgs} = parseCliArgs(process.argv.slice(2));

switch (command) {
	case "status":
		ensureNoExtraArgs(command, extraArgs);
		printStatus(resolveVaultPath(projectRoot, false));
		break;
	case "use-local":
		ensureNoExtraArgs(command, extraArgs);
		useLocal(resolveVaultPath(projectRoot, true));
		break;
	case "use-synced":
		ensureNoExtraArgs(command, extraArgs);
		useSynced(resolveVaultPath(projectRoot, true));
		break;
	default:
		printUsage();
		process.exitCode = 1;
}

function parseCliArgs(args) {
	return {
		command: args[0],
		extraArgs: args.slice(1),
	};
}

function printUsage() {
	console.error("Usage:");
	console.error("  node scripts/plugin-source.mjs status");
	console.error("  node scripts/plugin-source.mjs use-local");
	console.error("  node scripts/plugin-source.mjs use-synced");
}

function ensureNoExtraArgs(command, extraArgs) {
	if (extraArgs.length === 0) {
		return;
	}

	throw new Error(`The "${command}" command does not accept a vault path. Run setup:vault first to save the vault path.`);
}

function resolveVaultPath(root, required) {
	const storedVaultPath = readStoredVaultPath(root);
	const resolvedVaultPath = storedVaultPath;

	if (!resolvedVaultPath) {
		if (required) {
			throw new Error(`Vault path is not configured. Run setup:vault /absolute/path/to/vault to create ${path.basename(getDevConfigPath(root))}.`);
		}

		return null;
	}

	if (!fs.existsSync(resolvedVaultPath)) {
		throw new Error(`Vault path does not exist: ${resolvedVaultPath}`);
	}

	return resolvedVaultPath;
}

function readManifest(root) {
	const manifestPath = path.join(root, "manifest.json");
	const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
	if (typeof parsed.id !== "string" || parsed.id.trim().length === 0) {
		throw new Error(`manifest.json is missing a valid plugin id at ${manifestPath}`);
	}

	return parsed;
}

function getVaultPluginPath(vaultPath) {
	return path.join(vaultPath, ".obsidian", "plugins", pluginId);
}

function getVaultPluginsDir(vaultPath) {
	return path.dirname(getVaultPluginPath(vaultPath));
}

function getVaultBackupRoot(vaultPath) {
	return path.join(vaultPath, ".obsidian", "plugin-backups", pluginId);
}

function ensureLocalPluginOutput() {
	fs.mkdirSync(repoPluginPath, {recursive: true});

	for (const artifact of BUILD_ARTIFACTS) {
		const sourcePath = path.join(projectRoot, artifact);
		const targetPath = path.join(repoPluginPath, artifact);
		ensureSymlink(targetPath, sourcePath);
	}
}

function ensureSymlink(linkPath, targetPath) {
	if (fs.existsSync(linkPath) || isBrokenSymlink(linkPath)) {
		const existingStat = fs.lstatSync(linkPath);
		if (existingStat.isSymbolicLink()) {
			const resolvedTarget = path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath));
			if (resolvedTarget === targetPath) {
				return;
			}
		}

		fs.rmSync(linkPath, {recursive: true, force: true});
	}

	fs.symlinkSync(targetPath, linkPath);
}

function isBrokenSymlink(targetPath) {
	try {
		return fs.lstatSync(targetPath).isSymbolicLink() && !fs.existsSync(targetPath);
	} catch {
		return false;
	}
}

function getMode(vaultPath) {
	if (!vaultPath) {
		return {
			mode: "unconfigured",
			pluginPath: null,
			symlinkTarget: null,
			backupRoot: null,
		};
	}

	const pluginPath = getVaultPluginPath(vaultPath);
	const backupRoot = getVaultBackupRoot(vaultPath);

	if (!fs.existsSync(pluginPath) && !isBrokenSymlink(pluginPath)) {
		return {
			mode: "missing",
			pluginPath,
			symlinkTarget: null,
			backupRoot,
		};
	}

	const stat = fs.lstatSync(pluginPath);
	if (stat.isSymbolicLink()) {
		const symlinkTarget = path.resolve(path.dirname(pluginPath), fs.readlinkSync(pluginPath));
		return {
			mode: symlinkTarget === repoPluginPath ? "local-build" : "symlinked-other",
			pluginPath,
			symlinkTarget,
			backupRoot,
		};
	}

	return {
		mode: "synced-static",
		pluginPath,
		symlinkTarget: null,
		backupRoot,
	};
}

function printStatus(vaultPath) {
	const status = getMode(vaultPath);

	console.log(`Plugin id: ${pluginId}`);
	console.log(`Repo root: ${projectRoot}`);
	console.log(`Local output: ${repoPluginPath}`);
	console.log(`Config path: ${getDevConfigPath(projectRoot)}`);

	if (!vaultPath) {
		console.log("Vault path: not configured");
		console.log("Mode: unconfigured");
		return;
	}

	console.log(`Vault path: ${vaultPath}`);
	console.log(`Vault plugin path: ${status.pluginPath}`);
	console.log(`Backup root: ${status.backupRoot}`);
	console.log(`Mode: ${status.mode}`);

	if (status.symlinkTarget) {
		console.log(`Symlink target: ${status.symlinkTarget}`);
	}
}

function useLocal(vaultPath) {
	ensureLocalPluginOutput();

	const pluginPath = getVaultPluginPath(vaultPath);
	const pluginsDir = getVaultPluginsDir(vaultPath);
	const backupRoot = getVaultBackupRoot(vaultPath);
	fs.mkdirSync(pluginsDir, {recursive: true});
	fs.mkdirSync(backupRoot, {recursive: true});

	if (fs.existsSync(pluginPath) || isBrokenSymlink(pluginPath)) {
		const stat = fs.lstatSync(pluginPath);
		if (stat.isSymbolicLink()) {
			const symlinkTarget = path.resolve(path.dirname(pluginPath), fs.readlinkSync(pluginPath));
			if (symlinkTarget === repoPluginPath) {
				writeStoredVaultPath(projectRoot, vaultPath);
				console.log(`Already using local build mode: ${pluginPath} -> ${repoPluginPath}`);
				printStatus(vaultPath);
				return;
			}

			fs.unlinkSync(pluginPath);
		} else {
			const backupPath = path.join(backupRoot, `synced-${createTimestamp()}`);
			fs.renameSync(pluginPath, backupPath);
			console.log(`Moved synced plugin backup to ${backupPath}`);
		}
	}

	fs.symlinkSync(repoPluginPath, pluginPath, "junction");
	writeStoredVaultPath(projectRoot, vaultPath);

	console.log(`Using local build mode: ${pluginPath} -> ${repoPluginPath}`);
	printMissingArtifactsWarning();
	printStatus(vaultPath);
}

function useSynced(vaultPath) {
	const pluginPath = getVaultPluginPath(vaultPath);
	const pluginsDir = getVaultPluginsDir(vaultPath);
	const backupRoot = getVaultBackupRoot(vaultPath);
	fs.mkdirSync(pluginsDir, {recursive: true});

	if (fs.existsSync(pluginPath) || isBrokenSymlink(pluginPath)) {
		const stat = fs.lstatSync(pluginPath);
		if (stat.isSymbolicLink()) {
			fs.unlinkSync(pluginPath);
		} else {
			writeStoredVaultPath(projectRoot, vaultPath);
			console.log(`Already using synced static mode at ${pluginPath}`);
			printStatus(vaultPath);
			return;
		}
	}

	const latestBackup = getLatestBackup(backupRoot);
	if (!latestBackup) {
		writeStoredVaultPath(projectRoot, vaultPath);
		console.warn(`No synced backup found in ${backupRoot}.`);
		console.warn("Next steps:");
		console.warn("1. Let Obsidian Sync restore the plugin folder, or copy a synced plugin folder back into place.");
		console.warn("2. Re-run: node scripts/plugin-source.mjs use-synced");
		printStatus(vaultPath);
		return;
	}

	fs.renameSync(latestBackup, pluginPath);
	writeStoredVaultPath(projectRoot, vaultPath);
	console.log(`Restored synced plugin from ${latestBackup}`);
	printStatus(vaultPath);
}

function getLatestBackup(backupRoot) {
	if (!fs.existsSync(backupRoot)) {
		return null;
	}

	const entries = fs.readdirSync(backupRoot)
		.map((name) => path.join(backupRoot, name))
		.filter((entryPath) => fs.statSync(entryPath).isDirectory())
		.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

	return entries[0] ?? null;
}

function createTimestamp() {
	const now = new Date();
	const date = [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, "0"),
		String(now.getDate()).padStart(2, "0"),
	].join("");
	const time = [
		String(now.getHours()).padStart(2, "0"),
		String(now.getMinutes()).padStart(2, "0"),
		String(now.getSeconds()).padStart(2, "0"),
	].join("");

	return `${date}-${time}`;
}

function printMissingArtifactsWarning() {
	const missingArtifacts = BUILD_ARTIFACTS
		.filter((artifact) => !fs.existsSync(path.join(projectRoot, artifact)));

	if (missingArtifacts.length === 0) {
		return;
	}

	console.warn(`Warning: missing build artifacts in repo root: ${missingArtifacts.join(", ")}`);
	console.warn("Run pnpm build or pnpm dev before enabling the plugin in Obsidian.");
}
