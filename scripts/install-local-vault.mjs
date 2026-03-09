import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {getProjectRoot, readStoredVaultPath} from "./local-vault-config.mjs";

const args = process.argv.slice(2);
const vaultArg = args.find((arg) => !arg.startsWith("--"));
const copyMode = args.includes("--copy");
const projectRoot = getProjectRoot(import.meta.url);
const storedVaultPath = readStoredVaultPath(projectRoot);
const resolvedVaultPath = vaultArg ? path.resolve(vaultArg) : storedVaultPath;

if (!resolvedVaultPath) {
	console.error("Usage: pnpm install:vault /absolute/path/to/vault [--copy]");
	console.error("Or run: pnpm setup-vault /absolute/path/to/vault");
	process.exit(1);
}

const manifestPath = path.join(projectRoot, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const pluginId = manifest.id;

if (!fs.existsSync(resolvedVaultPath)) {
	throw new Error(`Vault path does not exist: ${resolvedVaultPath}`);
}

const pluginRoot = path.join(resolvedVaultPath, ".obsidian", "plugins", pluginId);

fs.mkdirSync(path.dirname(pluginRoot), {recursive: true});

if (copyMode) {
	copyPlugin(projectRoot, pluginRoot);
	console.log(`Copied plugin files to ${pluginRoot}`);
} else {
	installSymlink(projectRoot, pluginRoot);
	console.log(`Symlinked ${pluginRoot} -> ${projectRoot}`);
}

if (!vaultArg && storedVaultPath) {
	console.log(`Using stored vault path: ${storedVaultPath}`);
}

const buildArtifacts = ["manifest.json", "main.js", "styles.css"];
for (const artifact of buildArtifacts) {
	const artifactPath = path.join(projectRoot, artifact);
	if (!fs.existsSync(artifactPath)) {
		console.warn(`Warning: ${artifact} is missing in ${projectRoot}. Run pnpm build or pnpm dev before enabling the plugin.`);
	}
}

console.log("");
console.log("Next steps:");
console.log("1. Open the target vault in Obsidian.");
console.log("2. Reload Obsidian or disable/re-enable the Obsidian Linear plugin.");
console.log("3. Open Settings -> Community plugins and enable Obsidian Linear.");

function installSymlink(sourcePath, targetPath) {
	if (fs.existsSync(targetPath)) {
		const existing = fs.lstatSync(targetPath);
		if (!existing.isSymbolicLink()) {
			throw new Error(`${targetPath} already exists and is not a symlink. Remove it or rerun with --copy.`);
		}

		const currentTarget = fs.readlinkSync(targetPath);
		const resolvedCurrentTarget = path.resolve(path.dirname(targetPath), currentTarget);
		if (resolvedCurrentTarget === sourcePath) {
			return;
		}

		fs.unlinkSync(targetPath);
	}

	fs.symlinkSync(sourcePath, targetPath, "junction");
}

function copyPlugin(sourcePath, targetPath) {
	if (fs.existsSync(targetPath)) {
		fs.rmSync(targetPath, {recursive: true, force: true});
	}

	fs.mkdirSync(targetPath, {recursive: true});
	for (const entry of ["manifest.json", "main.js", "styles.css"]) {
		const sourceEntry = path.join(sourcePath, entry);
		if (!fs.existsSync(sourceEntry)) {
			continue;
		}

		fs.copyFileSync(sourceEntry, path.join(targetPath, entry));
	}
}
