import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const ignored = new Set(["node_modules", ".next", ".git", "coverage"]);
const files = [];

async function walk(dir) {
  for (const name of await readdir(dir)) {
    if (ignored.has(name) || name === "job-report.json") continue;
    const path = join(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) await walk(path);
    else files.push(path);
  }
}

await walk(root);
const manifest = [];
for (const file of files.sort()) {
  const content = await readFile(file);
  manifest.push({ path: relative(root, file), bytes: content.length, sha256: createHash("sha256").update(content).digest("hex") });
}

await writeFile("job-report.json", JSON.stringify({ project: "tony-cms", generatedAt: new Date().toISOString(), files: manifest, fileCount: manifest.length }, null, 2));
console.log(`Wrote job-report.json for ${manifest.length} files`);
