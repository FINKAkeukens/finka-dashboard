import { NextResponse } from 'next/server'
import { clearUnlocked } from '@/lib/kluis'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  clearUnlocked(res)
  return res
}
