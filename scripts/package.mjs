import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const PLUGIN = "de.chrisliebaer.claude-voice.sdPlugin";
const DIST = path.join(ROOT, "dist");
const STAGING = path.join(DIST, PLUGIN);

const project = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
if (!fs.existsSync(path.join(ROOT, PLUGIN, "bin", "plugin.js"))) {
	throw new Error("The plugin is not built; run `npm run build` first");
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, PLUGIN), STAGING, { recursive: true, filter: (source) => path.basename(source) !== "logs" });

// The packaged plugin runs outside of this repository, so it carries its runtime dependencies in the versions that are
// installed here.
const dependencies = Object.fromEntries(
	Object.keys(project.dependencies).map((name) => [name, JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules", name, "package.json"), "utf8")).version]),
);
const manifest = { name: project.name, version: project.version, private: true, type: "module", dependencies };
fs.writeFileSync(path.join(STAGING, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`);

execSync("npm install --omit=dev --no-audit --no-fund --no-package-lock", { cwd: STAGING, stdio: "inherit" });
execSync(`npx --no-install streamdeck pack "${STAGING}" --output "${DIST}" --force --no-update-check --no-file-list`, { cwd: ROOT, stdio: "inherit" });
