import { homedir } from "node:os";
import { join } from "node:path";

/** Prefer API_AGENT_HOME, else ~/.api-agent */
export function getDataDir(): string {
  if (process.env.API_AGENT_HOME) {
    return process.env.API_AGENT_HOME;
  }
  return join(homedir(), ".api-agent");
}

export function getRegistryDir(): string {
  return join(getDataDir(), "registry");
}

export function getTracesDir(): string {
  return join(getDataDir(), "traces");
}

export function getPidPath(): string {
  return join(getDataDir(), "server.pid");
}

export function getPortPath(): string {
  return join(getDataDir(), "server.port");
}

export function defaultPort(): number {
  const raw = process.env.API_AGENT_PORT;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 8787;
}
