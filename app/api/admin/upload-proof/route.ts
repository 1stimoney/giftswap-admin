/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const userId = form.get('user_id') as string | null

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const ext = file.name.split('.').pop() || 'jpg'
    const path = `proofs/${userId ?? 'unknown'}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`

    const { error: upErr } = await supabaseAdmin.storage
      .from('admin-proofs')
      .upload(path, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      })

    if (upErr) throw upErr

    const { data } = supabaseAdmin.storage
      .from('admin-proofs')
      .getPublicUrl(path)

    return NextResponse.json({ url: data.publicUrl })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    )
  }
}
