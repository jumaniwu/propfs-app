import { useMemo, useState } from 'react'
import { Copy, Trash2, AlertTriangle, ChevronDown } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type { RealisasiEntry } from '@/lib/ai-realisasi'
import {
  cariDuplikat, duplikatPasti, nilaiDuplikat, ringkasDuplikat,
  type PasanganDuplikat,
} from '@/lib/duplikatBiaya'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`

/**
 * Biaya yang terlanjur tercatat dua kali.
 *
 * Bukan pengandaian: ini benar-benar terjadi pada data pemakainya — 42
 * transaksi menjadi 46, material Rp 69,3 juta menjadi Rp 77,4 juta, karena
 * nota yang sama diketik "A 40637" oleh manusia dan dibaca "A40637" oleh AI.
 * Pembandingnya sudah diperbaiki, tetapi baris yang sudah masuk tidak hilang
 * sendiri — dan selama masih di sana, seluruh laporan keuangannya keliru.
 *
 * MENGHAPUS TETAP DIKETUK MANUSIA. Yang "pasti" pun tidak dihapus otomatis:
 * menghapus catatan keuangan tanpa ada yang melihatnya lebih dulu adalah
 * kerusakan yang tidak bisa dibatalkan, dan sekali salah tidak ada jejak yang
 * bisa dipakai memulihkannya.
 */
export default function PanelDuplikat({ entries, onHapus }: {
  entries: RealisasiEntry[]
  onHapus: (id: string) => void
}) {
  const { toast } = useToast()
  const [buka, setBuka] = useState(false)
  const [diabaikan, setDiabaikan] = useState<Set<string>>(new Set())

  const semua = useMemo(() => cariDuplikat(entries), [entries])
  const daftar = useMemo(
    () => semua.filter(p => !diabaikan.has(p.kembar.id)),
    [semua, diabaikan],
  )

  if (daftar.length === 0) return null

  const pasti = duplikatPasti(daftar)

  function hapus(p: PasanganDuplikat) {
    onHapus(p.kembar.id)
    toast({
      title: 'Baris kembar dihapus',
      description: `${fmt(p.kembar.jumlah)} tidak lagi terhitung dua kali.`,
    })
  }
  function abaikan(p: PasanganDuplikat) {
    setDiabaikan(s => new Set(s).add(p.kembar.id))
  }
  function hapusSemuaPasti() {
    for (const p of pasti) onHapus(p.kembar.id)
    toast({
      title: `${pasti.length} baris kembar dihapus`,
      description: `${fmt(nilaiDuplikat(pasti))} tidak lagi terhitung dua kali.`,
    })
  }

  return (
    <div data-panel-duplikat className="bg-white rounded-3xl border border-rose-300 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 grid place-items-center shrink-0">
          <Copy className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-navy text-sm">Ada biaya yang tercatat dua kali</p>
          <p className="text-[11px] text-muted-foreground break-words">{ringkasDuplikat(daftar)}</p>
        </div>
      </div>

      {pasti.length > 0 && (
        <button
          data-hapus-semua-duplikat
          onClick={hapusSemuaPasti}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-rose-600
            text-white px-3 py-2 text-xs font-bold text-left break-words">
          <Trash2 className="w-3.5 h-3.5" />
          Hapus {pasti.length} baris yang sama persis ({fmt(nilaiDuplikat(pasti))})
        </button>
      )}

      <button onClick={() => setBuka(v => !v)}
        className="flex items-center gap-1 text-[11px] font-bold text-navy">
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${buka ? 'rotate-180' : ''}`} />
        {buka ? 'Tutup rincian' : `Periksa satu per satu (${daftar.length})`}
      </button>

      {/* Rinciannya bisa memuat puluhan pasangan. Diberi gulungan sendiri
          supaya panel ini tidak mendorong seluruh kolom memanjang ke bawah
          sampai tombolnya tak tergapai. */}
      {buka && (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto overscroll-contain pr-0.5">
          {daftar.map(p => (
            <div key={p.kembar.id} className="rounded-xl border border-border p-3 space-y-2 min-w-0">
              <p className={`flex items-start gap-1.5 text-[11px] font-bold min-w-0 break-words ${
                p.keyakinan === 'pasti' ? 'text-rose-700' : 'text-amber-800'}`}>
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span className="min-w-0 break-words">
                  {p.keyakinan === 'pasti' ? 'Sama persis' : 'Mungkin kembar'} — {p.sebab}
                </span>
              </p>

              <div className="grid gap-1.5">
                <Baris label="Dipertahankan" e={p.asli} tone="text-emerald-700" />
                <Baris label="Akan dihapus" e={p.kembar} tone="text-rose-700" />
              </div>

              <div className="flex gap-2">
                <button onClick={() => hapus(p)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-rose-600
                    text-white px-3 py-1.5 text-[11px] font-bold">
                  <Trash2 className="w-3 h-3" /> Hapus yang kembar
                </button>
                {/* Dua pembelian yang kebetulan sama memang mungkin. Yang
                    menutup dugaan ini harus manusia, dan penutupannya tidak
                    boleh menghapus apa pun. */}
                <button onClick={() => abaikan(p)}
                  className="flex-1 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-navy">
                  Bukan duplikat
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Baris({ label, e, tone }: { label: string; e: RealisasiEntry; tone: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-border px-2.5 py-1.5">
      <p className={`text-[10px] font-black uppercase ${tone}`}>{label}</p>
      <p className="text-xs font-semibold text-navy break-words">{e.keterangan}</p>
      <p className="text-[10px] text-muted-foreground break-words">
        {e.tanggal} · {fmt(e.jumlah)}
        {e.namaSupplier ? ` · ${e.namaSupplier}` : ''}
        {e.nomorNota ? ` · ${e.nomorNota}` : ''}
      </p>
    </div>
  )
}
