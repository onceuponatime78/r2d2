import { useEffect, useRef, useCallback } from "react"

interface JoystickProps {
  onMove: (power: number, angle: number) => void
  onStop: () => void
  size?: number
}

export function Joystick({ onMove, onStop, size = 160 }: JoystickProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(false)
  const stickPosRef = useRef({ x: 0, y: 0 })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const centerRef = useRef({ x: size / 2, y: size / 2 })

  const radius = size / 2 - 8
  const stickRadius = size / 6

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const cx = centerRef.current.x
    const cy = centerRef.current.y

    ctx.clearRect(0, 0, size, size)

    // outer ring
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.strokeStyle = "rgba(255,255,255,0.15)"
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = "rgba(255,255,255,0.04)"
    ctx.fill()

    // crosshairs
    ctx.strokeStyle = "rgba(255,255,255,0.08)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx - radius, cy)
    ctx.lineTo(cx + radius, cy)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx, cy - radius)
    ctx.lineTo(cx, cy + radius)
    ctx.stroke()

    // stick
    const sx = cx + stickPosRef.current.x
    const sy = cy + stickPosRef.current.y
    const gradient = ctx.createRadialGradient(sx - stickRadius * 0.3, sy - stickRadius * 0.3, 0, sx, sy, stickRadius)
    gradient.addColorStop(0, "rgba(100,180,255,0.95)")
    gradient.addColorStop(1, "rgba(30,100,200,0.85)")
    ctx.beginPath()
    ctx.arc(sx, sy, stickRadius, 0, Math.PI * 2)
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.strokeStyle = "rgba(150,200,255,0.6)"
    ctx.lineWidth = 1.5
    ctx.stroke()
  }, [size, radius, stickRadius])

  const getPos = (e: React.TouchEvent | React.MouseEvent | TouchEvent | MouseEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    let clientX: number, clientY: number
    if ("touches" in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = (e as MouseEvent).clientX
      clientY = (e as MouseEvent).clientY
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  const sendCurrent = useCallback(() => {
    const dx = stickPosRef.current.x
    const dy = stickPosRef.current.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 5) { onStop(); return }
    const power = Math.min(100, Math.round((dist / radius) * 100))
    // angle: 0=fwd (up), 90=right, -90=left, 180=back
    const angleDeg = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI)
    onMove(power, angleDeg)
  }, [onMove, onStop, radius])

  const startSendLoop = useCallback(() => {
    if (intervalRef.current) return
    intervalRef.current = setInterval(() => {
      if (!activeRef.current) return
      sendCurrent()
    }, 50)
  }, [sendCurrent])

  const stopSendLoop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const handleStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    activeRef.current = true
    startSendLoop()
  }, [startSendLoop])

  const handleMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!activeRef.current) return
    e.preventDefault()
    const pos = getPos(e)
    const cx = centerRef.current.x
    const cy = centerRef.current.y
    let dx = pos.x - cx
    let dy = pos.y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > radius) {
      dx = (dx / dist) * radius
      dy = (dy / dist) * radius
    }
    stickPosRef.current = { x: dx, y: dy }
    draw()
    sendCurrent() // send immediately on every move
  }, [draw, radius, sendCurrent])

  const handleEnd = useCallback(() => {
    activeRef.current = false
    stickPosRef.current = { x: 0, y: 0 }
    stopSendLoop()
    onStop()
    draw()
  }, [draw, onStop, stopSendLoop])

  // global mouse/touch up to catch releases outside canvas
  useEffect(() => {
    const up = () => { if (activeRef.current) handleEnd() }
    window.addEventListener("mouseup", up)
    window.addEventListener("touchend", up)
    return () => {
      window.removeEventListener("mouseup", up)
      window.removeEventListener("touchend", up)
      stopSendLoop()
    }
  }, [handleEnd, stopSendLoop])

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="touch-none cursor-pointer select-none"
      style={{ width: size, height: size }}
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
    />
  )
}
