/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Search } from 'lucide-react'

type ThreadStatus = 'open' | 'closed'

type Thread = {
  id: string
  user_id: string
  subject: string
  status: ThreadStatus
  created_at: string
  updated_at: string
}

export default function AdminSupportPage() {
  const [loading, setLoading] = useState(true)
  const [threads, setThreads] = useState<Thread[]>([])
  const [tab, setTab] = useState<'all' | ThreadStatus>('all')
  const [q, setQ] = useState('')

  const fetchThreads = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tab !== 'all') params.set('status', tab)
      if (q.trim()) params.set('q', q.trim())

      const res = await fetch(
        `/api/admin/support/threads?${params.toString()}`,
        {
          cache: 'no-store',
        }
      )
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setThreads(Array.isArray(data) ? data : [])
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to load support tickets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchThreads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // search debounce-lite (optional)
  useEffect(() => {
    const t = setTimeout(() => fetchThreads(), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const counts = useMemo(() => {
    const open = threads.filter((t) => t.status === 'open').length
    const closed = threads.filter((t) => t.status === 'closed').length
    return { open, closed, all: open + closed }
  }, [threads])

  const statusBadge = (s: ThreadStatus) =>
    s === 'open' ? (
      <Badge className='bg-green-100 text-green-700 hover:bg-green-100'>
        OPEN
      </Badge>
    ) : (
      <Badge className='bg-slate-100 text-slate-700 hover:bg-slate-100'>
        CLOSED
      </Badge>
    )

  return (
    <div className='mx-auto max-w-7xl p-6'>
      <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>
            Contact Support
          </h1>
          <p className='text-sm text-muted-foreground'>
            View user tickets, reply as admin, and close conversations.
          </p>
        </div>

        <div className='w-full md:w-[380px] relative'>
          <Search className='h-4 w-4 text-muted-foreground absolute left-3 top-3.5' />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Search by subject...'
            className='pl-9'
          />
        </div>
      </div>

      <div className='mt-6'>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className='grid w-full grid-cols-3 md:w-[520px]'>
            <TabsTrigger value='all'>All ({counts.all})</TabsTrigger>
            <TabsTrigger value='open'>Open ({counts.open})</TabsTrigger>
            <TabsTrigger value='closed'>Closed ({counts.closed})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card className='mt-4 shadow-sm'>
        <CardHeader className='flex flex-row items-center justify-between'>
          <CardTitle className='text-base'>Tickets</CardTitle>
          <Button variant='outline' onClick={fetchThreads}>
            Refresh
          </Button>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className='min-h-[45vh] flex items-center justify-center'>
              <Loader2 className='h-5 w-5 animate-spin mr-2' />
              <span className='text-muted-foreground'>Loading tickets...</span>
            </div>
          ) : threads.length === 0 ? (
            <div className='py-10 text-center text-muted-foreground'>
              No tickets found.
            </div>
          ) : (
            <div className='overflow-x-auto rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className='text-right'>Action</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {threads.map((t) => (
                    <TableRow key={t.id} className='align-top'>
                      <TableCell className='font-medium'>
                        <div className='max-w-[520px] truncate'>
                          {t.subject}
                        </div>
                        <div className='text-xs text-muted-foreground mt-1'>
                          Ticket ID: {t.id}
                        </div>
                      </TableCell>

                      <TableCell>{statusBadge(t.status)}</TableCell>

                      <TableCell className='text-muted-foreground'>
                        {new Date(t.created_at).toLocaleString()}
                      </TableCell>

                      <TableCell className='text-muted-foreground'>
                        {new Date(t.updated_at).toLocaleString()}
                      </TableCell>

                      <TableCell className='text-right'>
                        <Button
                          asChild
                          className='bg-slate-900 hover:bg-slate-800'
                        >
                          <Link href={`/admin/support/${t.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
