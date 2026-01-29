/* eslint-disable @typescript-eslint/no-explicit-any */
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
    const { data: w, error: wErr } = await supabaseAdmin
      .from('withdrawals')
      .select('id,user_id,amount,status')
      .eq('id', id)
      .single()

    if (wErr) throw wErr

    const { error: upErr } = await supabaseAdmin
      .from('withdrawals')
      .update({ status })
      .eq('id', id)

    if (upErr) throw upErr

    const title =
      status === 'approved'
        ? '✅ Withdrawal Approved'
        : status === 'rejected'
        ? '❌ Withdrawal Rejected'
        : 'ℹ️ Withdrawal Updated'

    const message =
      status === 'approved'
        ? `Your withdrawal of ₦${Number(
            w.amount
          ).toLocaleString()} was approved.`
        : status === 'rejected'
        ? `Your withdrawal of ₦${Number(
            w.amount
          ).toLocaleString()} was rejected.`
        : `Your withdrawal was updated.`

    const notifData = {
      withdrawal_id: w.id,
      status,
      amount: w.amount,
      reason: reason ?? null,
      proof_images: Array.isArray(proof_images) ? proof_images : [],
    }

    const { error: nErr } = await supabaseAdmin.from('notifications').insert({
      user_id: w.user_id,
      type: 'withdrawal',
      title,
      message,
      data: notifData,
      is_read: false,
    })
    if (nErr) throw nErr

    await supabaseAdmin.functions.invoke('send-push', {
      body: {
        user_id: w.user_id,
        title,
        body:
          status === 'rejected' && reason
            ? `${message} Reason: ${reason}`
            : message,
        data: { type: 'withdrawal', ...notifData },
      },
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    )
  }
}
