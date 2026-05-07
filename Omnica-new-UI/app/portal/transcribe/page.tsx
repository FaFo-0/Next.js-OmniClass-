"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@/components/shared/icons"

export default function TranscribePage() {
  const router = useRouter()
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`

  return (
    <div className="fixed inset-0 bg-[#0F172A] text-white flex flex-col z-50">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div><div className="text-lg font-semibold">Business English: Meetings</div><div className="text-sm text-white/60">Alex Johnson</div></div>
        <div className="flex items-center gap-4">
          <span className="text-2xl font-mono font-bold">{formatTime(elapsed)}</span>
          <button onClick={() => router.back()} className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-[var(--omnic-red)] hover:bg-[var(--omnic-red-hover)]">Stop & Save</button>
        </div>
      </div>
      <div className="flex items-center gap-3 px-6 py-2 border-b border-white/10">
        <span className="flex items-center gap-1.5 text-xs"><span className="h-2 w-2 rounded-full bg-green-500" /> Mic: On</span>
        <span className="flex items-center gap-1.5 text-xs"><span className="h-2 w-2 rounded-full bg-green-500" /> Tab Audio: On</span>
      </div>
      <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center text-white/40">
        <div className="text-center"><Icon name="mic" size={32} className="mx-auto mb-3 opacity-50" /><p>Listening...</p></div>
      </div>
    </div>
  )
}
