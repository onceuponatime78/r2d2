import { useEffect, useRef } from "react"

export function useVideo(ip: string | null, canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!ip || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let busy = false // drop frames while a decode is in flight

    const ws = new WebSocket(`ws://${ip}:12121`)
    wsRef.current = ws
    ws.binaryType = "arraybuffer"

    ws.onopen = () => {
      ws.send("enter video socket")
    }

    ws.onmessage = (event) => {
      if (typeof event.data === "string") return
      if (busy) return // drop stale frame
      busy = true
      const blob = new Blob([event.data], { type: "image/jpeg" })
      createImageBitmap(blob).then((bitmap) => {
        // Rotate 90° clockwise: swap canvas dims, translate + rotate
        canvas.width = bitmap.height
        canvas.height = bitmap.width
        ctx.save()
        ctx.translate(bitmap.height, 0)
        ctx.rotate(Math.PI / 2)
        ctx.drawImage(bitmap, 0, 0)
        ctx.restore()
        bitmap.close()
      }).catch(() => {}).finally(() => { busy = false })
    }

    ws.onerror = () => {}
    ws.onclose = () => {}

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [ip, canvasRef])
}
