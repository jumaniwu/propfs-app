import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface RupiahInputProps {
  value: number
  onChange: (val: number) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  min?: number
  max?: number
}

/**
 * Input khusus untuk angka Rupiah dengan format otomatis
 * Menampilkan "1.000.000" tapi internally menyimpan 1000000
 */
export default function RupiahInput({
  value,
  onChange,
  placeholder = '0',
  disabled,
  className,
  id,
  min,
  max,
}: RupiahInputProps) {
  const [displayValue, setDisplayValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const isEditingRef = useRef(false)

  // Sync display value when external value changes (but not while editing)
  useEffect(() => {
    if (!isEditingRef.current) {
      setDisplayValue(value > 0 ? formatForDisplay(value) : '')
    }
  }, [value])

  function formatForDisplay(num: number): string {
    return num.toLocaleString('id-ID')
  }

  function parseDisplay(str: string): number {
    const cleaned = str.replace(/\./g, '').replace(',', '.')
    const n = parseFloat(cleaned)
    return isNaN(n) ? 0 : n
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    // Allow only digits and dots
    const digitsOnly = raw.replace(/[^\d]/g, '')
    const num = parseInt(digitsOnly, 10) || 0

    // Validate bounds
    if (min !== undefined && num < min) return
    if (max !== undefined && num > max) return

    // Format with thousand separators
    const formatted = num > 0 ? formatForDisplay(num) : ''
    setDisplayValue(formatted)
    onChange(num)
  }

  function handleFocus() {
    isEditingRef.current = true
    // Show raw digits for editing
    if (value > 0) {
      setDisplayValue(value.toString())
    }
  }

  function handleBlur() {
    isEditingRef.current = false
    // Re-format on blur
    const num = parseDisplay(displayValue) || value
    setDisplayValue(num > 0 ? formatForDisplay(num) : '')
  }

  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">
        Rp
      </div>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm font-mono ring-offset-background',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:border-green-400',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      />
    </div>
  )
}
