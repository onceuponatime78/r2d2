// Multi-robot UUID storage
// Maps robot's broadcast UUID → our paired UUID + metadata

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

function load(): Record<string, SavedRobot> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
  } catch {
    return {}
  }
}

function save(robots: Record<string, SavedRobot>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(robots))
}

/** Get all saved robots */
export function getAllRobots(): Record<string, SavedRobot> {
  return load()
}

/** Get saved robot by its broadcast UUID */
export function getRobot(robotUuid: string): SavedRobot | null {
  return load()[robotUuid] ?? null
}

/** Get our paired UUID for a robot (or null if not paired) */
export function getPairedUuid(robotUuid: string): string | null {
  return load()[robotUuid]?.pairedUuid ?? null
}

/** Save/update a robot entry */
export function saveRobot(robotUuid: string, robot: SavedRobot) {
  const robots = load()
  robots[robotUuid] = robot
  save(robots)
}

/** Remove a robot entry */
export function removeRobot(robotUuid: string) {
  const robots = load()
  delete robots[robotUuid]
  save(robots)
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

  // We don't know the robot's broadcast UUID from legacy storage,
  // so use a placeholder that will be updated on first gin response
  const robots = load()
  if (Object.keys(robots).length > 0) return // already migrated

  const placeholder = "legacy_" + oldUuid.slice(0, 8)
  robots[placeholder] = {
    pairedUuid: oldUuid,
    name: oldName || "R2-D2",
    ip: oldIp,
  }
  save(robots)
  setLastRobot(placeholder)

  // Clean up old keys
  localStorage.removeItem("r2d2_uuid")
  localStorage.removeItem("r2d2_last_ip")
  localStorage.removeItem("r2d2_last_name")
}
