import { cmd, MODE } from "@/lib/protocol"
import type { RobotState } from "@/lib/protocol"

interface Props {
  send: (msg: string) => void
  state: Partial<RobotState>
  disabled: boolean
}

interface ActionBtn {
  label: string
  emoji: string
  mode: number
  active?: boolean
  color?: string
}

export function ControlPanel({ send, state, disabled }: Props) {
  const fire = (msg: string) => { if (!disabled) send(msg) }

  const actions: ActionBtn[] = [
    { label: "Dance",       emoji: "🕺", mode: MODE.DANCE },
    { label: "Patrol",      emoji: "🛡️",  mode: MODE.PATROL },
    { label: "Shake Head",  emoji: "🤝", mode: MODE.SHAKE_HEAD },
    { label: "Turn Around", emoji: "🔄", mode: MODE.TURN_AROUND },
    { label: "Walk Circle", emoji: "⭕", mode: MODE.WALK_CIRCLE },
    { label: "Arm",         emoji: "🦾", mode: MODE.ARM_TOGGLE,  active: !!state.arm },
    { label: "Lightsaber",  emoji: "⚔️",  mode: MODE.LIGHTSABER, active: !!state.lightsaber, color: "text-green-400" },
  ]

  return (
    <div className="r2-card p-4">
      <div className="r2-section-title">Animations</div>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            disabled={disabled}
            onClick={() => fire(cmd.mode(a.mode))}
            className={`btn-r2 flex items-center gap-2 p-2 rounded border text-left
              ${a.active
                ? "bg-blue-800/60 border-blue-500 text-white"
                : "bg-blue-900/25 border-white/10 text-gray-300 hover:bg-blue-900/50 hover:border-blue-700"
              }`}
          >
            <span>{a.emoji}</span>
            <span className={`text-[10px] ${a.active && a.color ? a.color : ""}`}>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
