/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import { Loader2, Search, Image as ImageIcon, X } from 'lucide-react'

interface Trade {
  id: string
  user_id: string
  user_name: string
  user_email: string
  card_name: string
  rate: number
  amount_usd: number
  total: number
  image_url?: string
  image_urls?: string[] | string
  status: string
  created_at: string

  // optional fields we’ll start sending
  reason?: string | null
  proof_images?: string[] | string | null
}

type StatusTab = 'all' | 'pending' | 'approved' | 'rejected'

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<StatusTab>('all')
  const [query, setQuery] = useState('')

  // Reject modal state
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectTrade, setRejectTrade] = useState<Trade | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [proofFiles, setProofFiles] = useState<File[]>([])
  const [submittingReject, setSubmittingReject] = useState(false)

  // ✅ Fetch trades from API
  const fetchTrades = async () => {
    try {
      const res = await fetch('/api/trades', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch trades')

      const data = await res.json()
      setTrades(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      console.error(err)
      setError('Failed to load trades')
    } finally {
      setLoading(false)
    }
  }

  // ✅ Upload proof images (multiple) to Supabase Storage
  // Bucket name: trade-proofs (change if yours differs)
  const uploadProofImages = async (trade: Trade, files: File[]) => {
    const urls: string[] = []
    if (!files.length) return urls

    for (const file of files) {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `admin-proofs/${trade.id}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('trade-images')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'image/jpeg',
        })

      if (uploadErr) throw uploadErr

      const {
        data: { publicUrl },
      } = supabase.storage.from('trade-images').getPublicUrl(path)

      urls.push(publicUrl)
    }

    return urls
  }

  // ✅ Update trade status (+ optional reason/proofs)
  const updateTradeStatus = async (
    tradeId: string,
    newStatus: string,
    extra?: { reason?: string; proof_images?: string[] }
  ) => {
    try {
      const res = await fetch(`/api/trades/${tradeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          ...(extra?.reason ? { reason: extra.reason } : {}),
          ...(extra?.proof_images?.length
            ? { proof_images: extra.proof_images }
            : {}),
        }),
      })

      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        console.error('Failed to update trade', txt)
        toast.error('Failed to update trade status')
        return false
      }

      toast.success(`✅ Trade marked as ${newStatus}`)
      setTrades((prev) =>
        prev.map((t) =>
          t.id === tradeId
            ? {
                ...t,
                status: newStatus,
                reason: extra?.reason ?? t.reason,
                proof_images: extra?.proof_images ?? t.proof_images,
              }
            : t
        )
      )
      return true
    } catch (err) {
      console.error(err)
      toast.error('An error occurred while updating trade status')
      return false
    }
  }

  // ✅ Parse image URLs
  const parseImageUrls = (trade: Trade): string[] => {
    try {
      if (Array.isArray(trade.image_urls)) return trade.image_urls
      if (typeof trade.image_urls === 'string') {
        const parsed = JSON.parse(trade.image_urls)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {
      // ignore
    }
    return trade.image_url ? [trade.image_url] : []
  }

  // ✅ Subscribe to realtime changes
  useEffect(() => {
    fetchTrades()

    const channel = supabase
      .channel('trades-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newTrade = payload.new as Trade
            toast.info(`🆕 New trade from ${newTrade.user_name}`)
            setTrades((prev) => {
              const exists = prev.some((t) => t.id === newTrade.id)
              return exists ? prev : [newTrade, ...prev]
            })
          }

          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Trade
            toast.success(`🔄 Trade updated (${updated.status})`)
            setTrades((prev) =>
              prev.map((t) => (t.id === updated.id ? updated : t))
            )
          }

          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as Trade
            setTrades((prev) => prev.filter((t) => t.id !== deleted.id))
            toast.warning(`🗑️ Trade deleted`)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // 🔁 Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTrades()
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  // ✅ Filtering
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()

    return trades
      .filter((t) => {
        if (activeTab !== 'all' && String(t.status).toLowerCase() !== activeTab)
          return false

        if (!q) return true

        const hay = [
          t.user_name,
          t.user_email,
          t.card_name,
          t.status,
          String(t.amount_usd),
          String(t.total),
        ]
          .join(' ')
          .toLowerCase()

        return hay.includes(q)
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
  }, [trades, activeTab, query])

  const counts = useMemo(() => {
    const map = { pending: 0, approved: 0, rejected: 0 }
    for (const t of trades) {
      const s = String(t.status).toLowerCase()
      if (s in map) (map as any)[s]++
    }
    return map
  }, [trades])

  const statusBadge = (status: string) => {
    const s = String(status).toLowerCase()
    if (s === 'approved')
      return (
        <Badge className='bg-green-100 text-green-700 hover:bg-green-100'>
          APPROVED
        </Badge>
      )
    if (s === 'rejected') return <Badge variant='destructive'>REJECTED</Badge>
    return (
      <Badge className='bg-yellow-100 text-yellow-700 hover:bg-yellow-100'>
        PENDING
      </Badge>
    )
  }

  // ✅ Open reject modal
  const openReject = (t: Trade) => {
    setRejectTrade(t)
    setRejectReason('')
    setProofFiles([])
    setRejectOpen(true)
  }

  // ✅ Submit reject with reason + proofs
  const submitReject = async () => {
    if (!rejectTrade) return
    if (!rejectReason.trim()) {
      toast.error('Please add a rejection reason')
      return
    }

    try {
      setSubmittingReject(true)

      // Upload proofs (optional)
      let proofUrls: string[] = []
      if (proofFiles.length > 0) {
        toast.message('Uploading proof images...')
        proofUrls = await uploadProofImages(rejectTrade, proofFiles)
      }

      const ok = await updateTradeStatus(rejectTrade.id, 'rejected', {
        reason: rejectReason.trim(),
        proof_images: proofUrls,
      })

      if (ok) {
        setRejectOpen(false)
        setRejectTrade(null)
        setRejectReason('')
        setProofFiles([])
      }
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Failed to reject trade')
    } finally {
      setSubmittingReject(false)
    }
  }

  if (loading)
    return (
      <div className='min-h-[60vh] flex items-center justify-center'>
        <Loader2 className='h-6 w-6 animate-spin mr-2' />
        <span className='text-muted-foreground'>Loading trades...</span>
      </div>
    )

  if (error)
    return (
      <div className='min-h-[60vh] flex items-center justify-center text-red-500'>
        {error}
      </div>
    )

  return (
    <div className='mx-auto max-w-7xl p-6'>
      <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>Trades</h1>
          <p className='text-sm text-muted-foreground'>
            Manage trade requests, verify images, approve or reject with proof.
          </p>
        </div>

        <div className='w-full md:w-[360px] relative'>
          <Search className='h-4 w-4 text-muted-foreground absolute left-3 top-3.5' />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search user, email, card, status...'
            className='pl-9'
          />
        </div>
      </div>

      <div className='mt-6'>
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as StatusTab)}
        >
          <TabsList className='grid w-full grid-cols-4 md:w-[520px]'>
            <TabsTrigger value='all'>All</TabsTrigger>
            <TabsTrigger value='pending'>
              Pending ({counts.pending})
            </TabsTrigger>
            <TabsTrigger value='approved'>
              Approved ({counts.approved})
            </TabsTrigger>
            <TabsTrigger value='rejected'>
              Rejected ({counts.rejected})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className='mt-4'>
            <Card className='shadow-sm'>
              <CardHeader className='flex flex-row items-center justify-between'>
                <CardTitle className='text-base'>
                  {activeTab === 'all'
                    ? 'All Trades'
                    : `${activeTab[0].toUpperCase()}${activeTab.slice(
                        1
                      )} Trades`}
                </CardTitle>

                <Button variant='outline' onClick={fetchTrades}>
                  Refresh
                </Button>
              </CardHeader>

              <CardContent>
                {filtered.length === 0 ? (
                  <div className='py-10 text-center text-muted-foreground'>
                    No trades found.
                  </div>
                ) : (
                  <div className='overflow-x-auto rounded-md border'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Card</TableHead>
                          <TableHead className='text-right'>Rate</TableHead>
                          <TableHead className='text-right'>USD</TableHead>
                          <TableHead className='text-right'>NGN</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Images</TableHead>
                          <TableHead className='text-right'>Action</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {filtered.map((trade) => {
                          const images = parseImageUrls(trade)

                          return (
                            <TableRow key={trade.id} className='align-top'>
                              <TableCell className='font-medium'>
                                {trade.user_name}
                              </TableCell>
                              <TableCell>{trade.user_email}</TableCell>
                              <TableCell>{trade.card_name}</TableCell>
                              <TableCell className='text-right'>
                                {trade.rate}
                              </TableCell>
                              <TableCell className='text-right'>
                                {trade.amount_usd}
                              </TableCell>
                              <TableCell className='text-right font-semibold'>
                                {trade.total}
                              </TableCell>
                              <TableCell>{statusBadge(trade.status)}</TableCell>
                              <TableCell className='text-muted-foreground'>
                                {new Date(trade.created_at).toLocaleString()}
                              </TableCell>

                              <TableCell>
                                {images.length > 0 ? (
                                  <div className='flex gap-2 overflow-x-auto max-w-[220px]'>
                                    {images.slice(0, 6).map((url, i) => (
                                      <button
                                        key={i}
                                        className='group relative h-14 w-14 overflow-hidden rounded-md border bg-muted'
                                        onClick={() => setSelectedImage(url)}
                                        type='button'
                                        title='Preview'
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={url}
                                          alt='trade'
                                          className='h-full w-full object-cover transition group-hover:scale-105'
                                        />
                                      </button>
                                    ))}
                                    {images.length > 6 ? (
                                      <div className='h-14 w-14 rounded-md border bg-muted flex items-center justify-center text-xs text-muted-foreground'>
                                        +{images.length - 6}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : (
                                  <div className='flex items-center gap-2 text-muted-foreground'>
                                    <ImageIcon className='h-4 w-4' />
                                    <span className='text-sm'>No image</span>
                                  </div>
                                )}
                              </TableCell>

                              <TableCell className='text-right'>
                                {String(trade.status).toLowerCase() ===
                                'pending' ? (
                                  <div className='flex justify-end gap-2'>
                                    <Button
                                      onClick={() =>
                                        updateTradeStatus(trade.id, 'approved')
                                      }
                                      className='bg-green-600 text-white hover:bg-green-700'
                                    >
                                      Approve
                                    </Button>

                                    <Button
                                      onClick={() => openReject(trade)}
                                      className='bg-red-600 text-white hover:bg-red-700'
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                ) : (
                                  <span className='text-sm text-muted-foreground'>
                                    —
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* 🖼️ Image Preview Modal */}
      <Dialog
        open={!!selectedImage}
        onOpenChange={() => setSelectedImage(null)}
      >
        <DialogContent className='max-w-3xl'>
          <DialogHeader>
            <DialogTitle>Trade Image</DialogTitle>
          </DialogHeader>
          {selectedImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selectedImage}
              alt='Preview'
              className='w-full h-auto rounded-lg border'
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ❌ Reject Modal (Reason + Multiple Proof Images) */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle>Reject Trade</DialogTitle>
          </DialogHeader>

          <div className='space-y-4'>
            <div className='rounded-lg border p-3 bg-muted/30'>
              <div className='text-sm font-medium'>
                {rejectTrade?.user_name}{' '}
                <span className='text-muted-foreground'>
                  ({rejectTrade?.user_email})
                </span>
              </div>
              <div className='text-sm text-muted-foreground mt-1'>
                {rejectTrade?.card_name} • ${rejectTrade?.amount_usd} • ₦
                {rejectTrade?.total}
              </div>
            </div>

            <div className='space-y-2'>
              <label className='text-sm font-medium'>Reason</label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder='Explain why you are rejecting this trade...'
                rows={4}
              />
              <p className='text-xs text-muted-foreground'>
                This reason will be shown to the user in notifications.
              </p>
            </div>

            <div className='space-y-2'>
              <label className='text-sm font-medium'>
                Proof Images (optional)
              </label>
              <Input
                type='file'
                multiple
                accept='image/*'
                onChange={(e) => {
                  const files = Array.from(e.target.files || [])
                  setProofFiles(files)
                }}
              />
              {proofFiles.length > 0 ? (
                <div className='flex flex-wrap gap-2'>
                  {proofFiles.map((f, idx) => (
                    <div
                      key={`${f.name}-${idx}`}
                      className='flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-xs'
                    >
                      <span className='max-w-[180px] truncate'>{f.name}</span>
                      <button
                        type='button'
                        onClick={() =>
                          setProofFiles((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        className='text-muted-foreground hover:text-foreground'
                        title='Remove'
                      >
                        <X className='h-3.5 w-3.5' />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className='gap-2'>
            <Button
              variant='outline'
              onClick={() => setRejectOpen(false)}
              disabled={submittingReject}
            >
              Cancel
            </Button>

            <Button
              onClick={submitReject}
              disabled={submittingReject}
              className='bg-red-600 text-white hover:bg-red-700'
            >
              {submittingReject ? (
                <>
                  <Loader2 className='h-4 w-4 animate-spin mr-2' />
                  Rejecting...
                </>
              ) : (
                'Reject Trade'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
