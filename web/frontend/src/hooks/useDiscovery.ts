import { useCallback, useEffect, useRef, useState } from "react"
import type { DiscoveredRobot } from "@/lib/protocol"

export function useDiscovery() {
  const [robots, setRobots] = useState<DiscoveredRobot[]>([])
  const [scanning, setScanning] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scan = useCallback(async () => {
    setScanning(true)
    try {
      const res = await fetch("/api/discover")
      if (res.ok) {
        const data = await res.json()
        setRobots(data)
      }
    } catch {
      // backend not reachable
    } finally {
      setScanning(false)
    }
  }, [])

  const startPolling = useCallback(() => {
    scan()
    timerRef.current = setInterval(scan, 3000)
  }, [scan])

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  return { robots, scanning, scan, startPolling, stopPolling }
}
