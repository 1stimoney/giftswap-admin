/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseSever'

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  try {
    const body = await req.json()
    const status = body?.status

    if (status !== 'open' && status !== 'closed') {
      return NextResponse.json(
        { error: 'Invalid status. Use "open" or "closed".' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('support_threads')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Bad request' },
      { status: 400 }
    )
  }
}
