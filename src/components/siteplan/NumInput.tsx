/**
 * Input angka yang nyaman di mobile: isinya boleh dihapus kosong saat
 * mengetik (placeholder abu-abu tampil sebagai panduan), nilai numerik
 * terakhir yang valid tetap dipakai; saat blur field kosong dipulihkan.
 */
import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'

interface Props {
  value: number
  onValue: (n: number) => void
  min?: number
  max?: number
  step?: number
  placeholder?: string
  className?: string
}

export default function NumInput({ value, onValue, min, max, step, placeholder, className }: Props) {
  const [text, setText] = useState<string>(String(value))
  const lastValue = useRef(value)

  // sinkron ketika nilai diubah dari luar (buka desain tersimpan / hasil AI)
  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value
      setText(String(value))
    }
  }, [value])

  return (
    <Input
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder ?? String(value)}
      className={className}
      onChange={e => {
        const t = e.target.value
        setText(t)
        const n = parseFloat(t)
        if (isFinite(n)) {
          lastValue.current = n
          onValue(n)
        }
      }}
      onBlur={() => {
        const n = parseFloat(text)
        if (text.trim() === '' || !isFinite(n)) setText(String(lastValue.current))
      }}
    />
  )
}
