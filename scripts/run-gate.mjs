import { spawn, spawnSync } from "node:child_process";

const [seconds, ...command] = process.argv.slice(2);
if (!seconds || command.length === 0) {
  console.error("usage: node scripts/run-gate.mjs <seconds> <command...>");
  process.exit(2);
}

const timeoutMs = Number(seconds) * 1000;
const isWindows = process.platform === "win32";
const child = spawn(command[0], command.slice(1), {
  stdio: ["ignore", "pipe", "pipe"],
  detached: !isWindows,
});

child.stdout.on("data", (chunk) => process.stdout.write(chunk));
child.stderr.on("data", (chunk) => process.stderr.write(chunk));

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  if (isWindows) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      process.kill(child.pid, "SIGKILL");
    }
  }
  console.error(`\nrun-gate: timed out after ${seconds}s`);
}, timeoutMs);

child.on("exit", (code, signal) => {
  clearTimeout(timer);
  if (timedOut) process.exit(124);
  process.exit(code ?? (signal ? 1 : 0));
});
