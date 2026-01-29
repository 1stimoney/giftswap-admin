import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const { status, reason, proof_images } = body as {
    status: 'approved' | 'rejected' | 'pending'
    reason?: string
    proof_images?: string[]
  }

  try {
    // 1) Fetch trade (we need user_id + card_name)
    const { data: trade, error: tErr } = await supabaseAdmin
      .from('trades')
      .select('id,user_id,card_name,amount_usd,total,status')
      .eq('id', id)
      .single()

    if (tErr) throw tErr

    // 2) Update trade status
    const { error: upErr } = await supabaseAdmin
      .from('trades')
      .update({ status })
      .eq('id', id)

    if (upErr) throw upErr

    // 3) Insert notification row
    const title =
      status === 'approved'
        ? '✅ Trade Approved'
        : status === 'rejected'
        ? '❌ Trade Rejected'
        : 'ℹ️ Trade Updated'

    const message =
      status === 'approved'
        ? `Your trade for ${trade.card_name} was approved.`
        : status === 'rejected'
        ? `Your trade for ${trade.card_name} was rejected.`
        : `Your trade for ${trade.card_name} was updated.`

    const notifData = {
      trade_id: trade.id,
      status,
      reason: reason ?? null,
      proof_images: Array.isArray(proof_images) ? proof_images : [],
      amount_usd: trade.amount_usd,
      total: trade.total,
      card_name: trade.card_name,
    }

    const { error: nErr } = await supabaseAdmin.from('notifications').insert({
      user_id: trade.user_id,
      type: 'trade',
      title,
      message,
      data: notifData,
      is_read: false,
    })

    if (nErr) throw nErr

    // 4) Send push (calls your Edge Function send-push)
    await supabaseAdmin.functions.invoke('send-push', {
      body: {
        user_id: trade.user_id,
        title,
        body:
          status === 'rejected' && reason
            ? `${message} Reason: ${reason}`
            : message,
        data: { type: 'trade', ...notifData },
      },
    })

    return NextResponse.json({ ok: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    )
  }
}
