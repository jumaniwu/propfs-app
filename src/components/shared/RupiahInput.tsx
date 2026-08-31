import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { ketikRupiah, selesaiKetik, tampilRupiah } from '@/lib/isianRupiah'

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
    if (!isEditingRef.current) setDisplayValue(tampilRupiah(value))
  }, [value])

  /**
   * Setiap ketukan MENGHASILKAN sesuatu.
   *
   * Dulu di sini ada `if (num < min) return` — berhenti tanpa memperbarui apa
   * pun. Setiap ketukan yang untuk sementara menghasilkan angka di bawah
   * batas ditelan, dan mengetik "3.500.000" selalu melewati "3" lebih dulu.
   * Kolomnya tampak macet pada nilai lamanya.
   */
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const h = ketikRupiah(e.target.value, { min, max })
    setDisplayValue(h.tampil)
    onChange(h.nilai)
  }

  function handleFocus() {
    isEditingRef.current = true
    // Show raw digits for editing
    if (value > 0) setDisplayValue(String(value))
  }

  /**
   * Yang tampil dan yang tersimpan DISAMAKAN, dan yang menang yang diketik.
   *
   * Dulu di sini ada `parseDisplay(displayValue) || value`. `|| value`
   * menyalakan diri ketika hasil bacanya nol — yaitu tepat ketika kolomnya
   * dikosongkan untuk diisi angka baru. Nilai LAMA dipasang kembali ke layar
   * sementara induknya sudah menerima nol; sejak itu yang tampil dan yang
   * tersimpan berbeda, dan pemakainya mengetik ulang berkali-kali sambil
   * melihat angka lama muncul lagi.
   */
  function handleBlur() {
    isEditingRef.current = false
    const h = selesaiKetik(displayValue, { min, max })
    setDisplayValue(h.tampil)
    // Induknya ikut diberi tahu, supaya keduanya tidak pernah berselisih.
    if (h.nilai !== value) onChange(h.nilai)
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
