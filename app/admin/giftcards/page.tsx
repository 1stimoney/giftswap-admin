/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import GiftCardModal from '@/components/admin/GiftCardModal'
import { supabase } from '@/lib/supabaseClient'
import { Search, Plus, Pencil, Trash2, CreditCard } from 'lucide-react'

interface GiftCard {
  id: string
  name: string
  // New columns
  physical_rate?: number | null
  ecode_rate?: number | null

  // Backward compat (old column)
  rate?: number | null

  image_url?: string | null
  created_at?: string
  updated_at?: string
}

type FilterTab = 'all' | 'physical' | 'ecode'

function formatRate(n?: number | null) {
  const v = Number(n ?? 0)
  return `₦${v.toLocaleString()}/$`
}

function getPhysicalRate(c: GiftCard) {
  // prefer new column; fallback to old `rate`
  return c.physical_rate ?? c.rate ?? 0
}

function getEcodeRate(c: GiftCard) {
  // prefer new column; fallback to old `rate`
  return c.ecode_rate ?? c.rate ?? 0
}

export default function GiftCardsAdminPage() {
  const [cards, setCards] = useState<GiftCard[]>([])
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<GiftCard | null>(null)

  const [q, setQ] = useState('')
  const [tab, setTab] = useState<FilterTab>('all')

  const fetchCards = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/giftcards', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load gift cards')
      const data = await res.json()
      setCards(Array.isArray(data) ? data : [])
    } catch (err: any) {
      console.error(err)
      toast.error('Failed to load gift cards')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCards()

    const channel = supabase
      .channel('giftcards-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gift_cards' },
        (payload) => {
          fetchCards()
          if (payload.eventType === 'INSERT') {
            toast(
              `🆕 Gift card added: ${(payload.new as any)?.name ?? 'New card'}`
            )
          } else if (payload.eventType === 'UPDATE') {
            toast(
              `✏️ Gift card updated: ${
                (payload.new as any)?.name ?? 'Updated card'
              }`
            )
          } else if (payload.eventType === 'DELETE') {
            toast(`🗑️ Gift card deleted`)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const openAdd = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (card: GiftCard) => {
    setEditing(card)
    setModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this gift card?')) return
    try {
      const res = await fetch(`/api/admin/giftcards/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success('Gift card deleted')
      fetchCards()
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete gift card')
    }
  }

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()

    let list = [...cards]

    if (query) {
      list = list.filter((c) => (c.name ?? '').toLowerCase().includes(query))
    }

    if (tab === 'physical') {
      list = list.filter((c) => getPhysicalRate(c) > 0)
    }

    if (tab === 'ecode') {
      list = list.filter((c) => getEcodeRate(c) > 0)
    }

    // newest first if created_at exists
    list.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return tb - ta
    })

    return list
  }, [cards, q, tab])

  return (
    <div className='min-h-screen bg-gradient-to-b from-slate-50 to-white'>
      <div className='max-w-6xl mx-auto py-10 px-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6'>
          <div>
            <div className='flex items-center gap-2'>
              <div className='h-10 w-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center'>
                <CreditCard className='h-5 w-5' />
              </div>
              <h1 className='text-3xl font-extrabold tracking-tight text-slate-900'>
                Gift Cards
              </h1>
            </div>
            <p className='text-sm text-slate-500 mt-1'>
              Manage card catalog + physical & e-code rates
            </p>
          </div>

          <Button onClick={openAdd} className='h-11 rounded-xl px-4'>
            <Plus className='h-4 w-4 mr-2' />
            Add New Card
          </Button>
        </div>

        {/* Controls */}
        <Card className='rounded-2xl border-slate-200 shadow-sm'>
          <CardContent className='p-4 sm:p-5'>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <div className='relative w-full sm:max-w-sm'>
                <Search className='h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2' />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder='Search gift cards…'
                  className='pl-10 h-11 rounded-xl'
                />
              </div>

              <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
                <TabsList className='rounded-xl'>
                  <TabsTrigger value='all' className='rounded-lg'>
                    All
                    <Badge variant='secondary' className='ml-2'>
                      {cards.length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value='physical' className='rounded-lg'>
                    Physical
                  </TabsTrigger>
                  <TabsTrigger value='ecode' className='rounded-lg'>
                    E-code
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {/* Content */}
        <div className='mt-6'>
          {loading ? (
            <p className='text-center text-slate-500 py-10'>Loading…</p>
          ) : filtered.length === 0 ? (
            <div className='text-center text-slate-500 py-14'>
              <p className='text-lg font-semibold text-slate-700'>
                No gift cards found
              </p>
              <p className='text-sm mt-1'>
                Try a different search or add a new card.
              </p>
            </div>
          ) : (
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'>
              {filtered.map((c) => {
                const physical = getPhysicalRate(c)
                const ecode = getEcodeRate(c)
                const showBoth = physical !== ecode

                return (
                  <Card
                    key={c.id}
                    className='rounded-2xl border-slate-200 shadow-sm hover:shadow-md transition overflow-hidden'
                  >
                    {/* Image */}
                    <div className='h-40 w-full bg-slate-50 flex items-center justify-center'>
                      {c.image_url ? (
                        <img
                          src={c.image_url}
                          alt={c.name}
                          className='h-full w-full object-contain p-4'
                        />
                      ) : (
                        <div className='text-slate-400 text-sm'>No image</div>
                      )}
                    </div>

                    <CardContent className='p-5'>
                      <div className='flex items-start justify-between gap-3'>
                        <div>
                          <h3 className='text-lg font-extrabold text-slate-900 leading-snug'>
                            {c.name}
                          </h3>
                          <div className='flex flex-wrap gap-2 mt-2'>
                            <Badge className='rounded-full' variant='secondary'>
                              Physical: {formatRate(physical)}
                            </Badge>
                            <Badge className='rounded-full' variant='secondary'>
                              E-code: {formatRate(ecode)}
                            </Badge>
                            {showBoth ? (
                              <Badge className='rounded-full' variant='default'>
                                Different rates
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className='flex gap-2 mt-5'>
                        <Button
                          onClick={() => openEdit(c)}
                          variant='secondary'
                          className='flex-1 h-11 rounded-xl'
                        >
                          <Pencil className='h-4 w-4 mr-2' />
                          Edit
                        </Button>

                        <Button
                          onClick={() => handleDelete(c.id)}
                          variant='destructive'
                          className='flex-1 h-11 rounded-xl'
                        >
                          <Trash2 className='h-4 w-4 mr-2' />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* Modal (Add/Edit) */}
        <GiftCardModal
          open={modalOpen}
          onOpenChange={(v) => {
            setModalOpen(v)
            if (!v) setEditing(null)
            if (!v) fetchCards()
          }}
          initialData={editing}
        />
      </div>
    </div>
  )
}
