/**
 * Copies the built interface into the Python package: apps/spike/dist -> python/frontedge/src/frontedge/static
 */
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "apps", "spike", "dist");
const target = join(root, "python", "frontedge", "src", "frontedge", "static");

if (!existsSync(source)) {
  console.error("apps/spike/dist is missing — run pnpm build first.");
  process.exit(1);
}

await mkdir(target, { recursive: true });
for (const entry of ["index.html", "assets"]) {
  await rm(join(target, entry), { recursive: true, force: true });
}
await cp(source, target, { recursive: true });
console.log(`Interface copied: ${target}`);
