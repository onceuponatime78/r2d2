import { useCallback, useEffect, useRef, useState } from "react"
import { cmd, MODE, type RobotState } from "@/lib/protocol"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

interface UseRobotOptions {
  ip: string | null
  uuid: string | null
  deviceName?: string
  onLog?: (msg: string) => void
}

interface UseRobotReturn {
  status: ConnectionStatus
  state: Partial<RobotState>
  send: (message: string) => void
  /** Send a command and wait for a matching response (by cmd name). */
  sendRequest: (message: string, timeoutMs?: number) => Promise<Record<string, unknown> | null>
  /** Connect using an optional override IP (falls back to `ip` prop). */
  connect: (overrideIp?: string, overrideUuid?: string) => void
  disconnect: () => void
}

const RECONNECT_DELAY_MS = 1000
const HEARTBEAT_INTERVAL_MS = 3000
const MODE_DEBOUNCE_MS = 500

export function useRobot({ ip, uuid, deviceName = "R2D2-WebUI", onLog }: UseRobotOptions): UseRobotReturn {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected")
  const [state, setState] = useState<Partial<RobotState>>({})
  const wsRef = useRef<WebSocket | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref to track whether the user deliberately disconnected (suppresses auto-reconnect)
  const intentionalRef = useRef<boolean>(false)
  // Use a ref for status so closures inside connect() always see current value
  const statusRef = useRef<ConnectionStatus>("disconnected")
  // Stable refs for ip/uuid so the reconnect closure always has the latest values
  const ipRef = useRef(ip)
  const uuidRef = useRef(uuid)
  ipRef.current = ip
  uuidRef.current = uuid
  // Stable ref for onLog so closures always call the latest version
  const onLogRef = useRef(onLog)
  onLogRef.current = onLog
  // Debounce tracking for mode/sound commands
  const lastModeSendRef = useRef<number>(0)
  // Pending request-response callbacks keyed by cmd name
  const pendingRef = useRef<Map<string, (data: Record<string, unknown>) => void>>(new Map())

  const log = (msg: string, level: "info" | "warn" = "info") => {
    const ts = new Date().toISOString().slice(11, 23) // HH:MM:SS.mmm
    const line = `[${ts}] ${msg}`
    if (level === "warn") console.warn(line); else console.log(line)
    onLogRef.current?.(line)
  }

  const updateStatus = (s: ConnectionStatus) => {
    statusRef.current = s
    setStatus(s)
  }

  const stopHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
  }

  const stopReconnect = () => {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current)
      reconnectRef.current = null
    }
  }

  const send = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Parse once for logging, debounce, and user_control prefix
      let parsed: { cmd?: string; mode?: number; power?: number; angle?: number; sound_id?: number } | null = null
      try { parsed = JSON.parse(message.trim()) } catch { /* non-JSON */ }

      const c = parsed?.cmd
      // Debounce mode and play_sound commands to avoid overwhelming the robot
      if (c === "mode" || c === "play_sound") {
        const now = Date.now()
        if (now - lastModeSendRef.current < MODE_DEBOUNCE_MS) {
          log(`>>> ${c} debounced`, "warn")
          return
        }
        lastModeSendRef.current = now
      }

      // Log outbound commands (skip noisy heartbeat messages)
      if (parsed && c !== "user_control" && !(c === "move" && parsed.power === 0 && parsed.angle === 0)) {
        log(`>>> ${c}${parsed.mode != null ? ` mode=${parsed.mode}` : ""}${parsed.power != null ? ` pow=${parsed.power} ang=${parsed.angle}` : ""}`)
      }
      // Send user_control(true) before non-heartbeat commands
      if (parsed && c !== "user_control" && c !== "move") {
        wsRef.current.send(cmd.userControl(true))
      }
      wsRef.current.send(message)
    } else {
      log("send() dropped — socket not open", "warn")
    }
  }, [])

  const sendRequest = useCallback((message: string, timeoutMs = 10000): Promise<Record<string, unknown> | null> => {
    return new Promise((resolve) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        log("sendRequest() dropped — socket not open", "warn")
        resolve(null)
        return
      }
      // Parse cmd name to register pending callback
      try {
        const parsed = JSON.parse(message.trim())
        const cmdName = parsed.cmd as string
        log(`>>> request: ${cmdName} (timeout ${timeoutMs / 1000}s)`)
        const timer = setTimeout(() => {
          pendingRef.current.delete(cmdName)
          resolve(null)
        }, timeoutMs)
        pendingRef.current.set(cmdName, (data) => {
          clearTimeout(timer)
          pendingRef.current.delete(cmdName)
          resolve(data)
        })
      } catch {
        resolve(null)
        return
      }
      // Send user_control prefix for non-heartbeat commands
      wsRef.current.send(cmd.userControl(true))
      wsRef.current.send(message)
    })
  }, [])

  const connectNow = useCallback((targetIp: string, targetUuid: string) => {
    stopHeartbeat()
    stopReconnect()
    // Clear ref BEFORE closing so the old socket's onclose sees wsRef !== itself
    // and skips scheduling a phantom reconnect that would clobber the new socket.
    const oldWs = wsRef.current
    wsRef.current = null
    oldWs?.close()

    updateStatus("connecting")
    log(`Connecting to ws://${targetIp}:8887`)

    const ws = new WebSocket(`ws://${targetIp}:8887`)
    wsRef.current = ws

    ws.onopen = () => {
      log("WebSocket open, sending grantAccess")
      ws.send(cmd.grantAccess(targetUuid, deviceName))
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string)
        log(`message: ${data.cmd} ${data.resultCode ?? ""}`)

        // Check for pending request-response callbacks
        const pending = pendingRef.current.get(data.cmd as string)
        if (pending && data.cmd !== "gin") {
          pending(data as Record<string, unknown>)
          // Don't return — still process auth/state updates below
        }

        const authSuccess = () => {
          log("Auth success — connected")
          updateStatus("connected")
          setState(data.robot ?? {})
          ws.send(cmd.mode(MODE.STOP))
          ws.send(cmd.stop())
          stopHeartbeat()
          heartbeatRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(cmd.userControl(true))
              ws.send(cmd.stop())
            }
          }, HEARTBEAT_INTERVAL_MS)
        }

        if (data.cmd === "grantAccess" && data.resultCode === 0) {
          // Guard: only auth if this is still the active socket AND not already connected
          if (ws === wsRef.current && statusRef.current !== "connected") authSuccess()
        } else if (data.resultCode === 401) {
          log("Auth rejected (401) — will not reconnect", "warn")
          intentionalRef.current = true
          updateStatus("error")
          ws.close()
        } else if (data.cmd === "streaming" && data.resultCode === 421) {
          log("Video streaming conflict (421) — another client has the video feed", "warn")
        } else if (data.cmd === "gin" && data.robot) {
          // Robot sends gin (state update) — if we're still connecting (or if this is
          // the active socket and status got corrupted by a race), treat as auth success.
          if (ws === wsRef.current && statusRef.current !== "connected") {
            log("Auth via gin — connected")
            authSuccess()
          } else if (statusRef.current === "connected") {
            // Suppress autonomous patrol mode
            if (data.robot.mode === MODE.PATROL) {
              log("Robot entered patrol autonomously — cancelling")
              ws.send(cmd.mode(MODE.STOP))
            }
            setState(prev => ({ ...prev, ...data.robot }))
          }
        }
      } catch {
        // ignore non-JSON
      }
    }

    ws.onerror = (e) => {
      log(`WebSocket error: ${e}`, "warn")
      updateStatus("error")
    }

    ws.onclose = (e) => {
      // Ignore close events from replaced sockets (e.g. when connectNow opens a new one)
      if (wsRef.current !== ws && wsRef.current !== null) {
        log("Ignoring onclose from stale socket")
        return
      }
      log(`WebSocket closed — code=${e.code} wasClean=${e.wasClean} intentional=${intentionalRef.current}`)
      stopHeartbeat()

      if (statusRef.current !== "disconnected") {
        updateStatus("disconnected")
      }

      // Auto-reconnect unless user deliberately disconnected or auth was rejected
      if (!intentionalRef.current && ipRef.current && uuidRef.current) {
        log(`Scheduling reconnect in ${RECONNECT_DELAY_MS}ms`)
        reconnectRef.current = setTimeout(() => {
          if (!intentionalRef.current && ipRef.current && uuidRef.current) {
            connectNow(ipRef.current, uuidRef.current)
          }
        }, RECONNECT_DELAY_MS)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceName])

  const connect = useCallback((overrideIp?: string, overrideUuid?: string) => {
    const targetIp = overrideIp ?? ip
    const targetUuid = overrideUuid ?? uuid
    if (!targetIp || !targetUuid) return
    intentionalRef.current = false
    connectNow(targetIp, targetUuid)
  }, [ip, uuid, connectNow])

  const disconnect = useCallback(() => {
    console.log("[useRobot] User disconnected")
    intentionalRef.current = true
    stopHeartbeat()
    stopReconnect()
    wsRef.current?.close()
    wsRef.current = null
    updateStatus("disconnected")
    setState({})
  }, [])

  // Cleanup on unmount only — explicit connect() calls handle all connection initiation.
  // We do NOT auto-connect on ip/uuid change to avoid double-connect races with
  // the direct connect(ip) calls in handleConnect / handleManualConnect.
  useEffect(() => {
    return () => {
      stopHeartbeat()
      stopReconnect()
      wsRef.current?.close()
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { status, state, send, sendRequest, connect, disconnect }
}
