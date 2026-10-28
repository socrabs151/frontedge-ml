/**
 * Consumer smoke: pack @frontedge-ml/ui, install the tarball into a fresh Vite app on React 18,
 * type-check it, build it and render it in a browser.
 *
 * Run from the repository root: node apps/spike/scripts/smoke-npm.mjs
 * Needs network for the first install (react, vite) and a Chromium-family browser.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const packDir = mkdtempSync(join(tmpdir(), "frontedge-pack-"));
const appDir = mkdtempSync(join(tmpdir(), "frontedge-consumer-"));

const MAIN = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@frontedge-ml/ui/styles.css";
import { I18nProvider, RunsTable, StatusBadge, Tooltip, type Run } from "@frontedge-ml/ui";

const startedAt = new Date(Date.now() - 42 * 60_000).toISOString();
const runs: Run[] = Array.from({ length: 60 }, (_, index) => ({
  id: \`run-\${index + 1}\`,
  name: index === 0 ? "baseline" : \`candidate-\${index + 1}\`,
  status: index === 1 ? "failed" : "succeeded",
  dataset: "demo",
  gitSha: "",
  startedAt,
  durationMs: 130_000 + index,
  owner: "",
  metrics: { accuracy: index === 0 ? 0.9 : 0.8 },
  series: { accuracy: [{ step: 0, value: 0.8 }, { step: 1, value: 0.9 }] },
  metricDirection: { accuracy: "maximize" },
  stages: [],
}));

function App() {
  return (
    <I18nProvider strings={{ en: { "column.status": "State" } }}>
      <div className="fe-root" style={{ padding: 16 }}>
        <StatusBadge status="succeeded" />
        <Tooltip label="No external provider needed">
          <button type="button">Tip</button>
        </Tooltip>
        <RunsTable
          runs={runs}
          now={Date.now()}
          rowHeight={32}
          height={320}
          columnVisibility={{}}
          onColumnVisibilityChange={() => {}}
          onOpenRun={() => {}}
          columnIds={["name", "status", "dataset", "model", "accuracy"]}
          metricSpecs={[{ id: "accuracy", label: "Accuracy", direction: "maximize" }]}
          headerRenderers={{ model: () => "Model" }}
          cellRenderers={{
            model: (run) => <span className="model">{run.dataset}</span>,
          }}
        />
      </div>
    </I18nProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

function run(command, cwd) {
  console.log(`$ ${command}`);
  execSync(command, { cwd, stdio: "inherit" });
}

/** The built dist is static: a ten-line server is more reliable than spawning `vite preview`. */
function serveDist() {
  const dist = join(appDir, "dist");
  const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const candidate = pathname === "/" ? join(dist, "index.html") : join(dist, pathname);
    const file = existsSync(candidate) ? candidate : join(dist, "index.html");
    response.writeHead(200, {
      "content-type": types[extname(file)] ?? "application/octet-stream",
    });
    response.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

let preview;
try {
  run(`pnpm --filter @frontedge-ml/ui pack --pack-destination "${packDir}"`, root);
  const tarball = join(packDir, readdirSync(packDir).find((name) => name.endsWith(".tgz")));
  if (!existsSync(tarball)) throw new Error("the tarball was not created");

  writeFileSync(
    join(appDir, "package.json"),
    JSON.stringify(
      {
        name: "frontedge-consumer-smoke",
        private: true,
        type: "module",
        dependencies: {
          "@frontedge-ml/ui": `file:${tarball.replace(/\\/g, "/")}`,
          react: "18.3.1",
          "react-dom": "18.3.1",
        },
        devDependencies: {
          "@types/react": "18.3.18",
          "@types/react-dom": "18.3.5",
          "@vitejs/plugin-react": "4.3.4",
          typescript: "5.7.2",
          vite: "6.0.11",
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(appDir, "index.html"),
    '<!doctype html><html lang="en"><head><meta charset="UTF-8" />' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>' +
      '<body><div id="root" class="fe-root"></div>' +
      '<script type="module" src="/src/main.tsx"></script></body></html>',
  );
  writeFileSync(
    join(appDir, "vite.config.ts"),
    'import react from "@vitejs/plugin-react";\n' +
      'import { defineConfig } from "vite";\n\n' +
      "export default defineConfig({ plugins: [react()] });\n",
  );
  writeFileSync(
    join(appDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "react-jsx",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ["src", "vite.config.ts"],
      },
      null,
      2,
    ),
  );
  mkdirSync(join(appDir, "src"));
  writeFileSync(join(appDir, "src", "main.tsx"), MAIN);

  run("npm install --no-audit --no-fund", appDir);
  const reactVersion = JSON.parse(
    readFileSync(join(appDir, "node_modules", "react", "package.json"), "utf8"),
  ).version;
  run("npx tsc --noEmit", appDir);
  run("npx vite build", appDir);

  const served = await serveDist();
  preview = served.server;
  const port = served.port;

  const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".fe-table__row", { timeout: 15000 });
  const rows = await page.locator(".fe-table__row").count();
  const accuracy = await page.locator(".fe-metric__value").first().textContent();
  const stateHeader = await page.getByRole("columnheader", { name: /State/ }).count();
  const modelHeader = await page.getByRole("columnheader", { name: /Model/ }).count();
  const modelCells = await page.locator(".model").count();
  const scrollBox = await page.locator(".fe-table__scroll").boundingBox();
  await browser.close();

  if (rows < 2) throw new Error(`expected at least 2 rows, got ${rows}`);
  if (!accuracy?.includes("0.900")) throw new Error(`unexpected metric cell: ${accuracy}`);
  if (stateHeader === 0) throw new Error("the product dictionary override did not reach the header");
  if (modelHeader === 0 || modelCells === 0) {
    throw new Error("the custom header/cell renderer did not render");
  }
  if (!scrollBox || scrollBox.height < 200 || scrollBox.height > 321) {
    throw new Error(`the table height is not bounded: ${scrollBox?.height}`);
  }
  if (errors.length > 0) throw new Error(`console errors:\n- ${errors.join("\n- ")}`);

  console.log(
    `consumer smoke: React ${reactVersion}, build + types + render OK (${rows} rows, ${accuracy?.trim()})`,
  );
} finally {
  if (preview) {
    await new Promise((resolve) => preview.close(resolve));
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  for (const dir of [packDir, appDir]) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // A preview process may still hold a directory on Windows: the temp dir is harmless.
      console.log(`note: could not remove ${dir}`);
    }
  }
}
