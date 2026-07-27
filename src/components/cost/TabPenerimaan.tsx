// ============================================================
// PENERIMAAN BARANG (DO) — sub-tab Procurement
//
// Menyambung PO yang sudah dikirim ke vendor dengan kenyataan di lapangan:
// barangnya datang, surat jalannya difoto, AI membacanya jadi nomor DO,
// nomor nota, tanggal nota, dan qty yang benar-benar datang.
//
// Tanggal nota yang tercatat di sini yang memulai hitungan jatuh tempo di
// Akuntan — itulah sebabnya kolomnya ditandai penting, bukan sekadar pelengkap.
// ============================================================
import { useMemo, useRef, useState } from 'react'
import {
  Truck, Camera, Loader2, Plus, X, Trash2, Sparkles, AlertTriangle, PackageCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { downscaleImage } from '@/lib/imageUtil'
import { bacaNotaDo } from '@/lib/ai-do'
import { penerimaanApi } from '@/lib/penerimaanApi'
import {
  doMilikPo, ringkasTerima, statusTerima, nomorDo,
  LABEL_STATUS_TERIMA, TONE_STATUS_TERIMA,
  type DeliveryOrder, type DoItem,
} from '@/lib/penerimaan'
import type { PurchaseOrder } from '@/lib/procurement'

const inputCls = 'w-full h-10 rounded-lg border border-input bg-white px-3 text-sm text-navy'
const angka = (n: number) => (n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })
const hariIni = () => new Date().toISOString().slice(0, 10)

/** Hanya PO yang sudah dikirim ke vendor yang barangnya masuk akal datang. */
const STATUS_BISA_TERIMA = new Set(['terkirim', 'selesai'])

