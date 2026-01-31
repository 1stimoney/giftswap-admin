/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'

interface Bank {
  id: string
  bank_name: string
  account_number: string
  account_name: string
}

interface User {
  id: string
  username: string
  email: string
  balance: number
}

interface Withdrawal {
  id: string
  amount: number
  status: string
  created_at: string
  user: User
  bank: Bank
  reject_reason?: string | null
}

export default function WithdrawalsAdminPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'pending' | 'approved' | 'rejected'
  >('all')

  const [processingId, setProcessingId] = useState<string | null>(null)

  // Reject modal state
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [selectedWithdrawal, setSelectedWithdrawal] =
    useState<Withdrawal | null>(null)

  // ✅ Fetch withdrawals
  const fetchWithdrawals = async () => {
    try {
      const { data, error } = await supabase
        .from('withdrawals')
        .select(
          `
          id,
          amount,
          status,
          created_at,
          reject_reason,
          user:profiles(id, username, email, balance),
          bank:user_bank_info(id, bank_name, account_number, account_name)
        `
        )
        .order('created_at', { ascending: false })

      if (error) throw error
      setWithdrawals((data as unknown as Withdrawal[]) || [])
    } catch (err) {
      console.error('Error fetching withdrawals:', err)
      toast.error('Failed to load withdrawals. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ✅ Approve
  const approveWithdrawal = async (w: Withdrawal) => {
    setProcessingId(w.id)
    const t = toast.loading('Approving withdrawal...')
    try {
      const res = await fetch(`/api/admin/withdrawals/${w.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      })

      if (!res.ok) {
        const txt = await res.text()
        console.error('Approve failed:', txt)
        throw new Error('Failed to approve withdrawal')
      }

      toast.success('Withdrawal approved ✅', { id: t })

      // Optimistic UI
      setWithdrawals((prev) =>
        prev.map((x) => (x.id === w.id ? { ...x, status: 'approved' } : x))
      )
    } catch (e: any) {
      toast.error(e?.message || 'Approval failed', { id: t })
    } finally {
      setProcessingId(null)
    }
  }

  // ✅ Open reject modal
  const openRejectModal = (w: Withdrawal) => {
    setSelectedWithdrawal(w)
    setRejectReason('')
    setRejectOpen(true)
  }

  // ✅ Confirm reject
  const confirmReject = async () => {
    if (!selectedWithdrawal) return

    const w = selectedWithdrawal
    const reason = rejectReason.trim()

    if (!reason) {
      toast.error('Please enter a rejection reason.')
      return
    }

    setProcessingId(w.id)
    const t = toast.loading('Rejecting withdrawal...')
    try {
      const res = await fetch(`/api/admin/withdrawals/${w.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          reject_reason: reason,
        }),
      })

      if (!res.ok) {
        const txt = await res.text()
        console.error('Reject failed:', txt)
        throw new Error('Failed to reject withdrawal')
      }

      toast.success('Withdrawal rejected ✅', { id: t })

      // Optimistic UI
      setWithdrawals((prev) =>
        prev.map((x) =>
          x.id === w.id
            ? { ...x, status: 'rejected', reject_reason: reason }
            : x
        )
      )

      setRejectOpen(false)
      setSelectedWithdrawal(null)
      setRejectReason('')
    } catch (e: any) {
      toast.error(e?.message || 'Rejection failed', { id: t })
    } finally {
      setProcessingId(null)
    }
  }

  // ✅ Initial fetch
  useEffect(() => {
    fetchWithdrawals()
  }, [])

  // ✅ Realtime changes
  useEffect(() => {
    const channel = supabase
      .channel('withdrawals-admin-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'withdrawals' },
        (payload) => {
          // Prefer patching local state for speed; fallback to refetch for safety
          if (payload.eventType === 'INSERT') {
            toast.info('🆕 New withdrawal request received.')
            fetchWithdrawals()
            return
          }

          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as any
            setWithdrawals((prev) =>
              prev.map((x) =>
                x.id === updated.id
                  ? {
                      ...x,
                      status: updated.status,
                      reject_reason: updated.reject_reason ?? x.reject_reason,
                    }
                  : x
              )
            )
            return
          }

          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as any
            setWithdrawals((prev) => prev.filter((x) => x.id !== oldRow.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return withdrawals
      .filter((w) =>
        statusFilter === 'all' ? true : w.status === statusFilter
      )
      .filter((w) => {
        if (!q) return true
        return (
          w.user?.username?.toLowerCase().includes(q) ||
          w.user?.email?.toLowerCase().includes(q) ||
          w.bank?.bank_name?.toLowerCase().includes(q) ||
          w.bank?.account_number?.toLowerCase().includes(q)
        )
      })
  }, [withdrawals, query, statusFilter])

  // ✅ UI rendering
  if (loading)
    return (
      <div className='flex justify-center items-center min-h-[70vh]'>
        <Loader2 className='animate-spin text-blue-600 w-6 h-6 mr-2' />
        <p className='text-muted-foreground font-medium'>
          Loading withdrawals...
        </p>
      </div>
    )

  return (
    <div className='max-w-7xl mx-auto py-10 px-4'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>💳 Withdrawals</h1>
          <p className='text-muted-foreground mt-1'>
            Approve or reject withdrawal requests. Users get push + in-app
            notifications.
          </p>
        </div>

        <div className='flex gap-3 flex-col sm:flex-row sm:items-center'>
          <div className='relative w-full sm:w-[320px]'>
            <Search className='absolute left-3 top-2.5 h-4 w-4 text-muted-foreground' />
            <Input
              className='pl-9'
              placeholder='Search user, email, bank, account...'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <button
                className='absolute right-2 top-2 p-1 rounded hover:bg-muted'
                onClick={() => setQuery('')}
                aria-label='Clear search'
              >
                <X className='h-4 w-4 text-muted-foreground' />
              </button>
            ) : null}
          </div>

          <div className='flex gap-2'>
            {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? 'default' : 'outline'}
                onClick={() => setStatusFilter(s)}
                className='capitalize'
              >
                {s}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className='flex justify-center items-center min-h-[55vh] text-muted-foreground text-lg'>
          No withdrawals found
        </div>
      ) : (
        <div className='grid gap-6 sm:grid-cols-2 lg:grid-cols-3'>
          {filtered.map((w) => (
            <Card
              key={w.id}
              className='shadow-sm border hover:shadow-md transition-all'
            >
              <CardHeader className='pb-3'>
                <CardTitle className='text-base font-semibold flex justify-between items-center gap-3'>
                  <div className='min-w-0'>
                    <p className='truncate'>{w.user?.username || 'User'}</p>
                    <p className='text-xs text-muted-foreground truncate'>
                      {w.user?.email}
                    </p>
                  </div>

                  <Badge
                    variant={
                      w.status === 'approved'
                        ? 'default'
                        : w.status === 'rejected'
                        ? 'destructive'
                        : 'secondary'
                    }
                    className={
                      w.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100'
                        : ''
                    }
                  >
                    {w.status.toUpperCase()}
                  </Badge>
                </CardTitle>
              </CardHeader>

              <CardContent className='space-y-3 text-sm'>
                <div className='rounded-lg bg-muted/40 p-3'>
                  <p className='text-xs text-muted-foreground'>Amount</p>
                  <p className='text-lg font-bold'>
                    ₦{Number(w.amount || 0).toLocaleString()}
                  </p>
                </div>

                <Separator />

                <div className='space-y-2 text-muted-foreground'>
                  <p className='text-sm text-foreground font-medium'>
                    {w.bank?.bank_name}{' '}
                    <span className='text-muted-foreground font-normal'>
                      — {w.bank?.account_number}
                    </span>
                  </p>
                  <p className='text-xs'>{w.bank?.account_name}</p>
                  <p className='text-xs'>
                    {new Date(w.created_at).toLocaleString()}
                  </p>
                </div>

                {w.status === 'rejected' && w.reject_reason ? (
                  <div className='rounded-lg border border-destructive/20 bg-destructive/5 p-3'>
                    <p className='text-xs font-semibold text-destructive'>
                      Rejection reason
                    </p>
                    <p className='text-sm text-foreground mt-1'>
                      {w.reject_reason}
                    </p>
                  </div>
                ) : null}

                {w.status === 'pending' ? (
                  <div className='flex gap-3 pt-2'>
                    <Button
                      onClick={() => approveWithdrawal(w)}
                      disabled={processingId === w.id}
                      className='bg-green-600 hover:bg-green-700 text-white flex-1'
                    >
                      {processingId === w.id ? 'Processing...' : 'Approve'}
                    </Button>

                    <Button
                      onClick={() => openRejectModal(w)}
                      disabled={processingId === w.id}
                      className='bg-red-600 hover:bg-red-700 text-white flex-1'
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>Reject Withdrawal</DialogTitle>
          </DialogHeader>

          <div className='space-y-3'>
            <p className='text-sm text-muted-foreground'>
              Add a clear reason. The user will receive both push + an in-app
              notification.
            </p>

            <Textarea
              placeholder='Reason for rejection...'
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className='min-h-[120px]'
            />
          </div>

          <DialogFooter className='gap-2 sm:gap-0'>
            <Button
              variant='outline'
              onClick={() => setRejectOpen(false)}
              disabled={processingId === selectedWithdrawal?.id}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmReject}
              className='bg-red-600 hover:bg-red-700 text-white'
              disabled={processingId === selectedWithdrawal?.id}
            >
              {processingId === selectedWithdrawal?.id
                ? 'Rejecting...'
                : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
