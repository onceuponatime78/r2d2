import { useRef, useState, useCallback } from "react"
import { useVideo } from "@/hooks/useVideo"

interface VideoFeedProps {
  ip: string | null
}

export function VideoFeed({ ip }: VideoFeedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useVideo(ip, canvasRef)

  const [recording, setRecording] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const takeSnapshot = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const url = canvas.toDataURL("image/jpeg", 0.95)
    const a = document.createElement("a")
    a.href = url
    a.download = `r2d2_snapshot_${Date.now()}.jpg`
    a.click()
  }, [])

  const toggleRecording = useCallback(() => {
    if (recording && recorderRef.current) {
      recorderRef.current.stop()
      setRecording(false)
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    const stream = canvas.captureStream(15) // 15 fps
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm"
    const recorder = new MediaRecorder(stream, { mimeType })
    chunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `r2d2_recording_${Date.now()}.webm`
      a.click()
      URL.revokeObjectURL(url)
      recorderRef.current = null
    }

    recorder.start(1000) // collect data every 1s
    recorderRef.current = recorder
    setRecording(true)
  }, [recording])

  return (
    <div className="r2-card overflow-hidden">
      <div className="r2-section-title px-4 pt-4">Live Feed</div>
      <div className={`relative flex justify-center bg-black aspect-square overflow-hidden ${recording ? "ring-2 ring-red-500/70" : ""}`}>
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain"
          style={{ display: ip ? "block" : "none" }}
        />
        {!ip && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-700 text-xs italic">
            Waiting for video stream…
          </div>
        )}

        {/* Capture controls overlay */}
        {ip && (
          <div className="absolute bottom-2 right-2 flex gap-1.5">
            <button
              onClick={takeSnapshot}
              title="Take snapshot"
              className="bg-black/60 hover:bg-black/80 border border-white/20 hover:border-white/40 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm backdrop-blur-sm"
            >
              📷
            </button>
            <button
              onClick={toggleRecording}
              title={recording ? "Stop recording" : "Start recording"}
              className={`border rounded-full w-8 h-8 flex items-center justify-center text-sm backdrop-blur-sm
                ${recording
                  ? "bg-red-600/80 hover:bg-red-700 border-red-400 animate-pulse"
                  : "bg-black/60 hover:bg-black/80 border-white/20 hover:border-white/40 text-white"
                }`}
            >
              {recording ? "⏹" : "⏺"}
            </button>
          </div>
        )}

        {/* Recording indicator */}
        {recording && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-600/80 backdrop-blur-sm rounded px-2 py-0.5">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-[10px] text-white font-bold">REC</span>
          </div>
        )}
      </div>
    </div>
  )
}
