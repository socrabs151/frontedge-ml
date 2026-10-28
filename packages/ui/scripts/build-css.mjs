/**
 * Builds dist/styles.css (all layers) and the four layer files for a host that wants
 * to import only what it uses. Local @imports are inlined; external ones are left alone.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const styles = join(packageRoot, "src", "styles");
const entry = join(styles, "index.css");
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
writeFileSync(
  target,
  `/* @frontedge-ml/ui — built from src/styles */\n\n${inline(entry, new Set())}\n`,
);

for (const layer of ["tokens.css", "base.css", "components.css", "patterns.css"]) {
  const source = readFileSync(join(styles, layer), "utf8");
  writeFileSync(
    join(packageRoot, "dist", layer),
    `/* @frontedge-ml/ui — ${layer}; import tokens.css first */\n\n${source}\n`,
  );
}
console.log(`styles: ${target} (+ tokens, base, components, patterns)`);
