/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, ArrowLeft, Image as ImageIcon, Lock } from 'lucide-react'

type ThreadStatus = 'open' | 'closed'
type Thread = {
  id: string
  user_id: string
  subject: string
  status: ThreadStatus
  created_at: string
  updated_at: string
}

type Msg = {
  id: string
  thread_id: string
  sender: 'user' | 'admin'
  message: string
  image_urls?: string[] | null
  created_at: string
}

export default function AdminSupportThreadPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const threadId = String(params?.id || '')

  const [loading, setLoading] = useState(true)
  const [thread, setThread] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [toggling, setToggling] = useState(false)

  const [preview, setPreview] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const canReply = thread?.status === 'open'

  const fetchThread = async () => {
    const res = await fetch(`/api/admin/support/threads?status=all&q=`, {
      cache: 'no-store',
    })
    const list = await res.json()
    const found = Array.isArray(list)
      ? list.find((t: any) => t.id === threadId)
      : null
    if (found) setThread(found)
  }

  const fetchMessages = async () => {
    const res = await fetch(`/api/admin/support/threads/${threadId}/messages`, {
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    setMessages(Array.isArray(data) ? data : [])
  }

  const load = async () => {
    setLoading(true)
    try {
      await fetchThread()
      await fetchMessages()
      setTimeout(
        () => bottomRef.current?.scrollIntoView({ behavior: 'instant' as any }),
        30
      )
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to load ticket')
      router.push('/admin/support')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!threadId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  const statusBadge = useMemo(() => {
    if (!thread) return null
    return thread.status === 'open' ? (
      <Badge className='bg-green-100 text-green-700 hover:bg-green-100'>
        OPEN
      </Badge>
    ) : (
      <Badge className='bg-slate-100 text-slate-700 hover:bg-slate-100'>
        CLOSED
      </Badge>
    )
  }, [thread])

  const toggleClose = async () => {
    if (!thread) return
    setToggling(true)
    try {
      const next = thread.status === 'open' ? 'closed' : 'open'
      const res = await fetch(`/api/admin/support/threads/${thread.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      setThread(updated)
      toast.success(`Ticket marked ${next}`)
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to update ticket status')
    } finally {
      setToggling(false)
    }
  }

  const send = async () => {
    const msg = text.trim()
    if (!msg) return
    if (!canReply) return toast.error('Ticket is closed')

    setSending(true)
    try {
      const res = await fetch(
        `/api/admin/support/threads/${threadId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg }),
        }
      )
      if (!res.ok) throw new Error(await res.text())

      setText('')
      await fetchMessages()
      setTimeout(
        () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }),
        80
      )
      toast.success('Sent')
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className='min-h-[70vh] flex items-center justify-center'>
        <Loader2 className='h-5 w-5 animate-spin mr-2' />
        <span className='text-muted-foreground'>Loading ticket...</span>
      </div>
    )
  }

  return (
    <div className='mx-auto max-w-5xl p-6'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex items-start gap-3'>
          <Button
            variant='outline'
            onClick={() => router.push('/admin/support')}
          >
            <ArrowLeft className='h-4 w-4 mr-2' />
            Back
          </Button>

          <div>
            <div className='flex items-center gap-2'>
              <h1 className='text-xl font-semibold tracking-tight'>
                {thread?.subject || 'Support Ticket'}
              </h1>
              {statusBadge}
            </div>
            <p className='text-sm text-muted-foreground mt-1'>
              Ticket ID: {threadId}
            </p>
          </div>
        </div>

        <Button
          variant='outline'
          onClick={toggleClose}
          disabled={toggling}
          className='gap-2'
        >
          <Lock className='h-4 w-4' />
          {thread?.status === 'open' ? 'Close' : 'Re-open'}
        </Button>
      </div>

      <Card className='mt-6 shadow-sm'>
        <CardHeader>
          <CardTitle className='text-base'>Conversation</CardTitle>
        </CardHeader>

        <CardContent>
          <div className='space-y-3'>
            {messages.map((m) => {
              const mine = m.sender === 'admin'
              const imgs = m.image_urls || []
              return (
                <div
                  key={m.id}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm border ${
                      mine
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-900 border-slate-200'
                    }`}
                  >
                    {imgs.length ? (
                      <div className='mb-2 flex gap-2 overflow-x-auto'>
                        {imgs.map((url) => (
                          <button
                            key={url}
                            type='button'
                            onClick={() => setPreview(url)}
                            className='h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50'
                            title='Preview'
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt='attachment'
                              className='h-full w-full object-cover'
                            />
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {m.message ? (
                      <div className='whitespace-pre-wrap'>{m.message}</div>
                    ) : null}

                    <div
                      className={`mt-2 text-[11px] ${
                        mine ? 'text-white/70' : 'text-slate-500'
                      }`}
                    >
                      {new Date(m.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          <div className='mt-6 border-t pt-4'>
            <div className='flex items-start gap-3'>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={canReply ? 'Write a reply…' : 'Ticket is closed'}
                disabled={!canReply || sending}
                className='min-h-[90px]'
              />
              <Button
                onClick={send}
                disabled={!canReply || sending || !text.trim()}
                className='bg-blue-600 hover:bg-blue-700'
              >
                {sending ? (
                  <>
                    <Loader2 className='h-4 w-4 animate-spin mr-2' />
                    Sending
                  </>
                ) : (
                  'Send'
                )}
              </Button>
            </div>

            {!canReply ? (
              <div className='mt-3 text-sm text-muted-foreground flex items-center gap-2'>
                <ImageIcon className='h-4 w-4' />
                This ticket is closed — re-open it to reply.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Image Preview */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className='max-w-3xl'>
          <DialogHeader>
            <DialogTitle>Attachment</DialogTitle>
          </DialogHeader>

          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt='preview'
              className='w-full h-auto rounded-lg border'
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
