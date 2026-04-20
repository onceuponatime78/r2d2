import { useState, useEffect, useCallback, useRef } from "react"
import { useRobot } from "@/hooks/useRobot"
import { cmd, MODE } from "@/lib/protocol"
import type { DiscoveredRobot } from "@/lib/protocol"
import { ConnectionDialog } from "@/components/ConnectionDialog"
import { StatusBar } from "@/components/StatusBar"
import { VideoFeed } from "@/components/VideoFeed"
import { Joystick } from "@/components/Joystick"
import { ControlPanel } from "@/components/ControlPanel"
import { SoundPicker } from "@/components/SoundPicker"
import { WifiManager } from "@/components/WifiManager"
import { DeviceManager } from "@/components/DeviceManager"
import * as robots from "@/lib/robots"

const MAX_LOG_LINES = 200

export default function App() {
  const [ip, setIp] = useState<string | null>(null)
  const [uuid, setUuid] = useState<string | null>(null)
  const [showConnect, setShowConnect] = useState(true)
  const [robotName, setRobotName] = useState<string | null>(null)
  // Track the current robot's broadcast UUID so we can update storage on gin
  const currentRobotUuidRef = useRef<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [showWifi, setShowWifi] = useState(false)
  const [showDevices, setShowDevices] = useState(false)
  const logsEndRef = useRef<HTMLDivElement | null>(null)

  const handleLog = useCallback((msg: string) => {
    setLogs(prev => {
      const next = [...prev, msg]
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next
    })
  }, [])

  const { status, state, send, connect, disconnect, sendRequest } = useRobot({ ip, uuid, onLog: handleLog })

  // Migrate legacy single-UUID storage on first load
  useEffect(() => {
    robots.migrateFromLegacy()
  }, [])

  // Auto-connect to last known robot on startup
  const autoConnectAttempted = useRef(false)
  useEffect(() => {
    if (autoConnectAttempted.current) return
    const last = robots.getLastRobot()
    if (last) {
      autoConnectAttempted.current = true
      currentRobotUuidRef.current = last.robotUuid
      setIp(last.saved.ip)
      setUuid(last.saved.pairedUuid)
      setRobotName(last.saved.name)
      connect(last.saved.ip, last.saved.pairedUuid)
    }
  }, [connect])

  // When gin state updates arrive, persist the robot entry.
  // This handles: updating IP/name if they changed, and replacing legacy placeholder UUIDs
  // with the real robot broadcast UUID.
  useEffect(() => {
    if (status !== "connected" || !state.uuid || !state.ip) return
    const robotUuid = state.uuid
    const pairedUuid = uuid
    if (!pairedUuid) return

    // If we connected via a legacy placeholder, migrate to real UUID
    const prev = currentRobotUuidRef.current
    if (prev && prev !== robotUuid && prev.startsWith("legacy_")) {
      robots.removeRobot(prev)
    }
    currentRobotUuidRef.current = robotUuid

    robots.saveRobot(robotUuid, {
      pairedUuid,
      name: state.name || robotName || "R2-D2",
      ip: state.ip,
    })
    robots.setLastRobot(robotUuid)

    // Update display name from gin
    if (state.name) setRobotName(state.name)
  }, [status, state.uuid, state.ip, state.name, uuid, robotName])

  // Auto-close dialog when connection succeeds
  useEffect(() => {
    if (status === "connected") setShowConnect(false)
  }, [status])

  const handleConnect = (robot: DiscoveredRobot) => {
    // Look up or create paired UUID for this robot
    const existing = robots.getPairedUuid(robot.uuid)
    const pairedUuid = existing ?? crypto.randomUUID()

    currentRobotUuidRef.current = robot.uuid
    setIp(robot.ip)
    setUuid(pairedUuid)
    setRobotName(robot.name)

    robots.saveRobot(robot.uuid, { pairedUuid, name: robot.name, ip: robot.ip })
    robots.setLastRobot(robot.uuid)

    connect(robot.ip, pairedUuid)
  }

  const handleManualConnect = (manualIp: string) => {
    // For manual connect, we don't know the robot's broadcast UUID yet.
    // Try to find an existing robot with this IP, otherwise use a temp UUID.
    const all = robots.getAllRobots()
    let foundRobotUuid: string | null = null
    let pairedUuid: string | null = null
    for (const [rUuid, saved] of Object.entries(all)) {
      if (saved.ip === manualIp) {
        foundRobotUuid = rUuid
        pairedUuid = saved.pairedUuid
        setRobotName(saved.name)
        break
      }
    }
    if (!pairedUuid) {
      pairedUuid = crypto.randomUUID()
      foundRobotUuid = "manual_" + Date.now()
      robots.saveRobot(foundRobotUuid, { pairedUuid, name: "R2-D2", ip: manualIp })
    }

    currentRobotUuidRef.current = foundRobotUuid
    setIp(manualIp)
    setUuid(pairedUuid)
    robots.setLastRobot(foundRobotUuid!)
    connect(manualIp, pairedUuid)
  }

  /** Called from ConnectionDialog after AP mode pairing succeeds */
  const handleAPPaired = (robotIp: string, pairedUuid: string) => {
    // We don't know robot's broadcast UUID yet — gin will fill it in
    const tempId = "ap_" + Date.now()
    currentRobotUuidRef.current = tempId
    setIp(robotIp)
    setUuid(pairedUuid)
    robots.saveRobot(tempId, { pairedUuid, name: "R2-D2", ip: robotIp })
    robots.setLastRobot(tempId)
    connect(robotIp, pairedUuid)
    // Auto-open WiFi management so user can send home WiFi credentials
    setShowWifi(true)
  }

  const handleDisconnect = () => {
    disconnect()
    setIp(null)
    setShowConnect(true)
  }

  const disabled = status !== "connected"

  // Head control with hold-to-repeat
  const headIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startHead = useCallback((dir: -1 | 1) => {
    if (disabled) return
    send(cmd.headDir(dir))
    headIntervalRef.current = setInterval(() => send(cmd.headDir(dir)), 200)
  }, [send, disabled])
  const stopHead = useCallback(() => {
    if (headIntervalRef.current) { clearInterval(headIntervalRef.current); headIntervalRef.current = null }
    send(cmd.headDir(0))
  }, [send])

  // Connection status styling
  const ledClass =
    status === "connected" ? "bg-green-400 shadow-[0_0_8px_#4ade80]" :
    status === "connecting" ? "bg-yellow-400 animate-pulse" :
    status === "error" ? "bg-red-500" : "bg-gray-600"

  const battery = state.battery
  const batteryColor =
    battery === undefined ? "text-gray-500" :
    battery > 60 ? "text-green-400" :
    battery > 30 ? "text-yellow-400" : "text-red-400"

  return (
    <div className="min-h-screen text-[#e0e0e0] overflow-x-hidden" style={{ backgroundColor: "#0b0e14", fontFamily: "'Roboto Mono', monospace" }}>

      {/* ── Header ── */}
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h1 className="font-orbitron text-2xl md:text-3xl font-bold text-white tracking-tighter">
              R2-D2 <span className="text-blue-500">ASTROMECH</span>
            </h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">
Control Interface v1.1
            </p>
          </div>

          <div className="flex items-center gap-3 bg-gray-900/60 px-3 py-2 rounded-lg border border-white/10">
            <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${ledClass}`} />
            <span className="text-sm">
              {status === "connected" ? (robotName ?? "R2-D2") : status.toUpperCase()}
            </span>
            {status === "connected" && battery !== undefined && (
              <span className={`text-xs font-mono ${batteryColor}`}>{battery}%</span>
            )}
            {status === "connected" ? (
              <button
                onClick={handleDisconnect}
                className="btn-r2 bg-red-900/60 hover:bg-red-800 text-white px-3 py-1 rounded text-[10px] font-bold border border-red-800/50"
              >
                DISCONNECT
              </button>
            ) : (
              <button
                onClick={() => setShowConnect(true)}
                className="btn-r2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-xs font-bold"
              >
                CONNECT
              </button>
            )}
            <button
              onClick={() => setShowLogs(v => !v)}
              title="Toggle debug log"
              className="btn-r2 bg-gray-800 hover:bg-gray-700 border border-white/10 text-gray-400 hover:text-white px-2 py-1 rounded text-[10px] font-mono"
            >
              LOG
            </button>
          </div>
        </div>
      </header>

      {/* ── Main 3-column grid ── */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: Camera + Status ── */}
          <div className="space-y-4">
            <VideoFeed ip={ip} />
            <StatusBar status={status} state={state} />
          </div>

          {/* ── Middle: Navigation + Animations ── */}
          <div className="space-y-4">
            {/* Navigation */}
            <div className="r2-card p-4 md:p-6 flex flex-col items-center">
              <div className="r2-section-title w-full text-center">Navigation</div>

              {/* Joystick */}
              <div
                className="mb-6 rounded-full flex items-center justify-center"
                style={{
                  width: 200, height: 200,
                  background: "radial-gradient(circle, #1a202c 0%, #000 100%)",
                  border: "2px solid #005596",
                }}
              >
                <Joystick
                  size={180}
                  onMove={(power, angle) => send(cmd.move(power, angle))}
                  onStop={() => send(cmd.stop())}
                />
              </div>

              {/* Head left / Stop / Head right */}
              <div className="grid grid-cols-3 gap-3 w-full">
                <button
                  disabled={disabled}
                  onMouseDown={() => startHead(-1)}
                  onMouseUp={stopHead}
                  onMouseLeave={stopHead}
                  onTouchStart={() => startHead(-1)}
                  onTouchEnd={stopHead}
                  className="btn-r2 bg-gray-800/60 hover:bg-gray-700 border border-white/10 hover:border-blue-700 rounded-lg p-3 flex flex-col items-center gap-1"
                >
                  <span className="text-lg">↺</span>
                  <span className="text-[10px] text-gray-400">Head L</span>
                </button>

                <button
                  disabled={disabled}
                  onClick={() => send(cmd.mode(MODE.STOP))}
                  className="btn-r2 bg-red-900/60 hover:bg-red-800 border border-red-800/60 rounded-lg p-3 flex flex-col items-center gap-1"
                >
                  <span className="text-lg">■</span>
                  <span className="text-[10px] text-red-300">STOP</span>
                </button>

                <button
                  disabled={disabled}
                  onMouseDown={() => startHead(1)}
                  onMouseUp={stopHead}
                  onMouseLeave={stopHead}
                  onTouchStart={() => startHead(1)}
                  onTouchEnd={stopHead}
                  className="btn-r2 bg-gray-800/60 hover:bg-gray-700 border border-white/10 hover:border-blue-700 rounded-lg p-3 flex flex-col items-center gap-1"
                >
                  <span className="text-lg">↻</span>
                  <span className="text-[10px] text-gray-400">Head R</span>
                </button>
              </div>
            </div>

            {/* Animations */}
            <ControlPanel send={send} state={state} disabled={disabled} />
          </div>

          {/* ── Right: Sounds + Hardware ── */}
          <div className="space-y-4">
            <SoundPicker send={send} disabled={disabled} />

            {/* Hardware */}
            <div className="r2-card p-4">
              <div className="r2-section-title">Hardware</div>
              <div className="space-y-2">
                <button disabled={disabled} onClick={() => send(cmd.mode(MODE.PROJECTOR_1))}
                  className={`btn-r2 w-full border rounded p-2 text-[10px] text-left flex items-center gap-2
                    ${state.projector ? "bg-indigo-800/60 border-indigo-500 text-white" : "bg-indigo-900/30 border-white/10 hover:bg-indigo-900/60 hover:border-indigo-600"}`}>
                  <span>📽️</span> Projector Video 1
                </button>
                <button disabled={disabled} onClick={() => send(cmd.mode(MODE.PROJECTOR_2))}
                  className={`btn-r2 w-full border rounded p-2 text-[10px] text-left flex items-center gap-2
                    ${state.projector ? "bg-indigo-800/60 border-indigo-500 text-white" : "bg-indigo-900/30 border-white/10 hover:bg-indigo-900/60 hover:border-indigo-600"}`}>
                  <span>📽️</span> Projector Video 2
                </button>
                <button disabled={disabled} onClick={() => send(cmd.mode(MODE.FRONT_LED))}
                  className="btn-r2 w-full bg-gray-800/60 hover:bg-gray-700 border border-white/10 rounded p-2 text-[10px] text-left flex items-center gap-2">
                  <span>💡</span> Front LED
                </button>
                <button disabled={disabled} onClick={() => send(cmd.mode(MODE.BACK_LED))}
                  className="btn-r2 w-full bg-gray-800/60 hover:bg-gray-700 border border-white/10 rounded p-2 text-[10px] text-left flex items-center gap-2">
                  <span>💡</span> Back LED
                </button>
                <button disabled={disabled} onClick={() => send(cmd.mode(MODE.LCD_SHORT))}
                  className={`btn-r2 w-full border rounded p-2 text-[10px] text-left flex items-center gap-2
                    ${state.lcd_s ? "bg-cyan-800/60 border-cyan-500 text-white" : "bg-gray-800/60 border-white/10 hover:bg-gray-700"}`}>
                  <span>🖥️</span> LCD Short {state.lcd_s ? "(ON)" : ""}
                </button>
                <button disabled={disabled} onClick={() => send(cmd.mode(MODE.LCD_LONG))}
                  className={`btn-r2 w-full border rounded p-2 text-[10px] text-left flex items-center gap-2
                    ${state.lcd_l ? "bg-cyan-800/60 border-cyan-500 text-white" : "bg-gray-800/60 border-white/10 hover:bg-gray-700"}`}>
                  <span>🖥️</span> LCD Long {state.lcd_l ? "(ON)" : ""}
                </button>
              </div>
            </div>

            {/* Settings */}
            <div className="r2-card p-4">
              <div className="r2-section-title">Settings</div>
              <div className="space-y-2">
                {([
                  { label: "Mute", icon: state.mute ? "🔇" : "🔊", active: !!state.mute, action: () => send(cmd.setMute(!state.mute)) },
                  { label: "Face Detection", icon: "👤", active: !!state.face_detection, action: () => send(cmd.setFaceDetection(!state.face_detection)) },
                  { label: "Voice Recognition", icon: "🎙️", active: !!state.voice_recognition, action: () => send(cmd.setVoiceRecognition(!state.voice_recognition)) },
                ] as const).map((s) => (
                  <button key={s.label} disabled={disabled} onClick={s.action}
                    className={`btn-r2 w-full border rounded p-2 text-[10px] text-left flex items-center justify-between
                      ${s.active ? "bg-blue-800/60 border-blue-500 text-white" : "bg-gray-800/60 border-white/10 hover:bg-gray-700"}`}>
                    <span className="flex items-center gap-2"><span>{s.icon}</span> {s.label}</span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${s.active ? "bg-blue-500/30 text-blue-300" : "bg-gray-700/50 text-gray-500"}`}>
                      {s.active ? "ON" : "OFF"}
                    </span>
                  </button>
                ))}

                <div className="border-t border-white/10 my-2" />

                <button disabled={disabled} onClick={() => setShowWifi(true)}
                  className="btn-r2 w-full bg-gray-800/60 hover:bg-gray-700 border border-white/10 rounded p-2 text-[10px] text-left flex items-center gap-2">
                  <span>📶</span> WiFi Management
                </button>

                <button disabled={disabled} onClick={() => setShowDevices(true)}
                  className="btn-r2 w-full bg-gray-800/60 hover:bg-gray-700 border border-white/10 rounded p-2 text-[10px] text-left flex items-center gap-2">
                  <span>📱</span> Device Management
                </button>

                <button disabled={disabled} onClick={() => {
                  if (confirm("Shut down R2-D2? You will need to physically power it back on.")) {
                    send(cmd.shutdown())
                    handleDisconnect()
                  }
                }}
                  className="btn-r2 w-full bg-red-900/40 hover:bg-red-800 border border-red-800/50 rounded p-2 text-[10px] text-left flex items-center gap-2 text-red-300">
                  <span>⚡</span> Shutdown Robot
                </button>
              </div>
            </div>
          </div>

        </div>
      </main>

      <footer className="text-center text-[10px] text-gray-700 uppercase tracking-tighter py-8">
        Astromech Control Interface v1.1
      </footer>

      {/* ── Debug Log Panel ── */}
      {showLogs && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#0b0e14]/95 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-mono">
              Debug Log ({logs.length})
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setLogs([])}
                className="text-[10px] text-gray-500 hover:text-red-400 font-mono px-2"
              >
                CLEAR
              </button>
              <button
                onClick={() => setShowLogs(false)}
                className="text-[10px] text-gray-500 hover:text-white font-mono px-2"
              >
                CLOSE
              </button>
            </div>
          </div>
          <div
            className="max-w-7xl mx-auto px-4 pb-3 overflow-y-auto font-mono text-[11px] leading-5"
            style={{ height: 200 }}
            ref={(el) => {
              logsEndRef.current = el
              if (el) el.scrollTop = el.scrollHeight
            }}
          >
            {logs.length === 0 ? (
              <span className="text-gray-600">No log entries yet.</span>
            ) : (
              logs.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.includes("Auth success") ? "text-green-400" :
                    line.includes("error") || line.includes("rejected") || line.includes("Error") ? "text-red-400" :
                    line.includes("closed") || line.includes("stale") ? "text-yellow-400" :
                    "text-gray-400"
                  }
                >
                  {line}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      <WifiManager
        open={showWifi}
        onClose={() => setShowWifi(false)}
        currentSSID={state.ssid}
        sendRequest={sendRequest}
      />

      <DeviceManager
        open={showDevices}
        onClose={() => setShowDevices(false)}
        currentUUID={uuid}
        robotName={robotName ?? state.name}
        sendRequest={sendRequest}
      />

      <ConnectionDialog
        open={showConnect}
        onClose={() => setShowConnect(false)}
        onConnect={handleConnect}
        onManualConnect={handleManualConnect}
        onAPPaired={handleAPPaired}
      />
    </div>
  )
}
