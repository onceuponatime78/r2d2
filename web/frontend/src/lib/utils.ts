import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Server config cache ───────────────────────────────────────────────────────

interface ServerConfig {
  proxy: boolean
  ingressPath: string
  version: string
}

let configCache: ServerConfig | null = null
let configPromise: Promise<ServerConfig> | null = null

/** Fetch /api/config (cached). Returns proxy mode and ingress path. */
export function getServerConfig(): Promise<ServerConfig> {
  if (configCache) return Promise.resolve(configCache)
  if (configPromise) return configPromise
  configPromise = fetch(getBaseUrl() + "/api/config")
    .then(r => r.json())
    .then((cfg: ServerConfig) => { configCache = cfg; return cfg })
    .catch(() => {
      const fallback: ServerConfig = { proxy: false, ingressPath: "", version: "unknown" }
      configCache = fallback
      return fallback
    })
  return configPromise
}

/** Get the base URL (handles ingress path from <base> tag or empty string) */
export function getBaseUrl(): string {
  const base = document.querySelector("base")?.getAttribute("href")
  if (base) {
    // Remove trailing slash for consistent joining
    return base.replace(/\/$/, "")
  }
  return ""
}

/**
 * Build a WebSocket URL for the given path.
 * In proxy mode, connects through the server. In direct mode, connects to robot.
 */
export function buildWsUrl(path: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  const base = getBaseUrl()
  return `${proto}//${window.location.host}${base}${path}`
}
