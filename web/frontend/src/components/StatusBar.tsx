import type { RobotState } from "@/lib/protocol"
import type { ConnectionStatus } from "@/hooks/useRobot"

interface StatusPanelProps {
  status: ConnectionStatus
  state: Partial<RobotState>
}

const MODE_NAMES: Record<number, string> = {
  0: "IDLE", 1: "WALK", 2: "TURN AROUND", 3: "TURN LEFT", 4: "TURN RIGHT",
  5: "FORWARD", 6: "LIGHTSABER", 9: "PATROL", 10: "DANCE",
  12: "WALK CIRCLE", 13: "FRONT LED", 14: "BACK LED", 15: "SHAKE HEAD",
  16: "ARM", 17: "LCD SHORT", 18: "LCD LONG", 19: "PROJECTOR 1", 20: "PROJECTOR 2",
}

function Led({ on }: { on: boolean }) {
  return <span className={`status-led ${on ? "led-on" : "led-off"}`} />
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400">{label}</span>
      <span className={`font-medium ${color ?? "text-gray-100"}`}>{value}</span>
    </div>
  )
}

export function StatusBar({ status, state }: StatusPanelProps) {
  const battery = state.battery
  const statusColor =
    status === "connected" ? "text-green-400" :
    status === "connecting" ? "text-yellow-400" :
    status === "error" ? "text-red-400" : "text-gray-500"

  const hasError = state.error !== undefined && state.error !== "NO ERROR" && state.error !== ""

  return (
    <div className="r2-card p-4 text-xs font-mono space-y-3">
      <div className="r2-section-title">System Status</div>

      <Row label="Connection" value="" />
      <div className={`text-right -mt-5 ${statusColor} uppercase font-bold`}>{status}</div>

      <Row
        label="Battery"
        value={battery !== undefined ? `${battery}%` : "--"}
      />
      {battery !== undefined && (
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden -mt-1">
          <div
            className={`h-full rounded-full transition-all ${battery > 60 ? "bg-green-400" : battery > 30 ? "bg-yellow-400" : "bg-red-400"}`}
            style={{ width: `${battery}%` }}
          />
        </div>
      )}

      {state.charging !== undefined && state.charging > 0 && (
        <Row label="Charging" value="⚡ YES" color="text-yellow-400" />
      )}

      <Row
        label="Mode"
        value={state.mode !== undefined ? (MODE_NAMES[state.mode] ?? `MODE ${state.mode}`) : "--"}
      />
      <Row label="WiFi SSID" value={state.ssid ?? "--"} />
      <Row label="Version" value={state.version !== undefined ? `v${state.version}` : "--"} />

      {hasError && (
        <Row label="Error" value={String(state.error)} color="text-red-400" />
      )}

      {/* LED indicators */}
      <div className="border-t border-white/8 pt-3">
        <div className="text-gray-500 mb-2">Indicators</div>
        <div className="grid grid-cols-2 gap-y-2">
          {[
            { label: "Mute",      on: !!state.mute },
            { label: "Face Det.", on: !!state.face_detection },
            { label: "Voice Rec.", on: !!state.voice_recognition },
            { label: "LCD Short", on: !!state.lcd_s },
            { label: "LCD Long",  on: !!state.lcd_l },
            { label: "Projector", on: !!state.projector },
          ].map(({ label, on }) => (
            <div key={label} className="flex items-center gap-2">
              <Led on={on} />
              <span className={on ? "text-gray-200" : "text-gray-600"}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
