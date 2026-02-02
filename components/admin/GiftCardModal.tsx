/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: {
    id?: string
    name?: string

    // new
    physical_rate?: number | null
    ecode_rate?: number | null

    // old (fallback)
    rate?: number | null

    image_url?: string | null
  } | null
}

function toNumberOrNull(v: string) {
  const cleaned = v.replace(/,/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export default function GiftCardModal({
  open,
  onOpenChange,
  initialData,
}: Props) {
  const [name, setName] = useState('')
  const [physicalRate, setPhysicalRate] = useState('') // string input
  const [ecodeRate, setEcodeRate] = useState('') // string input
  const [imageUrl, setImageUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const isEditing = !!initialData?.id

  useEffect(() => {
    if (initialData) {
      const fallback = initialData.rate ?? null

      setName(initialData.name || '')
      setPhysicalRate(
        (initialData.physical_rate ?? fallback ?? '')?.toString?.() ?? ''
      )
      setEcodeRate(
        (initialData.ecode_rate ?? fallback ?? '')?.toString?.() ?? ''
      )
      setImageUrl(initialData.image_url || '')
    } else {
      setName('')
      setPhysicalRate('')
      setEcodeRate('')
      setImageUrl('')
    }
  }, [initialData, open])

  const parsedPhysical = useMemo(
    () => toNumberOrNull(physicalRate),
    [physicalRate]
  )
  const parsedEcode = useMemo(() => toNumberOrNull(ecodeRate), [ecodeRate])

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Card name is required')
      return
    }

    const pr = parsedPhysical ?? 0
    const er = parsedEcode ?? 0
    if (pr <= 0 && er <= 0) {
      toast.error('Enter at least one valid rate (Physical or E-code)')
      return
    }

    // Helpful: if one rate is missing but the other is valid, auto-fill it.
    const finalPhysical = pr > 0 ? pr : er
    const finalEcode = er > 0 ? er : pr

    setSaving(true)
    try {
      const payload = {
        name: trimmedName,
        physical_rate: finalPhysical,
        ecode_rate: finalEcode,
        // keep sending image_url like you had
        image_url: imageUrl?.trim() || null,
      }

      let res: Response
      if (initialData?.id) {
        res = await fetch(`/api/admin/giftcards/${initialData.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/admin/giftcards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to save')
      }

      toast.success(isEditing ? 'Gift card updated' : 'Gift card created')
      onOpenChange(false)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Failed to save gift card')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg rounded-2xl'>
        <DialogHeader>
          <DialogTitle className='text-xl font-extrabold'>
            {isEditing ? 'Edit Gift Card' : 'Add Gift Card'}
          </DialogTitle>
          <DialogDescription className='text-sm'>
            Set separate rates for{' '}
            <span className='font-semibold'>Physical</span> and{' '}
            <span className='font-semibold'>E-code</span> trades.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-5 mt-2'>
          {/* Name */}
          <div className='space-y-2'>
            <Label className='text-sm font-semibold'>Card Name</Label>
            <Input
              value={name}
              onChange={(e: any) => setName(e.target.value)}
              placeholder='e.g. Apple / Steam / Sephora'
              className='h-11 rounded-xl'
            />
          </div>

          <Separator />

          {/* Rates */}
          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <Label className='text-sm font-semibold'>Rates (₦ per $)</Label>
              <Badge variant='secondary' className='rounded-full'>
                You can set different rates
              </Badge>
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label className='text-xs text-muted-foreground'>
                  Physical Rate
                </Label>
                <Input
                  value={physicalRate}
                  onChange={(e: any) => setPhysicalRate(e.target.value)}
                  inputMode='numeric'
                  placeholder='e.g. 1200'
                  className='h-11 rounded-xl'
                />
                {parsedPhysical === null && physicalRate.trim() ? (
                  <p className='text-xs text-red-500'>Enter a valid number</p>
                ) : null}
              </div>

              <div className='space-y-2'>
                <Label className='text-xs text-muted-foreground'>
                  E-code Rate
                </Label>
                <Input
                  value={ecodeRate}
                  onChange={(e: any) => setEcodeRate(e.target.value)}
                  inputMode='numeric'
                  placeholder='e.g. 1100'
                  className='h-11 rounded-xl'
                />
                {parsedEcode === null && ecodeRate.trim() ? (
                  <p className='text-xs text-red-500'>Enter a valid number</p>
                ) : null}
              </div>
            </div>

            <p className='text-xs text-muted-foreground'>
              Tip: If you only fill one rate, we’ll use it for both.
            </p>
          </div>

          <Separator />

          {/* Image URL */}
          <div className='space-y-2'>
            <Label className='text-sm font-semibold'>
              Image URL (optional)
            </Label>
            <Input
              value={imageUrl}
              onChange={(e: any) => setImageUrl(e.target.value)}
              placeholder='https://...'
              className='h-11 rounded-xl'
            />
          </div>

          {/* Actions */}
          <div className='flex gap-2 justify-end pt-2'>
            <Button
              variant='ghost'
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className='rounded-xl'
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className='rounded-xl'
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
