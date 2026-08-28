import { useMemo, useState } from 'react'
import { Truck, Plus, Loader2, AlertTriangle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type { RealisasiEntry } from '@/lib/ai-realisasi'
import type { PurchaseOrder } from '@/lib/procurement'
import type { DeliveryOrder, PoPayment } from '@/lib/penerimaan'
import { LABEL_STATUS_BAYAR, TONE_STATUS_BAYAR } from '@/lib/penerimaan'
import { penerimaanBelumTercatat, ringkasUsul, type UsulDariPo } from '@/lib/sinkronRealisasi'
import { usulUntukProyek, poTanpaProyek, peringatanTanpaProyek } from '@/lib/lingkupPo'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`

/**
 * Barang yang sudah datang menurut Procurement, tetapi belum ada di buku
 * pengeluaran.
 *
 * DITAWARKAN, BUKAN DIMASUKKAN SENDIRI — dan itu keputusan yang disengaja.
 *
 * Nota yang sama bisa sudah masuk lewat Chat AI dengan nomor nota yang berbeda
 * ejaannya, atau diketik manual tanpa tautan surat jalan. Menyalinnya
 * diam-diam berarti biaya yang terhitung dua kali: ia ikut ke laba rugi, ke
 * neraca, dan ke perbandingan terhadap RAB — dan tidak ada yang menyadarinya
 * sampai seseorang menghitung ulang dengan tangan.
 *
 * Satu ketukan konfirmasi jauh lebih murah daripada itu. Yang dihapus panel
 * ini adalah MENGETIK ULANG, bukan memutuskan.
 *
 * DISARING MENURUT PROYEK. Buku pengeluaran dipegang per proyek, tetapi PO
 * disimpan satu kolam untuk seluruh workspace — sehingga panel ini dulu
 * menawarkan setiap surat jalan kepada setiap proyek. Membuka Noble Cove
 * menampilkan pembelian kayu milik proyek Pak Soni, lengkap dengan tombolnya,
 * dan satu ketukan di proyek yang keliru membukukan biaya itu di sana. Ketukan
 * yang sama di proyek yang benar membukukannya lagi.
 */
export default function PanelDariProcurement({
  dos, pos, entries, bayar, namaProyek, onCatat, onSelesai,
}: {
  dos: DeliveryOrder[]
  pos: PurchaseOrder[]
  entries: RealisasiEntry[]
  bayar: PoPayment[]
  /** Proyek yang bukunya sedang dibuka. Kosong = semua proyek. */
  namaProyek: string
  onCatat: (baris: RealisasiEntry[]) => void
  onSelesai: () => void
}) {
  const { toast } = useToast()
  const [proses, setProses] = useState('')

  const usul = useMemo(
    () => usulUntukProyek(penerimaanBelumTercatat(dos, pos, entries, bayar), namaProyek),
    [dos, pos, entries, bayar, namaProyek],
  )

  if (usul.length === 0) return null

  function catat(u: UsulDariPo) {
    setProses(u.suratJalan.id)
    try {
      onCatat(u.entri.map((e, i) => ({
        ...e,
        id: `${u.suratJalan.id}-${i}-${Date.now()}`,
      })) as RealisasiEntry[])
      toast({
        title: `${u.entri.length} baris dicatat`,
        description: `Dari ${u.po.nomor}. Stoknya tidak dihitung ulang — yang menambah stok surat jalannya.`,
      })
      onSelesai()
    } finally { setProses('') }
  }

  return (
    <div data-panel-procurement className="bg-white rounded-3xl border border-gold/40 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-lg bg-gold/15 text-navy grid place-items-center shrink-0">
          <Truck className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-navy text-sm">Sudah ada di Procurement</p>
          <p className="text-[11px] text-muted-foreground">{ringkasUsul(usul)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {usul.map(u => (
          <div key={u.suratJalan.id} className={`rounded-xl border p-3 space-y-2 ${
            poTanpaProyek(u.po) ? 'border-amber-300 bg-amber-50/40' : 'border-border'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-navy truncate">
                  {u.po.nomor} · {u.po.vendor_nama}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {u.suratJalan.nomor_do}
                  {u.suratJalan.nomor_nota ? ` · nota ${u.suratJalan.nomor_nota}` : ''}
                  {' · '}{u.entri.length} barang
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-navy">{fmt(u.total)}</p>
                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full
                  ${TONE_STATUS_BAYAR[u.status]}`}>
                  {LABEL_STATUS_BAYAR[u.status]}
                </span>
              </div>
            </div>

            {/* PO yang belum menyebut proyek tetap ditawarkan — menyembunyikan-
                nya membuatnya tidak bisa dicatat dari layar mana pun, dan data
                lama banyak yang begini. Tetapi ia DITANDAI, karena hanya ia
                yang bisa muncul di dua proyek sekaligus. */}
            {poTanpaProyek(u.po) && (
              <p className="flex items-start gap-1.5 text-[10px] font-bold text-amber-900">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                {peringatanTanpaProyek(u.po.nomor)}
              </p>
            )}

            {/* Hutangnya disebut di sini juga. Yang mencatat biayanya sering
                orang yang sama dengan yang mengurus pembayarannya, dan angka
                sisa di depan mata menghemat satu perjalanan ke tab lain. */}
            {u.status !== 'lunas' && (
              <p className="flex items-center gap-1.5 text-[10px] font-bold text-amber-800">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                Belum lunas — sisa {fmt(u.sisa)}
              </p>
            )}

            <div className="text-[10px] text-muted-foreground space-y-0.5">
              {u.entri.map((e, i) => (
                <p key={i} className="truncate">
                  • {e.namaMaterial} — {e.volume} {e.satuan} × {fmt(e.hargaSatuan ?? 0)}
                  {(e.hargaSatuan ?? 0) === 0 && (
                    <span className="text-amber-700 font-bold"> (harga belum ada di PO)</span>
                  )}
                </p>
              ))}
            </div>

            <button
              data-catat-dari-po
              onClick={() => catat(u)}
              disabled={proses !== ''}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-navy
                text-white px-3 py-2 text-xs font-bold disabled:opacity-50">
              {proses === u.suratJalan.id
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Plus className="w-3.5 h-3.5" />}
              Catat ke buku pengeluaran
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
