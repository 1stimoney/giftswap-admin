/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper: call Edge Function (send push)
async function sendPushToUser(args: {
  user_id: string
  title: string
  body: string
  data?: Record<string, any>
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Supabase Functions endpoint:
  // https://<project-ref>.supabase.co/functions/v1/<function-name>
  const url = `${supabaseUrl}/functions/v1/send-push`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // both are commonly required
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
    },
    body: JSON.stringify(args),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('send-push failed:', json)
    throw new Error(json?.error || 'Failed to send push notification')
  }

  return json
}

// (Optional) create in-app notification row
async function createInAppNotification(payload: {
  user_id: string
  title: string
  body: string
  type: 'trade'
  meta?: Record<string, any>
}) {
  // If you don't have this table yet, this will fail.
  // We catch it so the trade update still succeeds.
  try {
    await supabase.from('notifications').insert({
      user_id: payload.user_id,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      meta: payload.meta ?? {},
      is_read: false,
    })
  } catch (e) {
    console.warn(
      'notifications insert skipped (table/columns may not exist):',
      e
    )
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  const body = await req.json().catch(() => ({}))
  const status = body?.status as string | undefined
  const reason = (body?.reason as string | undefined)?.trim()
  const proof_images = body?.proof_images as string[] | undefined

  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing trade ID' }), {
      status: 400,
    })
  }

  if (!status) {
    return new Response(JSON.stringify({ error: 'Missing status' }), {
      status: 400,
    })
  }

  const normalizedStatus = String(status).toLowerCase()
  const allowed = ['pending', 'approved', 'rejected']
  if (!allowed.includes(normalizedStatus)) {
    return new Response(
      JSON.stringify({ error: `Invalid status. Use: ${allowed.join(', ')}` }),
      { status: 400 }
    )
  }

  // ✅ Step 1: Fetch trade details (need user_id, total, card_name)
  const { data: trade, error: tradeError } = await supabase
    .from('trades')
    .select('id, user_id, total, status, card_name, amount_usd')
    .eq('id', id)
    .single()

  if (tradeError || !trade) {
    console.error('Trade not found:', tradeError)
    return new Response(JSON.stringify({ error: 'Trade not found' }), {
      status: 404,
    })
  }

  // ✅ Step 2: Build trade update payload (reason + proofs only when rejected)
  const tradeUpdate: Record<string, any> = { status: normalizedStatus }

  if (normalizedStatus === 'rejected') {
    if (reason) tradeUpdate.reject_reason = reason
    if (Array.isArray(proof_images)) tradeUpdate.proof_images = proof_images
  }

  const { error: updateError } = await supabase
    .from('trades')
    .update(tradeUpdate)
    .eq('id', id)

  if (updateError) {
    console.error('Error updating trade status:', updateError)
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 500,
    })
  }

  // ✅ Step 3: If approved, update user balance
  if (normalizedStatus === 'approved') {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', trade.user_id)
      .single()

    if (profileError || !profile) {
      console.error('User profile not found:', profileError)
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 404,
      })
    }

    const newBalance = (profile.balance || 0) + (trade.total || 0)

    const { error: balanceError } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', trade.user_id)

    if (balanceError) {
      console.error('Error updating user balance:', balanceError)
      return new Response(JSON.stringify({ error: balanceError.message }), {
        status: 500,
      })
    }
  }

  // ✅ Step 4: Create in-app notification + send push
  const title =
    normalizedStatus === 'approved'
      ? '✅ Trade Approved'
      : normalizedStatus === 'rejected'
      ? '❌ Trade Rejected'
      : '🔄 Trade Updated'

  const message =
    normalizedStatus === 'approved'
      ? `Your ${trade.card_name} trade was approved. ₦${Number(
          trade.total || 0
        ).toLocaleString()} has been added to your balance.`
      : normalizedStatus === 'rejected'
      ? `Your ${trade.card_name} trade was rejected.${
          reason ? ` Reason: ${reason}` : ''
        }`
      : `Your trade status is now ${normalizedStatus}.`

  const meta = {
    kind: 'trade',
    trade_id: trade.id,
    status: normalizedStatus,
    card_name: trade.card_name,
    total: trade.total,
    amount_usd: trade.amount_usd,
    ...(reason ? { reason } : {}),
    ...(Array.isArray(proof_images) ? { proof_images } : {}),
  }

  // In-app notification (safe try)
  await createInAppNotification({
    user_id: trade.user_id,
    title,
    body: message,
    type: 'trade',
    meta,
  })

  // Push (don’t fail the request if push fails)
  try {
    await sendPushToUser({
      user_id: trade.user_id,
      title,
      body: message,
      data: meta,
    })
  } catch (e) {
    console.warn('Push failed but trade update succeeded:', e)
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: `Trade ${normalizedStatus} successfully ✅`,
      tradeId: id,
      newStatus: normalizedStatus,
    }),
    { status: 200 }
  )
}

export const revalidate = 0
export const dynamic = 'force-dynamic'
