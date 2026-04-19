import { cmd } from "@/lib/protocol"

interface Props {
  send: (msg: string) => void
  disabled: boolean
}

// Real sound names from the R2-D2 protocol
const SOUNDS: { id: number; label: string }[] = [
  { id: 0,  label: "Pulling it Together" },
  { id: 1,  label: "Sing Song Response" },
  { id: 2,  label: "Abrupt Thrill" },
  { id: 3,  label: "Alarm Thrill" },
  { id: 4,  label: "Building Freak Out" },
  { id: 5,  label: "Curt Reply" },
  { id: 6,  label: "Danger Danger" },
  { id: 7,  label: "Happiness Confirmation" },
  { id: 8,  label: "Happy Three Chirp" },
  { id: 9,  label: "Lonely Hello" },
  { id: 10, label: "Lonely Singing" },
  { id: 11, label: "Nagging Whine" },
  { id: 12, label: "Short Raspberry" },
  { id: 13, label: "Startled Three Tone" },
  { id: 14, label: "Startled Whoop" },
  { id: 15, label: "Stifled Laugh" },
  { id: 16, label: "Uncertain Two Tone" },
  { id: 17, label: "Unconvinced Grumbling" },
  { id: 18, label: "Upset Two Tone" },
]

export function SoundPicker({ send, disabled }: Props) {
  const play = (id: number) => { if (!disabled) send(cmd.playSound(id)) }

  return (
    <div className="r2-card p-4">
      <div className="r2-section-title">Sounds</div>
      <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
        {SOUNDS.map(({ id, label }) => (
          <button
            key={id}
            disabled={disabled}
            onClick={() => play(id)}
            className="btn-r2 bg-gray-800/60 hover:bg-gray-700 border border-white/8 hover:border-white/20 text-gray-300 hover:text-white rounded p-2 text-left text-[10px]"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
