/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import {
  LayoutDashboard,
  LogOut,
  Users,
  CreditCard,
  ArrowDownCircle,
  DollarSign,
  MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import clsx from 'clsx'
import { Toaster } from '@/components/ui/sonner'
import { AdminRealtimeListener } from '@/components/admin-realtime-listener'

const navItems = [
  { name: 'Dashboard', icon: LayoutDashboard, href: '/admin' },
  { name: 'Gift Cards', icon: DollarSign, href: '/admin/giftcards' },
  { name: 'Trades', icon: CreditCard, href: '/admin/trades' },
  { name: 'Withdrawals', icon: ArrowDownCircle, href: '/admin/withdrawal' },
  { name: 'Users', icon: Users, href: '/admin/users' },
  { name: 'Support', icon: MessageCircle, href: '/admin/support' },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClientComponentClient()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAdmin = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        router.replace('/login')
        return
      }

      setUser(user)
      setLoading(false)
    }

    checkAdmin()
  }, [router, supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <p className='text-gray-500'>Loading admin panel...</p>
      </div>
    )
  }

  return (
    <div className='flex min-h-screen bg-gray-50'>
      {/* ✅ Global Toast Listener */}
      <AdminRealtimeListener />

      {/* ✅ Global Toast UI */}
      <Toaster richColors position='bottom-right' />

      {/* ✅ Admin content */}
      {/* Sidebar */}
      <aside className='w-64 bg-white border-r border-gray-200 hidden md:flex flex-col'>
        <div className='px-6 py-4 border-b'>
          <h1 className='text-xl font-semibold text-gray-800'>
            GiftSwap Admin
          </h1>
        </div>
        <nav className='flex-1 px-4 py-6 space-y-2'>
          {navItems.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition',
                  active
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                <Icon size={18} />
                {item.name}
              </Link>
            )
          })}
        </nav>
        <div className='px-4 pb-4'>
          <Button
            onClick={handleLogout}
            variant='outline'
            className='w-full flex items-center justify-center gap-2'
          >
            <LogOut size={16} />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className='flex-1 p-6 overflow-y-auto'>{children}</main>
    </div>
  )
}
