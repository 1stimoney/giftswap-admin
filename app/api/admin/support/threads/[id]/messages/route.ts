/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseSever'

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  const { data, error } = await supabase
    .from('support_messages')
    .select('*')
    .eq('thread_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  try {
    const body = await req.json()
    const message = (body?.message || '').trim()

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // Insert admin message
    const { data, error } = await supabase
      .from('support_messages')
      .insert({
        thread_id: id,
        sender: 'admin',
        message,
        image_urls: null,
      })
      .select()
      .single()

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })

    // bump thread updated_at (optional but helps sorting)
    await supabase
      .from('support_threads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json(data, { status: 201 })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Bad request' },
      { status: 400 }
    )
  }
}
