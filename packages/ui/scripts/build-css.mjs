/**
 * Inlines src/styles/index.css into a single dist/styles.css, so a consumer's bundler does not
 * have to resolve @import from inside the package. Local imports are inlined in place; external
 * ones are left for the bundler.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(packageRoot, "src", "styles", "index.css");
const target = join(packageRoot, "dist", "styles.css");

function inline(file, seen) {
  if (seen.has(file)) throw new Error(`Circular @import: ${file}`);
  seen.add(file);
  return readFileSync(file, "utf8").replace(/@import\s+"([^"]+)";/g, (match, spec) => {
    if (!spec.startsWith(".")) return match;
    const nested = inline(join(dirname(file), spec), seen);
    return nested.trimEnd();
  });
}

mkdirSync(join(packageRoot, "dist"), { recursive: true });
writeFileSync(target, `/* @frontedge-ml/ui — built from src/styles */\n\n${inline(entry, new Set())}\n`);
console.log(`styles: ${target}`);
