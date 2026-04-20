// Multi-robot UUID storage
// Maps robot's broadcast UUID → our paired UUID + metadata
// Syncs with server-side storage (/api/robots) when available,
// falls back to localStorage for standalone/offline use.

import { getBaseUrl } from "./utils"

export interface SavedRobot {
  /** Our paired UUID used for grantAccess with this robot */
  pairedUuid: string
  /** Robot display name (from discovery/gin) */
  name: string
  /** Last known IP */
  ip: string
}

const STORAGE_KEY = "r2d2_robots"
const LAST_KEY = "r2d2_last_robot"

// ── In-memory cache (loaded from server or localStorage on init) ──────────────

let cache: Record<string, SavedRobot> | null = null
let initPromise: Promise<void> | null = null

/** Initialize robot storage — call once on app startup.
 *  Loads from server, merges with localStorage, then persists both. */
export async function initRobots(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = doInit()
  return initPromise
}

async function doInit() {
  const local = loadLocal()
  let server: Record<string, SavedRobot> = {}

  try {
    const res = await fetch(getBaseUrl() + "/api/robots")
    if (res.ok) {
      server = await res.json()
    }
  } catch {
    // Server not reachable — use localStorage only
  }

  // Merge: server is authoritative, but add any local-only entries
  cache = { ...local, ...server }

  // If local had entries the server didn't, push them up
  const localKeys = Object.keys(local)
  const newOnLocal = localKeys.filter(k => !(k in server))
  if (newOnLocal.length > 0) {
    persistServer(cache)
  }

  // Keep localStorage in sync
  saveLocal(cache)
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Get all saved robots */
export function getAllRobots(): Record<string, SavedRobot> {
  return cache ?? loadLocal()
}

/** Get saved robot by its broadcast UUID */
export function getRobot(robotUuid: string): SavedRobot | null {
  return getAllRobots()[robotUuid] ?? null
}

/** Get our paired UUID for a robot (or null if not paired) */
export function getPairedUuid(robotUuid: string): string | null {
  return getAllRobots()[robotUuid]?.pairedUuid ?? null
}

/** Save/update a robot entry */
export function saveRobot(robotUuid: string, robot: SavedRobot) {
  const robots = getAllRobots()
  robots[robotUuid] = robot
  persist(robots)
}

/** Remove a robot entry */
export function removeRobot(robotUuid: string) {
  const robots = getAllRobots()
  delete robots[robotUuid]
  persist(robots)
}

/** Set which robot we last connected to */
export function setLastRobot(robotUuid: string) {
  localStorage.setItem(LAST_KEY, robotUuid)
}

/** Get last connected robot UUID + saved data */
export function getLastRobot(): { robotUuid: string; saved: SavedRobot } | null {
  const robotUuid = localStorage.getItem(LAST_KEY)
  if (!robotUuid) return null
  const saved = getRobot(robotUuid)
  if (!saved) return null
  return { robotUuid, saved }
}

/** Migrate from old single-UUID storage to new format.
 *  Call once on startup. */
export function migrateFromLegacy() {
  const oldUuid = localStorage.getItem("r2d2_uuid")
  const oldIp = localStorage.getItem("r2d2_last_ip")
  const oldName = localStorage.getItem("r2d2_last_name")
  if (!oldUuid || !oldIp) return

  const robots = getAllRobots()
  if (Object.keys(robots).length > 0) return // already migrated

  const placeholder = "legacy_" + oldUuid.slice(0, 8)
  robots[placeholder] = {
    pairedUuid: oldUuid,
    name: oldName || "R2-D2",
    ip: oldIp,
  }
  persist(robots)
  setLastRobot(placeholder)

  localStorage.removeItem("r2d2_uuid")
  localStorage.removeItem("r2d2_last_ip")
  localStorage.removeItem("r2d2_last_name")
}

// ── Internal ──────────────────────────────────────────────────────────────────

function loadLocal(): Record<string, SavedRobot> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
  } catch {
    return {}
  }
}

function saveLocal(robots: Record<string, SavedRobot>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(robots))
}

function persist(robots: Record<string, SavedRobot>) {
  cache = robots
  saveLocal(robots)
  persistServer(robots)
}

function persistServer(robots: Record<string, SavedRobot>) {
  fetch(getBaseUrl() + "/api/robots", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(robots),
  }).catch(() => {
    // Server not reachable — localStorage is the fallback
  })
}
