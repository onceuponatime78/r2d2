import { useState, useEffect, useRef } from "react"
import { cmd } from "@/lib/protocol"
import type { PairedClient } from "@/lib/protocol"

const REQUEST_TIMEOUT_MS = 45000

interface Props {
  open: boolean
  onClose: () => void
  currentUUID?: string | null
  robotName?: string | null
  sendRequest: (msg: string, timeoutMs?: number) => Promise<Record<string, unknown> | null>
}

export function DeviceManager({ open, onClose, currentUUID, robotName, sendRequest }: Props) {
  const [clients, setClients] = useState<PairedClient[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Elapsed timer while loading
  useEffect(() => {
    if (loading) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [loading])

  const fetchClients = async () => {
    setLoading(true)
    setResult(null)
    const resp = await sendRequest(cmd.getPairedList(), REQUEST_TIMEOUT_MS)
    setLoading(false)
    if (resp && resp.clients) {
      setClients(resp.clients as PairedClient[])
    } else {
      setResult("Failed to fetch paired devices")
    }
  }

  const unpairOne = async (uuid: string, name: string) => {
    if (!confirm(`Unpair "${name}" (${uuid.slice(0, 8)}…)?`)) return
    setResult(null)
    const resp = await sendRequest(cmd.unpair(uuid), REQUEST_TIMEOUT_MS)
    if (resp && resp.resultCode === 0) {
      setResult(`Unpaired ${name}`)
      setClients(prev => prev.filter(c => c.uuid !== uuid))
    } else {
      setResult(`Failed to unpair ${name}`)
    }
  }

  const unpairAll = async () => {
    if (!confirm("Unpair ALL devices? You will need to re-pair to control the robot.")) return
    setResult(null)
    const resp = await sendRequest(cmd.unpair(null), REQUEST_TIMEOUT_MS)
    if (resp && resp.resultCode === 0) {
      setResult("All devices unpaired")
      setClients([])
    } else {
      setResult("Failed to unpair all")
    }
  }

  const rename = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    setRenaming(true)
    setResult(null)
    const resp = await sendRequest(cmd.changeName(trimmed), REQUEST_TIMEOUT_MS)
    setRenaming(false)
    if (resp && resp.resultCode === 0) {
      setResult(`Renamed robot to "${trimmed}"`)
      setNewName("")
    } else {
      setResult("Failed to rename robot")
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0d1117] border border-white/10 rounded-xl w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <h2 className="font-orbitron text-sm font-bold text-white">Device Management</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">&times;</button>
        </div>

        <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
          {/* Rename Robot */}
          <div className="space-y-2 p-3 bg-gray-900/60 rounded border border-white/10">
            <div className="text-[10px] text-gray-400">
              Robot name: <span className="text-blue-400 font-bold">{robotName ?? "Unknown"}</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="New robot name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && rename()}
                className="flex-1 bg-gray-800 border border-white/10 rounded px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-blue-500 outline-none"
              />
              <button
                onClick={rename}
                disabled={renaming || !newName.trim()}
                className="btn-r2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-[10px] font-bold disabled:opacity-50"
              >
                {renaming ? "..." : "Rename"}
              </button>
            </div>
          </div>

          {/* Paired Devices */}
          <button
            onClick={fetchClients}
            disabled={loading}
            className="btn-r2 w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded text-xs font-bold disabled:opacity-50"
          >
            {loading ? `Loading... ${elapsed}s` : "Load Paired Devices"}
          </button>
          {loading && (
            <div className="text-[9px] text-gray-500 text-center">
              The robot can take up to 45 seconds to respond
            </div>
          )}

          {clients.length > 0 && (
            <div className="space-y-1">
              {clients.map((c) => (
                <div
                  key={c.uuid}
                  className={`flex justify-between items-center p-2 rounded border text-[10px]
                    ${c.uuid === currentUUID
                      ? "bg-green-900/30 border-green-700/50 text-green-300"
                      : "bg-gray-800/60 border-white/10 text-gray-300"}`}
                >
                  <div>
                    <div className="font-bold">{c.device_name}</div>
                    <div className="text-[9px] text-gray-500 font-mono">{c.uuid.slice(0, 16)}…</div>
                    {c.uuid === currentUUID && <div className="text-[9px] text-green-400">(this device)</div>}
                  </div>
                  <button
                    onClick={() => unpairOne(c.uuid, c.device_name)}
                    className="btn-r2 bg-red-900/60 hover:bg-red-800 text-red-300 px-2 py-1 rounded text-[9px] border border-red-800/50"
                  >
                    Unpair
                  </button>
                </div>
              ))}

              <button
                onClick={unpairAll}
                className="btn-r2 w-full bg-red-900/40 hover:bg-red-800 text-red-300 py-1.5 rounded text-[10px] font-bold border border-red-800/50 mt-2"
              >
                Unpair All Devices
              </button>
            </div>
          )}

          {result && (
            <div className={`text-[10px] p-2 rounded ${result.includes("Failed") ? "bg-red-900/30 text-red-400" : "bg-green-900/30 text-green-400"}`}>
              {result}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
