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
  const url = `${supabaseUrl}/functions/v1/send-push`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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

// ✅ Create in-app notification row (matches your notifications table)
async function createInAppNotification(payload: {
  user_id: string
  type: 'withdrawal'
  title: string
  message: string
  data?: Record<string, any>
}) {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: payload.user_id,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      data: payload.data ?? {},
      is_read: false,
    })

    if (error) throw error
  } catch (e) {
    console.warn('notifications insert failed (non-blocking):', e)
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const body = await req.json().catch(() => ({}))

  const status = body?.status as string | undefined
  const reject_reason = (body?.reject_reason as string | undefined)?.trim()

  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing withdrawal ID' }), {
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

  // ✅ Step 1: Fetch withdrawal details (need user_id, amount)
  const { data: withdrawal, error: wErr } = await supabase
    .from('withdrawals')
    .select('id, user_id, amount, status, created_at')
    .eq('id', id)
    .single()

  if (wErr || !withdrawal) {
    console.error('Withdrawal not found:', wErr)
    return new Response(JSON.stringify({ error: 'Withdrawal not found' }), {
      status: 404,
    })
  }

  // ✅ Step 2: Update withdrawal status (+ reject_reason if rejected)
  const updatePayload: Record<string, any> = { status: normalizedStatus }
  if (normalizedStatus === 'rejected' && reject_reason) {
    updatePayload.reject_reason = reject_reason
  }

  const { error: updateError } = await supabase
    .from('withdrawals')
    .update(updatePayload)
    .eq('id', id)

  if (updateError) {
    console.error('Error updating withdrawal:', updateError)
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 500,
    })
  }

  // ✅ Step 3: If approved, deduct user balance
  if (normalizedStatus === 'approved') {
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', withdrawal.user_id)
      .single()

    if (pErr || !profile) {
      console.error('User profile not found:', pErr)
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 404,
      })
    }

    const newBalance =
      Number(profile.balance || 0) - Number(withdrawal.amount || 0)

    const { error: balanceError } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', withdrawal.user_id)

    if (balanceError) {
      console.error('Error updating user balance:', balanceError)
      return new Response(JSON.stringify({ error: balanceError.message }), {
        status: 500,
      })
    }
  }

  // ✅ Step 4: Notification + Push
  const title =
    normalizedStatus === 'approved'
      ? '✅ Withdrawal Approved'
      : normalizedStatus === 'rejected'
      ? '❌ Withdrawal Rejected'
      : '🔄 Withdrawal Updated'

  const message =
    normalizedStatus === 'approved'
      ? `Your withdrawal of ₦${Number(
          withdrawal.amount || 0
        ).toLocaleString()} has been approved.`
      : normalizedStatus === 'rejected'
      ? `Your withdrawal of ₦${Number(
          withdrawal.amount || 0
        ).toLocaleString()} was declined.${
          reject_reason ? ` Reason: ${reject_reason}` : ''
        }`
      : `Your withdrawal status is now ${normalizedStatus}.`

  const dataForNotification = {
    entity: 'withdrawal',
    id: withdrawal.id,
    status: normalizedStatus,
    amount: withdrawal.amount,
    ...(reject_reason ? { reject_reason } : {}),
  }

  await createInAppNotification({
    user_id: withdrawal.user_id,
    type: 'withdrawal',
    title,
    message,
    data: dataForNotification,
  })

  try {
    await sendPushToUser({
      user_id: withdrawal.user_id,
      title,
      body: message,
      data: dataForNotification,
    })
  } catch (e) {
    console.warn('Push failed but withdrawal update succeeded:', e)
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: `Withdrawal ${normalizedStatus} successfully ✅`,
      withdrawalId: id,
      newStatus: normalizedStatus,
    }),
    { status: 200 }
  )
}

export const revalidate = 0
export const dynamic = 'force-dynamic'
