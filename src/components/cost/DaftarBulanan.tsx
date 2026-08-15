// ============================================================
// Daftar panjang yang mengelompok sendiri per bulan.
//
// Bulan berjalan terbuka; bulan yang sudah lewat terlipat menjadi satu baris
// berisi nama bulan, jumlah barisnya, dan nilainya. Di atasnya ada pemilih
// bulan untuk melompat langsung ke bulan mana pun.
//
// Dipakai bersama oleh Procurement dan Akuntan. Satu komponen, bukan salinan
// per daftar: aturan "bulan mana yang terbuka" harus sama di seluruh aplikasi,
// dan salinan kedua akan berbeda diam-diam begitu salah satunya diperbaiki.
// ============================================================
import { useMemo, useState } from 'react'
import { ChevronDown, CalendarRange } from 'lucide-react'
import {
  kelompokPerBulan, pilihanBulan, saringBulan, SEMUA_BULAN,
} from '@/lib/kelompokBulan'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`

export default function DaftarBulanan<T>({
  baris, tanggalDari, nilaiDari, kunci, render, kosong, satuan = 'baris', className = '',
}: {
  baris: readonly T[]
  /** Tanggal yang menentukan bulannya, mis. `po.tanggal`. */
  tanggalDari: (b: T) => unknown
  /** Nilai yang dijumlahkan di kepala tiap bulan. Kosongkan bila tak relevan. */
  nilaiDari?: (b: T) => number
  kunci: (b: T, i: number) => string
  render: (b: T) => React.ReactNode
  /** Ditampilkan bila tidak ada baris sama sekali. */
  kosong?: React.ReactNode
  satuan?: string
  className?: string
}) {
  const [pilihan, setPilihan] = useState<string>(SEMUA_BULAN)

  const kelompok = useMemo(
    () => kelompokPerBulan(baris, tanggalDari, { nilai: nilaiDari }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baris],
  )
  const opsi = useMemo(() => pilihanBulan(kelompok), [kelompok])
  const tampil = useMemo(() => saringBulan(kelompok, pilihan), [kelompok, pilihan])

  if (baris.length === 0) return <>{kosong ?? null}</>

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Pemilih bulan hanya muncul bila memang ada lebih dari satu bulan.
          Pada perusahaan yang baru mulai, seluruh datanya ada di bulan ini —
          dan pemilih yang cuma punya satu pilihan adalah perabot kosong. */}
      {kelompok.length > 1 && (
        <label className="flex items-center gap-2">
          <CalendarRange className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <select
            data-pilih-bulan
            value={pilihan}
            onChange={e => setPilihan(e.target.value)}
            aria-label="Pilih bulan"
            className="h-9 flex-1 min-w-0 rounded-xl border border-border bg-white pl-2.5 pr-8
              text-[11px] font-bold text-navy">
            {opsi.map(o => <option key={o.nilai} value={o.nilai}>{o.label}</option>)}
          </select>
        </label>
      )}

      {tampil.map(k => (
        k.berjalan
          ? (
            // Bulan berjalan: langsung terbuka, tanpa kepala yang bisa
            // ditutup. Menyembunyikan pekerjaan hari ini di balik satu
            // ketukan berarti menambah ketukan pada yang paling sering
            // dilakukan.
            <div key={k.bulan} data-bulan={k.bulan} data-terbuka className="space-y-2">
              {kelompok.length > 1 && (
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <p className="text-[11px] font-black uppercase tracking-wide text-navy truncate">
                    {k.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                    {k.baris.length} {satuan}{nilaiDari ? ` · ${fmt(k.total)}` : ''}
                  </p>
                </div>
              )}
              {k.baris.map((b, i) => <div key={kunci(b, i)}>{render(b)}</div>)}
            </div>
          )
          : <BulanTerlipat key={k.bulan} k={k} kunci={kunci} render={render}
              satuan={satuan} adaNilai={!!nilaiDari} />
      ))}
    </div>
  )
}

function BulanTerlipat<T>({ k, kunci, render, satuan, adaNilai }: {
  k: { bulan: string; label: string; baris: T[]; total: number }
  kunci: (b: T, i: number) => string
  render: (b: T) => React.ReactNode
  satuan: string
  adaNilai: boolean
}) {
  const [buka, setBuka] = useState(false)
  return (
    <div data-bulan={k.bulan} className="rounded-2xl border border-border bg-white overflow-hidden">
      <button
        data-buka-bulan
        onClick={() => setBuka(v => !v)}
        aria-expanded={buka}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50">
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform
            ${buka ? '' : '-rotate-90'}`} />
          <span className="text-xs font-bold text-navy truncate">{k.label}</span>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
          {k.baris.length} {satuan}{adaNilai ? ` · ${fmt(k.total)}` : ''}
        </span>
      </button>
      {buka && (
        <div className="p-3 pt-0 space-y-2 border-t border-border">
          <div className="h-1" />
          {k.baris.map((b, i) => <div key={kunci(b, i)}>{render(b)}</div>)}
        </div>
      )}
    </div>
  )
}
