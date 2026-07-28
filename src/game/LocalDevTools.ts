/**
 * Map Tools and Server Runs are local developer chrome only.
 * Deployed builds hide them so players cannot rewrite seeds or sync
 * custom runs into the shared leaderboard path.
 */

export type LocalDevToolsEnv = {
  /** True under `vite` / `bun run dev` (import.meta.env.DEV). */
  viteDev: boolean;
  /** Browser hostname when available. */
  hostname: string;
};

export function isLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** Map Tools + Server Runs: Vite dev or a local machine host. */
export function isLocalDevToolsEnabled(env: LocalDevToolsEnv): boolean {
  return env.viteDev || isLocalHostname(env.hostname);
}

export function readLocalDevToolsEnv(
  viteDev: boolean = import.meta.env.DEV,
  hostname: string = typeof location !== "undefined" ? location.hostname : "",
): LocalDevToolsEnv {
  return { viteDev, hostname };
}
