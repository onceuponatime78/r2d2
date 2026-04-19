import { useEffect, useRef, useState } from "react"
import type { DiscoveredRobot } from "@/lib/protocol"
import { cmd } from "@/lib/protocol"
import { useDiscovery } from "@/hooks/useDiscovery"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Radio, Wifi } from "lucide-react"
import * as robots from "@/lib/robots"

const AP_IP = "192.168.43.1"

interface ConnectionDialogProps {
  open: boolean
  onClose?: () => void
  onConnect: (robot: DiscoveredRobot) => void
  onManualConnect: (ip: string) => void
  onAPPaired?: (robotIp: string, pairedUuid: string) => void
}

export function ConnectionDialog({ open, onClose, onConnect, onManualConnect, onAPPaired }: ConnectionDialogProps) {
  const { robots: discoveredRobots, scanning, startPolling, stopPolling } = useDiscovery()
  const [manualIp, setManualIp] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const [showAPMode, setShowAPMode] = useState(false)
  const [apStatus, setApStatus] = useState<"idle" | "pairing" | "success" | "error">("idle")
  const [apMessage, setApMessage] = useState("")
  const apWsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (open) startPolling()
    else {
      stopPolling()
      // Reset AP mode state when dialog closes
      setShowAPMode(false)
      setApStatus("idle")
      setApMessage("")
      apWsRef.current?.close()
      apWsRef.current = null
    }
  }, [open, startPolling, stopPolling])

  // Check if a discovered robot is already paired
  const isPaired = (robot: DiscoveredRobot) => robots.getPairedUuid(robot.uuid) !== null

  const startAPPairing = () => {
    setApStatus("pairing")
    setApMessage("Connecting to robot AP...")

    const pairedUuid = crypto.randomUUID()
    const ws = new WebSocket(`ws://${AP_IP}:8887`)
    apWsRef.current = ws

    const timeout = setTimeout(() => {
      ws.close()
      setApStatus("error")
      setApMessage("Connection timed out. Make sure you are connected to the R2D2-XXX WiFi network.")
    }, 15000)

    ws.onopen = () => {
      setApMessage("Connected! Sending pairing request...")
      ws.send(cmd.grantAccess(pairedUuid, "R2D2-WebUI"))
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string)
        if ((data.cmd === "grantAccess" && data.resultCode === 0) || data.cmd === "gin") {
          clearTimeout(timeout)
          setApStatus("success")
          setApMessage("Pairing successful! Playing confirmation sound...")

          // Play happiness confirmation sound
          ws.send(cmd.userControl(true))
          ws.send(cmd.playSound(7))

          // Close AP websocket after a short delay
          setTimeout(() => {
            ws.close()
            apWsRef.current = null
            onAPPaired?.(AP_IP, pairedUuid)
          }, 2000)
        } else if (data.resultCode === 401) {
          clearTimeout(timeout)
          setApStatus("error")
          setApMessage("Pairing rejected by robot. Try power cycling the robot and entering AP mode again.")
          ws.close()
        }
      } catch {
        // ignore non-JSON
      }
    }

    ws.onerror = () => {
      clearTimeout(timeout)
      setApStatus("error")
      setApMessage("Connection failed. Make sure you are connected to the R2D2-XXX WiFi network and try again.")
    }

    ws.onclose = () => {
      clearTimeout(timeout)
      apWsRef.current = null
      if (apStatus === "pairing") {
        setApStatus("error")
        setApMessage("Connection lost. Make sure you are connected to the R2D2-XXX WiFi network.")
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.() }}>
      <DialogContent className="sm:max-w-md bg-[#141820] border border-white/10 text-gray-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-orbitron text-white">
            <Radio className="h-5 w-5 text-blue-400" />
            R2-D2 <span className="text-blue-400">ASTROMECH</span>
          </DialogTitle>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Select unit to establish uplink</p>
        </DialogHeader>

        <div className="space-y-4 font-mono">
          {/* Discovered robots */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Detected on network</span>
              {scanning && <Loader2 className="h-3 w-3 animate-spin text-blue-400" />}
            </div>
            <div className="space-y-2 min-h-[60px]">
              {discoveredRobots.length === 0 ? (
                <div className="text-xs text-gray-600 text-center py-4 border border-dashed border-white/10 rounded">
                  {scanning ? "Scanning..." : "No units found"}
                </div>
              ) : (
                discoveredRobots.map((robot) => {
                  const paired = isPaired(robot)
                  return (
                    <button
                      key={robot.uuid}
                      onClick={() => onConnect(robot)}
                      className="w-full flex items-center justify-between p-3 rounded border border-white/10 hover:border-blue-600 hover:bg-blue-900/20 transition-colors text-left"
                    >
                      <div>
                        <div className="text-sm font-bold text-white">{robot.name}</div>
                        <div className="text-[10px] text-gray-500">{robot.ip}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {paired && (
                          <span className="text-[10px] border border-green-600/50 text-green-400 px-1.5 py-0.5 rounded">PAIRED</span>
                        )}
                        {robot.ap_mode && (
                          <span className="text-[10px] border border-yellow-600/50 text-yellow-500 px-1.5 py-0.5 rounded">AP</span>
                        )}
                        <Wifi className="h-4 w-4 text-green-400" />
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Manual IP */}
          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wider">Manual IP</span>
            <div className="flex gap-2 mt-2">
              <input
                ref={inputRef}
                type="text"
                placeholder="192.168.x.x"
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && manualIp && onManualConnect(manualIp)}
                className="flex-1 rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => manualIp && onManualConnect(manualIp)}
                disabled={!manualIp}
                className="btn-r2 bg-blue-700 hover:bg-blue-600 disabled:opacity-30 text-white px-4 py-2 rounded text-xs font-bold"
              >
                Connect
              </button>
            </div>
          </div>

          {/* AP Mode Pairing */}
          <div className="border-t border-white/10 pt-3">
            {!showAPMode ? (
              <button
                onClick={() => setShowAPMode(true)}
                className="btn-r2 w-full bg-yellow-900/30 hover:bg-yellow-900/50 border border-yellow-700/50 text-yellow-400 py-2 rounded text-xs font-bold"
              >
                Pair New Robot (AP Mode)
              </button>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-gray-500 uppercase tracking-wider">AP Mode Pairing</div>

                <div className="text-[10px] text-gray-400 space-y-1.5 p-3 bg-gray-900/60 rounded border border-white/10">
                  <div className="text-yellow-400 font-bold mb-2">Instructions:</div>
                  <div>1. Press <span className="text-white font-bold">button 5</span> on the robot (yellow LED turns on)</div>
                  <div>2. Connect this device to the <span className="text-white font-bold">R2D2-XXX</span> WiFi network</div>
                  <div>3. Click <span className="text-white font-bold">Pair</span> below</div>
                  <div>4. After pairing, use <span className="text-white font-bold">WiFi Management</span> to send your home WiFi credentials</div>
                </div>

                {apStatus === "idle" && (
                  <div className="flex gap-2">
                    <button
                      onClick={startAPPairing}
                      className="btn-r2 flex-1 bg-yellow-600 hover:bg-yellow-500 text-white py-2 rounded text-xs font-bold"
                    >
                      Pair
                    </button>
                    <button
                      onClick={() => setShowAPMode(false)}
                      className="btn-r2 bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {apStatus === "pairing" && (
                  <div className="flex items-center gap-2 text-[10px] text-yellow-400 p-2 bg-yellow-900/20 rounded">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {apMessage}
                  </div>
                )}

                {apStatus === "success" && (
                  <div className="text-[10px] p-2 rounded bg-green-900/30 text-green-400">
                    {apMessage}
                  </div>
                )}

                {apStatus === "error" && (
                  <div className="space-y-2">
                    <div className="text-[10px] p-2 rounded bg-red-900/30 text-red-400">
                      {apMessage}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setApStatus("idle"); setApMessage("") }}
                        className="btn-r2 flex-1 bg-yellow-600 hover:bg-yellow-500 text-white py-1.5 rounded text-[10px] font-bold"
                      >
                        Try Again
                      </button>
                      <button
                        onClick={() => { setShowAPMode(false); setApStatus("idle"); setApMessage("") }}
                        className="btn-r2 bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded text-[10px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
