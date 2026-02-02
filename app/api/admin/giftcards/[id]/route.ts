/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/admin/giftcards/[id]/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseSever'

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  try {
    const body = await req.json()

    const updatePayload: Record<string, any> = {}

    // Only set fields if present (prevents overwriting with undefined)
    if (body?.name !== undefined) updatePayload.name = String(body.name).trim()
    if (body?.image_url !== undefined) updatePayload.image_url = body.image_url

    // Rates (backward compatible with `rate`)
    // If they send `rate` only, update both rates with that rate
    const hasPhysical = body?.physical_rate !== undefined
    const hasEcode = body?.ecode_rate !== undefined
    const hasOldRate = body?.rate !== undefined

    if (hasPhysical) updatePayload.physical_rate = Number(body.physical_rate)
    if (hasEcode) updatePayload.ecode_rate = Number(body.ecode_rate)

    if (!hasPhysical && !hasEcode && hasOldRate) {
      const r = Number(body.rate)
      updatePayload.physical_rate = r
      updatePayload.ecode_rate = r
    }

    // Validate if provided
    if (
      updatePayload.physical_rate !== undefined &&
      (!Number.isFinite(updatePayload.physical_rate) ||
        updatePayload.physical_rate < 0)
    ) {
      return NextResponse.json(
        { error: 'physical_rate must be a valid number' },
        { status: 400 }
      )
    }

    if (
      updatePayload.ecode_rate !== undefined &&
      (!Number.isFinite(updatePayload.ecode_rate) ||
        updatePayload.ecode_rate < 0)
    ) {
      return NextResponse.json(
        { error: 'ecode_rate must be a valid number' },
        { status: 400 }
      )
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('gift_cards')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Bad request' },
      { status: 400 }
    )
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  const { error } = await supabase.from('gift_cards').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
