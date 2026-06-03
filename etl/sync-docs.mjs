import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const docsDir = path.join(root, "docs");

if (!docsDir.startsWith(`${root}${path.sep}`)) {
  throw new Error(`Refusing to sync outside project root: ${docsDir}`);
}

await fs.access(path.join(distDir, "index.html"));
await fs.rm(docsDir, { recursive: true, force: true });
await fs.mkdir(docsDir, { recursive: true });
await fs.cp(distDir, docsDir, { recursive: true });

console.log(`Synced ${distDir} to ${docsDir}`);
