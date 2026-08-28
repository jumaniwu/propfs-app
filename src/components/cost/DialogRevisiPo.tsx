// ============================================================
// REVISI PO — menurunkan pesanan ke barang yang benar-benar datang
//
// Dibuka dari kartu penerimaan, tepat di tempat selisihnya terlihat: PO
// memesan 5 ikat kayu, yang datang 2, dan sisanya memang tidak jadi.
//
// Tanpa revisi, PO itu berdiri selamanya di angka 5 — tagihan vendor untuk 2
// ikat terbaca "kurang bayar", sisa hutang yang tidak pernah ada ikut ke
// laporan, dan penerimaannya tidak pernah bisa ditutup.
//
// Dialog ini sengaja MEMBUKA DIRI dengan jawaban yang paling mungkin benar:
// jumlah tiap barang sudah diisi dengan yang benar-benar datang. Yang tersisa
// bagi pemakainya hanyalah membaca, menulis alasan, dan menyimpan.
// ============================================================
import { useMemo, useState } from 'react'
import { Loader2, X, FileWarning, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { procurementApi } from '@/lib/procurementApi'
import { hitungTotalPo, type PoItem, type PurchaseOrder } from '@/lib/procurement'
import { ringkasTerima, type DeliveryOrder } from '@/lib/penerimaan'
import {
  itemRevisiDariKurang, siapRevisiPo, akibatRevisi, perluApprovalUlang,
  nomorPoTampil, revisiKe, satuanDiperbaiki,
} from '@/lib/revisiPo'
import { SATUAN_UMUM } from '@/lib/satuanPo'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`
const angka = (n: number) => (n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })

export default function DialogRevisiPo({ po, dos, namaSaya, onTutup, onSukses }: {
  po: PurchaseOrder
  dos: DeliveryOrder[]
  namaSaya: string
  onTutup: () => void
  onSukses: () => void
}) {
  const { toast } = useToast()

  const terima = useMemo(() => ringkasTerima(po.items, dos), [po.items, dos])

  // Nilai awal: jumlah yang BENAR-BENAR datang. Itulah jawaban yang dicari
  // sembilan dari sepuluh kali revisi dibuka.
  const [items, setItems] = useState<PoItem[]>(
    () => itemRevisiDariKurang(po.items, terima),
  )
  const [alasan, setAlasan] = useState(() => alasanBawaan(terima))
  const [kirim, setKirim] = useState(false)

  const total = useMemo(() => hitungTotalPo(items, po.ppn_pct ?? 0), [items, po.ppn_pct])
  const periksa = useMemo(
    () => siapRevisiPo({ lama: po.items, baru: items, alasan }),
    [po.items, items, alasan],
  )
  const naik = perluApprovalUlang(po.total, total.total)

  /**
   * Memperbaiki satuan.
   *
   * Harga dan jumlah TIDAK ikut disentuh — dan itu bukan kelalaian. Satuan
   * yang salah ketik adalah koreksi pada keterangan, bukan pernyataan bahwa
   * harganya berbeda. Menyesuaikan harga sendiri saat satuannya diganti
   * ("dulu per Kg, sekarang per Kotak, jadi harganya dikali sekian") berarti
   * mengarang angka yang tidak pernah disepakati vendor.
   */
  const ubahSatuan = (i: number, satuan: string) =>
    setItems(list => list.map((it, n) => (n === i ? { ...it, satuan } : it)))

  const ubahQty = (i: number, qty: number) =>
    setItems(list => list.map((it, n) => (n === i
      ? { ...it, qty, subtotal: Math.round(qty * (Number(it.harga) || 0)) }
      : it)))

  async function simpan() {
    if (!periksa.boleh) {
      toast({ title: 'Belum bisa disimpan', description: periksa.alasan, variant: 'destructive' })
      return
    }
    setKirim(true)
    try {
      // Barang berjumlah nol dibuang di sini, bukan di layar: pemakainya perlu
      // MELIHAT bahwa barang itu batal sebelum menyimpan, dan tidak perlu
      // melihatnya lagi setelah PO-nya tercetak.
      const isi = items.filter(it => (Number(it.qty) || 0) > 0)
      const t = hitungTotalPo(isi, po.ppn_pct ?? 0)
      const hasil = await procurementApi().revisiPo(po.id, {
        items: t.items as PoItem[],
        subtotal: t.subtotal, ppn: t.ppn, total: t.total,
        alasan: alasan.trim(), oleh: namaSaya,
      })
      toast({
        title: `✅ PO direvisi — ${po.nomor}-Rev${hasil?.revisi_ke ?? revisiKe(po) + 1}`,
        description: naik
          ? 'Karena totalnya bertambah, PO perlu disetujui ulang sebelum dikirim lagi.'
          : 'Tagihan vendor ikut menyesuaikan. PO ini sudah bisa ditutup.',
      })
      onSukses()
    } catch (e) {
      toast({ title: 'Gagal merevisi', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally { setKirim(false) }
  }

  return (
    // z-[60]: BottomNav berdiri di z-50 dan dirender setelah <Routes>, jadi
    // dialog z-50 kalah oleh urutan DOM dan bagian bawahnya tidak bisa disentuh.
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center"
      role="dialog" aria-modal="true" onClick={onTutup}>
      {/* Tiga baris: kepala tetap, isi bergulung, kaki tetap. `sticky` di dalam
          wadah yang bergulung membuat kakinya menutupi baris terakhir. */}
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-start justify-between gap-2 p-5 pb-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-navy text-sm flex items-center gap-1.5">
              <FileWarning className="w-4 h-4" /> Revisi PO
            </h3>
            <p className="text-[11px] text-muted-foreground truncate">
              {nomorPoTampil(po)} → <b>{po.nomor}-Rev{revisiKe(po) + 1}</b> · {po.vendor_nama}
            </p>
          </div>
          <button onClick={onTutup} aria-label="Tutup"
            className="text-muted-foreground hover:text-navy shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Jumlahnya sudah diisi dengan barang yang <b>benar-benar datang</b>. Periksa,
            lalu simpan — tagihan vendor dan sisa hutang ikut menyesuaikan.
            Harga satuan tidak ikut berubah.
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Salah ketik satuan juga bisa diperbaiki di sini — ketik langsung di
            kolom satuannya.
          </p>

          {/* Saran satuan, dipakai bersama seluruh baris. Hanya saran: satuan
              di lapangan tidak terbatas, dan memaksanya masuk daftar hanya
              membuat orang memilih satuan yang salah supaya formulirnya mau
              lanjut. */}
          <datalist id="satuan-revisi-po">
            {SATUAN_UMUM.map(x => <option key={x} value={x} />)}
          </datalist>

          <div className="space-y-2">
            {items.map((it, i) => {
              const asal = po.items?.[i]
              const lama = Number(asal?.qty) || 0
              const baru = Number(it.qty) || 0
              const satuanBeda = satuanDiperbaiki(asal, it)
              const berubah = lama !== baru || satuanBeda
              return (
                <div key={`${it.nama}-${i}`}
                  className={`rounded-xl border p-2.5 ${berubah ? 'border-amber-300 bg-amber-50/50' : 'border-border'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-navy min-w-0 truncate">{it.nama}</p>
                    <p className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                      {fmt(it.subtotal)}
                    </p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                      {angka(lama)} {asal?.satuan}
                    </span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <input type="number" min={0} step="any" value={baru || ''}
                      onChange={e => ubahQty(i, Number(e.target.value) || 0)}
                      aria-label={`Jumlah revisi ${it.nama}`}
                      className="w-16 h-9 rounded-lg border border-input bg-white px-2 text-sm text-right text-navy" />
                    {/* Satuan kini BISA DIKETIK. Sebelumnya ia hanya tulisan,
                        dan PO yang tertulis "1 Kg paku" padahal yang dipesan
                        "1 Kotak" tidak bisa diperbaiki sama sekali — jumlahnya
                        benar, harganya benar, jadi pemeriksaan perubahan
                        menjawab "tidak ada yang berubah" dan menolak menyimpan
                        sementara dokumen yang dipegang vendor tetap salah. */}
                    <input value={it.satuan ?? ''} list="satuan-revisi-po"
                      onChange={e => ubahSatuan(i, e.target.value)}
                      aria-label={`Satuan revisi ${it.nama}`}
                      placeholder={asal?.satuan || 'satuan'}
                      className="w-20 h-9 rounded-lg border border-input bg-white px-2 text-sm text-navy" />
                    {baru === 0 && (
                      <span className="text-[10px] font-bold text-rose-600 ml-auto shrink-0">batal</span>
                    )}
                  </div>

                  {satuanBeda && (
                    <p className="mt-1.5 text-[10px] leading-relaxed text-amber-900 bg-amber-100/70 rounded-lg px-2 py-1">
                      Satuan diperbaiki: <b>{asal?.satuan}</b> → <b>{it.satuan}</b>.
                      Harga satuan tidak ikut diubah.
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="rounded-xl bg-slate-50 p-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total sebelumnya</span>
              <span className="tabular-nums text-muted-foreground line-through">{fmt(po.total)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-border">
              <span className="font-bold text-navy text-sm">Total setelah revisi</span>
              <span className="font-black text-navy text-base tabular-nums">{fmt(total.total)}</span>
            </div>
            <p className={`text-[11px] leading-relaxed pt-1 ${naik ? 'text-amber-800' : 'text-muted-foreground'}`}>
              {akibatRevisi(po.total, total.total)}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground">Alasan revisi *</label>
            <textarea value={alasan} onChange={e => setAlasan(e.target.value)} rows={2}
              placeholder="mis. Kayu 2x2 datang 2 dari 5, sisanya dibatalkan vendor"
              className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-navy" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Tersimpan bersama angka sebelumnya. Enam bulan lagi, inilah satu-satunya
              yang menjelaskan kenapa PO ini berbeda dari yang dipegang vendor.
            </p>
          </div>
        </div>

        <div className="p-5 pt-3 border-t border-border shrink-0 space-y-2">
          {!periksa.boleh && <p className="text-[11px] text-red-600">{periksa.alasan}</p>}
          <div className="flex gap-2">
            <Button onClick={simpan} disabled={kirim || !periksa.boleh}
              className="flex-1 gap-2 bg-navy hover:bg-navy/90 font-bold">
              {kirim ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileWarning className="w-4 h-4" />}
              Simpan Revisi
            </Button>
            <Button onClick={onTutup} variant="outline" disabled={kirim} className="font-bold">Batal</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Alasan yang sudah setengah tertulis, disusun dari selisihnya sendiri.
 *
 * Bukan untuk menghemat ketikan, melainkan supaya alasannya berisi ANGKA.
 * "Barang kurang" tidak menjelaskan apa pun enam bulan kemudian; "Kayu uk 2x2
 * datang 2 dari 5" menjelaskan seluruhnya.
 */
function alasanBawaan(terima: Array<{ nama: string; dipesan: number; diterima: number; kurang: number }>): string {
  const kurang = terima.filter(t => t.kurang > 0)
  if (kurang.length === 0) return ''
  return kurang
    .slice(0, 3)
    .map(t => `${t.nama} datang ${angka(t.diterima)} dari ${angka(t.dipesan)}`)
    .join('; ')
    + (kurang.length > 3 ? `; dan ${kurang.length - 3} barang lain` : '')
}