export default function TabPenerimaan({ pos, dos, bolehUbah, onUbah }: {
  pos: PurchaseOrder[]
  dos: DeliveryOrder[]
  bolehUbah: boolean
  onUbah: () => void
}) {
  const { toast } = useToast()
  const [formPoId, setFormPoId] = useState<string | null>(null)

  const poTerkirim = useMemo(
    () => pos.filter(p => STATUS_BISA_TERIMA.has(p.status)),
    [pos],
  )

  async function hapusDo(d: DeliveryOrder) {
    if (!window.confirm(`Hapus catatan penerimaan ${d.nomor_do || d.nomor_nota || 'ini'}?`)) return
    try {
      await penerimaanApi().deleteDo(d.id)
      toast({ title: 'Catatan penerimaan dihapus' })
      onUbah()
    } catch (e) {
      toast({ title: 'Gagal menghapus', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  if (poTerkirim.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-border p-12 text-center">
        <Truck className="w-10 h-10 mx-auto opacity-30 mb-3" />
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Belum ada PO yang dikirim ke vendor. Penerimaan barang bisa dicatat setelah
          PO ditandatangani, disetujui, lalu dikirim.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {poTerkirim.map(po => {
        const milik = doMilikPo(po.id, dos)
        const st = statusTerima(po.items, milik)
        const rincian = ringkasTerima(po.items, milik)
        const kurang = rincian.filter(r => r.kurang > 0)

        return (
          <div key={po.id} className="bg-white rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-navy text-sm truncate">{po.nomor}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {po.vendor_nama}{po.project_name && ` · ${po.project_name}`}
                </p>
              </div>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${TONE_STATUS_TERIMA[st]}`}>
                {LABEL_STATUS_TERIMA[st]}
              </span>
            </div>

            {/* Rincian dipesan vs datang — inti dari halaman ini */}
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-muted-foreground">
                  <tr>
                    <th className="text-left font-bold px-2.5 py-1.5">Barang</th>
                    <th className="text-right font-bold px-2 py-1.5">Pesan</th>
                    <th className="text-right font-bold px-2 py-1.5">Datang</th>
                    <th className="text-right font-bold px-2.5 py-1.5">Kurang</th>
                  </tr>
                </thead>
                <tbody>
                  {rincian.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2.5 py-1.5 text-navy">{r.nama}</td>
                      <td className="px-2 py-1.5 text-right">{angka(r.dipesan)} {r.satuan}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-navy">{angka(r.diterima)}</td>
                      <td className={`px-2.5 py-1.5 text-right font-bold ${r.kurang > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {r.kurang > 0 ? angka(r.kurang) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Riwayat DO */}
            {milik.length > 0 && (
              <div className="space-y-1.5">
                {milik.map(d => (
                  <div key={d.id} className="flex items-start gap-2 text-[11px] bg-slate-50 rounded-lg px-2.5 py-2">
                    <PackageCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-navy font-bold">
                        {d.nomor_do || '(tanpa nomor DO)'}
                        {d.nomor_nota && <span className="font-normal text-muted-foreground"> · Nota {d.nomor_nota}</span>}
                      </p>
                      <p className="text-muted-foreground">
                        Diterima {d.tanggal_terima}{d.penerima && ` oleh ${d.penerima}`}
                        {d.tanggal_nota
                          ? ` · Nota ${d.tanggal_nota}`
                          : ' · nota belum ada, tempo belum berjalan'}
                      </p>
                      {d.items.length > 0 && (
                        <p className="text-muted-foreground truncate">
                          {d.items.map(i => `${i.nama} ${angka(i.qty)}${i.satuan ? ' ' + i.satuan : ''}`).join(', ')}
                        </p>
                      )}
                      {d.foto.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {d.foto.map((f, i) => (
                            <img key={i} src={f} alt="" className="w-10 h-10 rounded object-cover border border-border" />
                          ))}
                        </div>
                      )}
                    </div>
                    {bolehUbah && (
                      <button onClick={() => hapusDo(d)} className="text-muted-foreground hover:text-rose-600 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {bolehUbah && (
              formPoId === po.id ? (
                <FormDo
                  po={po}
                  jumlahDo={dos.length}
                  sisaKurang={kurang}
                  onBatal={() => setFormPoId(null)}
                  onSukses={() => { setFormPoId(null); onUbah() }}
                />
              ) : (
                <Button size="sm" onClick={() => setFormPoId(po.id)}
                  className="h-8 text-[11px] gap-1.5 bg-navy hover:bg-navy/90 font-bold">
                  <Plus className="w-3.5 h-3.5" /> Catat Barang Datang
                </Button>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}

// ══ Form pencatatan DO ══════════════════════════════════════════════════════
function FormDo({ po, jumlahDo, sisaKurang, onBatal, onSukses }: {
  po: PurchaseOrder
  jumlahDo: number
  sisaKurang: Array<{ nama: string; satuan: string; kurang: number }>
  onBatal: () => void
  onSukses: () => void
}) {
  const { toast } = useToast()
  const berkasRef = useRef<HTMLInputElement>(null)

  // Nilai awal: seluruh sisa yang belum datang. Kebanyakan pengiriman memang
  // melunasi sisanya, jadi ini menghemat pengetikan; angkanya tetap bisa diubah.
  const [items, setItems] = useState<DoItem[]>(() =>
    (sisaKurang.length > 0 ? sisaKurang : po.items.map(i => ({ nama: i.nama, satuan: i.satuan, kurang: i.qty })))
      .map(r => ({ nama: r.nama, satuan: r.satuan, qty: r.kurang })))

  const [nomorDoTeks, setNomorDoTeks] = useState(() => nomorDo(jumlahDo))
  const [nomorNota, setNomorNota] = useState('')
  const [tanggalNota, setTanggalNota] = useState('')
  const [tanggalTerima, setTanggalTerima] = useState(hariIni())
  const [penerima, setPenerima] = useState('')
  const [catatan, setCatatan] = useState('')
  const [foto, setFoto] = useState<string[]>([])
  const [membaca, setMembaca] = useState(false)
  const [kirim, setKirim] = useState(false)

  function ubahItem(i: number, patch: Partial<DoItem>) {
    setItems(p => p.map((it, n) => (n === i ? { ...it, ...patch } : it)))
  }

  async function pilihFoto(files: FileList | null) {
    if (!files?.length) return
    try {
      const baru = await Promise.all(Array.from(files).slice(0, 4).map(f => downscaleImage(f)))
      setFoto(p => [...p, ...baru].slice(0, 4))
    } catch (e) {
      toast({ title: 'Gagal memuat foto', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      if (berkasRef.current) berkasRef.current.value = ''
    }
  }

  async function bacaOtomatis() {
    if (foto.length === 0) {
      toast({ title: 'Lampirkan foto surat jalan dulu', variant: 'destructive' })
      return
    }
    setMembaca(true)
    try {
      const berkas = foto.map(f => ({
        mimeType: (f.match(/^data:([^;]+);/)?.[1]) ?? 'image/jpeg',
        base64Data: f.split(',')[1] ?? '',
      }))
      const hasil = await bacaNotaDo(berkas, po.items.map(i => i.nama))

      // Hasil AI hanya MENGISI yang masih kosong, tidak menimpa yang sudah
      // diketik — pengguna yang sudah membetulkan angka tidak boleh dianulir.
      if (hasil.nomor_do) setNomorDoTeks(v => (v && !v.startsWith('DO/') ? v : hasil.nomor_do))
      if (hasil.nomor_nota) setNomorNota(v => v || hasil.nomor_nota)
      if (hasil.tanggal_nota) setTanggalNota(v => v || hasil.tanggal_nota!)
      if (hasil.catatan) setCatatan(v => v || hasil.catatan)

      if (hasil.items.length > 0) {
        setItems(prev => {
          const out = [...prev]
          for (const it of hasil.items) {
            const k = it.nama.trim().toLowerCase()
            const idx = out.findIndex(o => o.nama.trim().toLowerCase() === k)
            if (idx >= 0) out[idx] = { ...out[idx], qty: it.qty }
            else out.push(it)   // barang di nota yang tidak ada di PO tetap dicatat
          }
          return out
        })
      }

      const terbaca = [
        hasil.nomor_do && 'nomor DO', hasil.nomor_nota && 'nomor nota',
        hasil.tanggal_nota && 'tanggal nota',
        hasil.items.length > 0 && `${hasil.items.length} barang`,
      ].filter(Boolean).join(', ')
      toast({
        title: terbaca ? 'Dokumen terbaca' : 'Tidak ada data yang terbaca',
        description: terbaca ? `Terisi: ${terbaca}. Periksa lagi sebelum menyimpan.` : 'Isi datanya manual saja.',
      })
    } catch (e) {
      toast({ title: 'Gagal membaca', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally { setMembaca(false) }
  }

  async function simpan() {
    const isi = items.filter(i => i.nama.trim() && i.qty > 0)
    if (isi.length === 0) {
      toast({ title: 'Isi minimal satu barang dengan jumlah lebih dari 0', variant: 'destructive' })
      return
    }
    setKirim(true)
    try {
      await penerimaanApi().createDo({
        po_id: po.id,
        nomor_do: nomorDoTeks.trim(),
        nomor_nota: nomorNota.trim(),
        tanggal_nota: tanggalNota || null,
        tanggal_terima: tanggalTerima || hariIni(),
        penerima: penerima.trim(),
        items: isi.map(i => ({ ...i, nama: i.nama.trim(), satuan: i.satuan.trim() })),
        catatan: catatan.trim(),
        foto,
      })
      toast({
        title: 'Penerimaan barang tercatat',
        description: tanggalNota
          ? 'Jatuh tempo mulai dihitung dari tanggal notanya.'
          : 'Tanggal nota belum diisi — tempo belum berjalan.',
      })
      onSukses()
    } catch (e) {
      toast({ title: 'Gagal menyimpan', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally { setKirim(false) }
  }

  return (
    <div className="rounded-xl border-2 border-gold/40 p-3.5 space-y-3 bg-slate-50/60">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-navy text-sm">Catat Barang Datang</h4>
        <button onClick={onBatal} className="text-muted-foreground hover:text-navy"><X className="w-4 h-4" /></button>
      </div>

      {/* Foto + baca otomatis */}
      <div>
        <span className="block text-[11px] font-bold text-muted-foreground mb-1">Foto surat jalan / nota</span>
        <div className="flex gap-2 flex-wrap items-center">
          {foto.map((f, i) => (
            <div key={i} className="relative">
              <img src={f} alt="" className="w-14 h-14 rounded-lg object-cover border border-border" />
              <button onClick={() => setFoto(p => p.filter((_, n) => n !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {foto.length < 4 && (
            <button onClick={() => berkasRef.current?.click()}
              className="w-14 h-14 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-navy hover:text-navy">
              <Camera className="w-5 h-5" />
            </button>
          )}
          <input ref={berkasRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => pilihFoto(e.target.files)} />
          <Button size="sm" variant="outline" disabled={membaca || foto.length === 0}
            onClick={bacaOtomatis} className="h-9 text-[11px] gap-1.5 font-bold">
            {membaca ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Baca Otomatis
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5">
        <label className="block">
          <span className="block text-[11px] font-bold text-muted-foreground mb-1">Nomor surat jalan / DO</span>
          <input value={nomorDoTeks} onChange={e => setNomorDoTeks(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-[11px] font-bold text-muted-foreground mb-1">Nomor nota / invoice</span>
          <input value={nomorNota} onChange={e => setNomorNota(e.target.value)}
            placeholder="mis. INV-2026-081" className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-[11px] font-bold text-muted-foreground mb-1">
            Tanggal nota <span className="text-gold">· awal jatuh tempo</span>
          </span>
          <input type="date" value={tanggalNota} onChange={e => setTanggalNota(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-[11px] font-bold text-muted-foreground mb-1">Tanggal barang diterima</span>
          <input type="date" value={tanggalTerima} onChange={e => setTanggalTerima(e.target.value)} className={inputCls} />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-[11px] font-bold text-muted-foreground mb-1">Diterima oleh</span>
          <input value={penerima} onChange={e => setPenerima(e.target.value)}
            placeholder="Nama penerima di lapangan" className={inputCls} />
        </label>
      </div>

      {!tanggalNota && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-relaxed flex gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          Tanpa tanggal nota, PO ini belum punya jatuh tempo dan tidak akan muncul
          sebagai tagihan di Akuntan. Isi bila vendor sudah menyerahkan notanya.
        </p>
      )}

      {/* Qty yang datang */}
      <div>
        <span className="block text-[11px] font-bold text-muted-foreground mb-1">Jumlah yang datang</span>
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input value={it.nama} onChange={e => ubahItem(i, { nama: e.target.value })}
                className={`${inputCls} flex-1`} placeholder="Nama barang" />
              <input type="number" min={0} step="any" value={it.qty || ''}
                onChange={e => ubahItem(i, { qty: Number(e.target.value) || 0 })}
                className={`${inputCls} w-20 text-right`} placeholder="0" />
              <input value={it.satuan} onChange={e => ubahItem(i, { satuan: e.target.value })}
                className={`${inputCls} w-16`} placeholder="sat" />
              <button onClick={() => setItems(p => p.filter((_, n) => n !== i))}
                className="text-muted-foreground hover:text-rose-600 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => setItems(p => [...p, { nama: '', satuan: '', qty: 0 }])}
          className="text-[11px] font-bold text-navy hover:underline mt-1.5">+ Tambah baris</button>
      </div>

      <label className="block">
        <span className="block text-[11px] font-bold text-muted-foreground mb-1">Catatan</span>
        <input value={catatan} onChange={e => setCatatan(e.target.value)}
          placeholder="mis. 2 sak sobek, sudah diganti" className={inputCls} />
      </label>

      <div className="flex gap-2">
        <Button onClick={simpan} disabled={kirim} className="gap-2 bg-navy hover:bg-navy/90 font-bold">
          {kirim ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
          Simpan Penerimaan
        </Button>
        <Button onClick={onBatal} variant="outline" disabled={kirim} className="font-bold">Batal</Button>
      </div>
    </div>
  )
}
