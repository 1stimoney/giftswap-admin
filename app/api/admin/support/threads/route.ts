/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseSever'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') // 'open' | 'closed' | null
    const q = (searchParams.get('q') || '').trim()

    let query = supabase
      .from('support_threads')
      .select('*')
      .order('updated_at', { ascending: false })

    if (status && (status === 'open' || status === 'closed')) {
      query = query.eq('status', status)
    }

    if (q) {
      // basic search on subject (adjust as needed)
      query = query.ilike('subject', `%${q}%`)
    }

    const { data, error } = await query
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data ?? [])
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Bad request' },
      { status: 400 }
    )
  }
}
