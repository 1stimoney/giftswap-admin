/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
  type: 'trade'
  title: string
  message: string
  data?: Record<string, any>
}) {
  // If anything goes wrong, we don't block the trade update
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
  context: { params: Promise<{ id: string }> },
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
      { status: 400 },
    )
  }

  // ✅ Step 1: Fetch trade details (need user_id, total, card_name etc.)
  const { data: trade, error: tradeError } = await supabase
    .from('trades')
    .select(
      'id, user_id, total, status, card_name, amount_usd, rate, created_at',
    )
    .eq('id', id)
    .single()

  if (tradeError || !trade) {
    console.error('Trade not found:', tradeError)
    return new Response(JSON.stringify({ error: 'Trade not found' }), {
      status: 404,
    })
  }

  // ✅ Step 2: Build trade update payload
  const tradeUpdate: Record<string, any> = { status: normalizedStatus }

  // Only attach these fields when rejecting
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

  // ✅ Step 3: If approved, update balances + referral rewards
  if (normalizedStatus === 'approved') {
    // Prevent double-crediting already approved trades
    if (String(trade.status).toLowerCase() === 'approved') {
      return new Response(
        JSON.stringify({
          error: 'Trade already approved',
        }),
        { status: 400 },
      )
    }

    // Get trader profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(
        `
      id,
      balance,
      referred_by,
      referral_reward_paid
    `,
      )
      .eq('id', trade.user_id)
      .single()

    if (profileError || !profile) {
      console.error('User profile not found:', profileError)

      return new Response(
        JSON.stringify({
          error: 'User profile not found',
        }),
        { status: 404 },
      )
    }

    // ✅ Credit trader balance
    const newBalance = Number(profile.balance || 0) + Number(trade.total || 0)

    const { error: balanceError } = await supabase
      .from('profiles')
      .update({
        balance: newBalance,
      })
      .eq('id', trade.user_id)

    if (balanceError) {
      console.error('Error updating user balance:', balanceError)

      return new Response(
        JSON.stringify({
          error: balanceError.message,
        }),
        { status: 500 },
      )
    }

    // =====================================================
    // ✅ REFERRAL REWARD LOGIC
    // =====================================================

    const qualifiesForReferral = Number(trade.amount_usd || 0) >= 100

    const rewardAlreadyPaid = profile.referral_reward_paid === true

    const hasReferrer = !!profile.referred_by

    if (qualifiesForReferral && hasReferrer && !rewardAlreadyPaid) {
      // Get referrer profile
      const { data: referrer, error: referrerError } = await supabase
        .from('profiles')
        .select('id, balance')
        .eq('id', profile.referred_by)
        .single()

      if (!referrerError && referrer) {
        const referrerNewBalance = Number(referrer.balance || 0) + 5000

        // ✅ Give referrer ₦5000
        await supabase
          .from('profiles')
          .update({
            balance: referrerNewBalance,
          })
          .eq('id', referrer.id)

        // ✅ Mark reward as paid
        await supabase
          .from('profiles')
          .update({
            referral_reward_paid: true,
          })
          .eq('id', trade.user_id)

        // ✅ Notify referrer
        await createInAppNotification({
          user_id: referrer.id,
          type: 'trade',
          title: '🎉 Referral Reward',
          message:
            'You earned ₦5,000 because your referral completed a successful trade over $100.',
          data: {
            entity: 'referral_reward',
            referred_user: trade.user_id,
            reward: 5000,
          },
        })

        // Push notification
        try {
          await sendPushToUser({
            user_id: referrer.id,
            title: '🎉 Referral Reward',
            body: 'You earned ₦5,000 from your referral.',
            data: {
              reward: 5000,
            },
          })
        } catch (e) {
          console.warn('Referral push failed:', e)
        }
      }
    }
  }
  // ✅ Step 4: Build notification payload
  const title =
    normalizedStatus === 'approved'
      ? '✅ Trade Approved'
      : normalizedStatus === 'rejected'
        ? '❌ Trade Rejected'
        : '🔄 Trade Updated'

  const message =
    normalizedStatus === 'approved'
      ? `Your ${trade.card_name} trade was approved. ₦${Number(
          trade.total || 0,
        ).toLocaleString()} has been added to your balance.`
      : normalizedStatus === 'rejected'
        ? `Your ${trade.card_name} trade was rejected.${
            reason ? ` Reason: ${reason}` : ''
          }`
        : `Your trade status is now ${normalizedStatus}.`

  // ✅ THIS is what your app needs to fetch full details
  // Store the trade id inside notifications.data
  const dataForNotification = {
    entity: 'trade',
    id: trade.id,

    // Optional helpful fields (lets UI show instantly even before extra fetch)
    status: normalizedStatus,
    card_name: trade.card_name,
    amount_usd: trade.amount_usd,
    rate: trade.rate,
    total: trade.total,

    // Rejection extras
    ...(reason ? { reason } : {}),
    ...(Array.isArray(proof_images) ? { proof_images } : {}),
  }

  // ✅ In-app notifications table insert
  await createInAppNotification({
    user_id: trade.user_id,
    type: 'trade',
    title,
    message,
    data: dataForNotification,
  })

  // ✅ Push notification (non-blocking)
  try {
    await sendPushToUser({
      user_id: trade.user_id,
      title,
      body: message,
      data: dataForNotification,
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
    { status: 200 },
  )
}

export const revalidate = 0
export const dynamic = 'force-dynamic'
