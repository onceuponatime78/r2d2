import { useState } from "react"
import { cmd } from "@/lib/protocol"
import type { WifiNetwork } from "@/lib/protocol"

interface Props {
  open: boolean
  onClose: () => void
  currentSSID?: string
  sendRequest: (msg: string) => Promise<Record<string, unknown> | null>
}

export function WifiManager({ open, onClose, currentSSID, sendRequest }: Props) {
  const [networks, setNetworks] = useState<WifiNetwork[]>([])
  const [scanning, setScanning] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectSSID, setConnectSSID] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [result, setResult] = useState<string | null>(null)

  const scan = async () => {
    setScanning(true)
    setResult(null)
    const resp = await sendRequest(cmd.getWifiList())
    setScanning(false)
    if (resp && resp.wifi_list) {
      // Deduplicate by SSID, keeping strongest signal
      const map = new Map<string, WifiNetwork>()
      for (const n of resp.wifi_list as WifiNetwork[]) {
        const existing = map.get(n.ssid)
        if (!existing || n.rssi > existing.rssi) map.set(n.ssid, n)
      }
      setNetworks(Array.from(map.values()).sort((a, b) => b.rssi - a.rssi))
    } else {
      setResult("Failed to scan WiFi networks")
    }
  }

  const connect = async () => {
    if (!connectSSID) return
    setConnecting(true)
    setResult(null)
    // The robot will disconnect from the current network to join the new one,
    // so the WebSocket will drop and sendRequest will likely time out.
    // Treat both success and timeout as "command sent".
    const resp = await sendRequest(cmd.connectWifi(connectSSID, password))
    setConnecting(false)
    if (resp && resp.resultCode === 0) {
      setResult(`WiFi command accepted! Robot is switching to ${connectSSID}. You may need to power cycle the robot. Reconnect after it's back online.`)
    } else {
      // Timeout or null response — command was still sent, robot likely switching
      setResult(`WiFi command sent to robot. It will disconnect to join ${connectSSID}. If it doesn't reconnect automatically, power cycle the robot and reconnect.`)
    }
    setConnectSSID(null)
    setPassword("")
  }

  if (!open) return null

  const signalIcon = (rssi: number) =>
    rssi > -50 ? "▰▰▰▰" : rssi > -60 ? "▰▰▰▱" : rssi > -70 ? "▰▰▱▱" : "▰▱▱▱"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0d1117] border border-white/10 rounded-xl w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <h2 className="font-orbitron text-sm font-bold text-white">WiFi Management</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">&times;</button>
        </div>

        <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
          {currentSSID && (
            <div className="text-[10px] text-gray-400">
              Current: <span className="text-blue-400 font-bold">{currentSSID}</span>
            </div>
          )}

          <button
            onClick={scan}
            disabled={scanning}
            className="btn-r2 w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded text-xs font-bold disabled:opacity-50"
          >
            {scanning ? "Scanning..." : "Scan WiFi Networks"}
          </button>

          {networks.length > 0 && (
            <div className="space-y-1">
              {networks.map((n) => (
                <button
                  key={n.ssid}
                  onClick={() => { setConnectSSID(n.ssid); setPassword("") }}
                  className={`w-full flex justify-between items-center p-2 rounded border text-[10px] text-left
                    ${n.ssid === currentSSID
                      ? "bg-green-900/30 border-green-700/50 text-green-300"
                      : connectSSID === n.ssid
                        ? "bg-blue-900/40 border-blue-500 text-white"
                        : "bg-gray-800/60 border-white/10 hover:bg-gray-700 text-gray-300"}`}
                >
                  <span>{n.ssid}</span>
                  <span className="text-gray-500 font-mono text-[9px]">{signalIcon(n.rssi)} {n.rssi}dBm</span>
                </button>
              ))}
            </div>
          )}

          {connectSSID && (
            <div className="space-y-2 p-3 bg-gray-900/60 rounded border border-white/10">
              <div className="text-[10px] text-gray-400">
                Connect to: <span className="text-white font-bold">{connectSSID}</span>
              </div>
              <input
                type="password"
                placeholder="WiFi Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && connect()}
                className="w-full bg-gray-800 border border-white/10 rounded px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-blue-500 outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={connect}
                  disabled={connecting}
                  className="btn-r2 flex-1 bg-blue-600 hover:bg-blue-500 text-white py-1.5 rounded text-[10px] font-bold disabled:opacity-50"
                >
                  {connecting ? "Connecting..." : "Connect"}
                </button>
                <button
                  onClick={() => setConnectSSID(null)}
                  className="btn-r2 bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded text-[10px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className={`text-[10px] p-2 rounded ${result.includes("Failed") ? "bg-red-900/30 text-red-400" : result.includes("accepted") ? "bg-green-900/30 text-green-400" : "bg-yellow-900/30 text-yellow-400"}`}>
              {result}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
