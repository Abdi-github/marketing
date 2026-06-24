import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const PORT = process.env.PORT || "3000";
const isWindows = process.platform === "win32";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
}

function findListeningPidsOnPort(port) {
  if (isWindows) {
    const result = run("netstat", ["-ano", "-p", "tcp"]);
    if (result.error || result.status !== 0) return [];
    const lines = result.stdout.split(/\r?\n/);
    const pids = new Set();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const [proto, localAddress, , state, pid] = parts;
      if (
        proto.toLowerCase() === "tcp" &&
        localAddress.endsWith(`:${port}`) &&
        state.toUpperCase() === "LISTENING" &&
        /^\d+$/.test(pid)
      ) {
        pids.add(pid);
      }
    }
    return [...pids];
  }

  const lsof = run("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]);
  if (!lsof.error && lsof.status === 0) {
    return lsof.stdout
      .split(/\s+/)
      .map((pid) => pid.trim())
      .filter(Boolean);
  }

  const ss = run("sh", [
    "-c",
    `ss -ltnp 'sport = :${port}' 2>/dev/null | sed -n 's/.*pid=\\([0-9][0-9]*\\).*/\\1/p'`,
  ]);
  if (ss.error || ss.status !== 0) return [];
  return [...new Set(ss.stdout.split(/\s+/).filter(Boolean))];
}

function killPidTree(pid) {
  if (isWindows) {
    const result = run("taskkill", ["/PID", pid, "/T", "/F"]);
    if (result.status !== 0) {
      console.warn(`[redev] Could not kill PID ${pid}: ${result.stderr.trim()}`);
    }
    return;
  }

  const result = run("kill", ["-TERM", pid]);
  if (result.status !== 0) {
    console.warn(`[redev] Could not terminate PID ${pid}: ${result.stderr.trim()}`);
  }
}

function freePort(port) {
  const pids = findListeningPidsOnPort(port);
  if (pids.length === 0) {
    console.log(`[redev] Port ${port} is free.`);
    return;
  }

  console.log(`[redev] Port ${port} is in use by PID(s): ${pids.join(", ")}. Killing them...`);
  for (const pid of pids) killPidTree(pid);
}

function startDev(port) {
  const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
  console.log(`[redev] Starting dev stack on port ${port}...`);
  const child = spawn(pnpm, ["run", "dev"], {
    stdio: "inherit",
    shell: isWindows,
    env: {
      ...process.env,
      PORT: port,
    },
  });

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

freePort(PORT);
await sleep(750);
startDev(PORT);
