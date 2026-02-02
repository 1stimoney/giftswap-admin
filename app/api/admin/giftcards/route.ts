/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/admin/giftcards/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseSever' // server-side supabase client

export async function GET() {
  const { data, error } = await supabase
    .from('gift_cards')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const name = String(body?.name ?? '').trim()
    const image_url = (body?.image_url ?? null) as string | null

    // Backward compatible: if they still send `rate`, treat it as physical_rate (and ecode_rate if not provided)
    const physical_rate =
      body?.physical_rate !== undefined && body?.physical_rate !== null
        ? Number(body.physical_rate)
        : body?.rate !== undefined && body?.rate !== null
        ? Number(body.rate)
        : 0

    const ecode_rate =
      body?.ecode_rate !== undefined && body?.ecode_rate !== null
        ? Number(body.ecode_rate)
        : body?.rate !== undefined && body?.rate !== null
        ? Number(body.rate)
        : 0

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!Number.isFinite(physical_rate) || physical_rate < 0) {
      return NextResponse.json(
        { error: 'physical_rate must be a valid number' },
        { status: 400 }
      )
    }

    if (!Number.isFinite(ecode_rate) || ecode_rate < 0) {
      return NextResponse.json(
        { error: 'ecode_rate must be a valid number' },
        { status: 400 }
      )
    }

    const insertPayload: Record<string, any> = {
      name,
      image_url,
      physical_rate,
      ecode_rate,
    }

    const { data, error } = await supabase
      .from('gift_cards')
      .insert([insertPayload])
      .select()
      .single()

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data, { status: 201 })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Bad request' },
      { status: 400 }
    )
  }
}
