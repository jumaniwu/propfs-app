// ============================================================
// KIRIM INVOICE — HALAMAN UNTUK VENDOR (publik, tanpa login)
//
// Tautan kedua di dalam pesan WhatsApp yang sama dengan PO-nya. Sebelum ini
// tagihan vendor beredar sebagai foto di grup WhatsApp, dan yang memutuskan
// pembayaran harus mencarinya kembali di gulungan chat lalu mengetik ulang
// isinya.
//
// Yang diminta dari vendor cuma satu: unggah foto atau PDF tagihannya. AI yang
// mengisi kolom-kolomnya. Tetapi hasil bacaan AI TIDAK PERNAH langsung
// dikirim — vendor melihat dan membetulkannya dulu. Ia yang paling tahu isi
// tagihannya sendiri, dan satu angka yang salah baca di sini menjadi salah
// bayar di ujung sana.
//
// Vendor tidak punya akun. Izin memakai AI datang dari token di dalam
// tautannya, dan izin itu jauh lebih sempit daripada izin pengguna: hanya
// model Flash, berjatah, dan mati begitu tagihannya terkirim.
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Loader2, Upload, FileText, ImageIcon, CheckCircle2, Sparkles, X, AlertTriangle,
} from 'lucide-react'
import { procurementApi, type FormInvoicePublik } from '@/lib/procurementApi'
import { pakaiUndangan, lupakanUndangan, panggilGemini } from '@/lib/gemini'
import { MODEL_UTAMA } from '@/lib/modelAi'
import { kecilkanFoto, ukuranTampil, byteBase64 } from '@/lib/kompresFoto'
import { diagnosaAi } from '@/lib/diagnosaAi'
import {
  INVOICE_KOSONG, uraikanInvoiceAi, hitungTotalInvoice, bandingkanDenganPo,
  siapDikirim, perintahBacaInvoice, angkaRupiah,
  type InvoiceVendor, type ItemInvoice,
} from '@/lib/invoiceVendor'
import { teksTerm, type TermPembayaran } from '@/lib/procurement'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`
const inputCls = 'w-full rounded-xl border border-border bg-white px-3 py-2 text-sm '
  + 'focus:outline-none focus:ring-2 focus:ring-gold/40'

export default function InvoiceKirimPage() {
  const { token = '' } = useParams()
  const [form, setForm] = useState<FormInvoicePublik | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  const [berkas, setBerkas] = useState<{
    nama: string; mime: string; data: string; ukuran: string
  } | null>(null)
  const [membaca, setMembaca] = useState(false)
  const [pesanAi, setPesanAi] = useState('')
  const [inv, setInv] = useState<InvoiceVendor>(INVOICE_KOSONG)
  const [mengirim, setMengirim] = useState(false)
  const [terkirim, setTerkirim] = useState(false)

  // Token undangannya dipasang selama halaman ini terbuka saja. Meninggalkannya
  // terpasang berarti tab lain milik orang yang sama ikut memakai izin tamu
  // yang sempit itu, padahal ia mungkin punya sesi penuh.
  useEffect(() => {
    pakaiUndangan(token)
    return () => lupakanUndangan()
  }, [token])

  useEffect(() => {
    let hidup = true
    procurementApi().invoiceFormByToken(token)
      .then(f => {
        if (!hidup) return
        if (!f) setGalat('Tautan ini sudah tidak berlaku, atau tagihannya sudah pernah dikirim.')
        else setForm(f)
      })
      .catch(() => hidup && setGalat('Tidak bisa membuka tautan ini. Coba lagi sebentar.'))
      .finally(() => hidup && setMemuat(false))
    return () => { hidup = false }
  }, [token])

  const selisih = useMemo(
    () => (form ? bandingkanDenganPo(inv, form.items, form.total) : []),
    [inv, form],
  )
  const siap = siapDikirim(inv)

  function ubah<K extends keyof InvoiceVendor>(k: K, v: InvoiceVendor[K]) {
    setInv(s => ({ ...s, [k]: v }))
  }
  function ubahItem(i: number, patch: Partial<ItemInvoice>) {
    setInv(s => {
      const items = s.items.map((it, j) => {
        if (j !== i) return it
        const baru = { ...it, ...patch }
        // Subtotal ikut bila qty atau harga yang diubah — tetapi tidak bila
        // subtotalnya sendiri yang sedang diketik: nota memang sering memuat
        // potongan yang tidak sama dengan qty x harga.
        if (patch.qty !== undefined || patch.harga !== undefined) {
          baru.subtotal = (Number(baru.qty) || 0) * (Number(baru.harga) || 0)
        }
        return baru
      })
      const t = hitungTotalInvoice(items, s.ppn)
      return { ...s, items, subtotal: t.subtotal, total: t.total }
    })
  }
  function hapusItem(i: number) {
    setInv(s => {
      const items = s.items.filter((_, j) => j !== i)
      const t = hitungTotalInvoice(items, s.ppn)
      return { ...s, items, subtotal: t.subtotal, total: t.total }
    })
  }
  function tambahItem() {
    setInv(s => ({ ...s, items: [...s.items, { nama: '', satuan: 'unit', qty: 0, harga: 0, subtotal: 0 }] }))
  }

  async function pilihBerkas(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 25 * 1024 * 1024) {
      setPesanAi('Berkasnya terlalu besar (maksimal 25 MB).')
      return
    }
    setPesanAi('')
    const { base64Data, mimeType } = await kecilkanFoto(f)
    const byte = byteBase64(base64Data)
    const b = { nama: f.name, mime: mimeType, data: base64Data, ukuran: ukuranTampil(byte) }
    setBerkas(b)
    await bacaDenganAi(b)
  }

  async function bacaDenganAi(b: { nama: string; mime: string; data: string }) {
    if (!form) return
    setMembaca(true)
    setPesanAi('')
    try {
      const res = await panggilGemini(MODEL_UTAMA, {
        systemInstruction: { parts: [{ text: perintahBacaInvoice(form.items) }] },
        contents: [{
          role: 'user',
          parts: [
            { text: 'Baca invoice pada lampiran ini dan keluarkan JSON-nya.' },
            { inlineData: { data: b.data, mimeType: b.mime } },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      })
      if (!res.ok) {
        const badan = await res.text().catch(() => '')
        const dg = diagnosaAi(res.status, badan)
        // Vendor tidak bisa mengerjakan apa pun terhadap setelan kami, jadi ia
        // tidak diberi langkah yang bukan urusannya — hanya jalan keluarnya.
        setPesanAi(dg.sisiKami
          ? 'Pembacaan otomatis sedang tidak bisa dipakai. Silakan isi kolomnya sendiri di bawah — '
            + 'tagihannya tetap bisa dikirim.'
          : `${dg.apa} Silakan isi kolomnya sendiri di bawah.`)
        return
      }
      const data = await res.json()
      const teks = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      const hasil = uraikanInvoiceAi(teks)
      if (!hasil) {
        setPesanAi('Tulisan pada berkasnya belum terbaca. Coba foto ulang lebih terang, '
          + 'atau isi kolomnya sendiri di bawah.')
        return
      }
      const t = hitungTotalInvoice(hasil.items, hasil.ppn)
      setInv(s => ({
        ...hasil,
        // Nama pengirim tidak pernah ada di dokumen; kalau sudah diketik,
        // jangan dihapus hanya karena berkasnya dibaca ulang.
        dikirim_oleh: s.dikirim_oleh || hasil.dikirim_oleh,
        subtotal: t.subtotal,
        total: hasil.total || t.total,
      }))
      setPesanAi('Sudah terisi dari berkasnya. Mohon diperiksa — bila ada yang keliru, '
        + 'langsung betulkan di kolomnya.')
    } catch (e) {
      setPesanAi(e instanceof Error && /waktu/i.test(e.message)
        ? 'Pembacaan otomatis terlalu lama. Silakan isi kolomnya sendiri di bawah.'
        : 'Pembacaan otomatis gagal. Silakan isi kolomnya sendiri di bawah.')
    } finally { setMembaca(false) }
  }

  async function kirim() {
    if (!siap.boleh) return
    setMengirim(true)
    try {
      const id = await procurementApi().kirimInvoice(token, {
        ...inv,
        berkas_nama: berkas?.nama ?? '',
        berkas_mime: berkas?.mime ?? '',
        berkas_data: berkas?.data ?? '',
      })
      if (!id) throw new Error('Tautan ini sudah tidak berlaku, atau tagihannya sudah pernah dikirim.')
      setTerkirim(true)
    } catch (e) {
      setPesanAi(e instanceof Error ? e.message : 'Gagal mengirim. Coba lagi sebentar.')
    } finally { setMengirim(false) }
  }

  if (memuat) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-navy" />
      </div>
    )
  }
  if (galat || !form) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="max-w-sm text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
          <p className="font-bold text-navy">{galat || 'Tautan tidak ditemukan.'}</p>
          <p className="text-sm text-muted-foreground">
            Silakan hubungi pengirim PO untuk mendapatkan tautan baru.
          </p>
        </div>
      </div>
    )
  }
  if (terkirim) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div data-invoice-terkirim className="max-w-sm text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
          <p className="font-serif text-xl font-bold text-navy">Tagihan sudah kami terima</p>
          <p className="text-sm text-muted-foreground">
            Tagihan untuk <b>{form.po_nomor}</b> sebesar <b>{fmt(inv.total)}</b> sudah masuk ke
            sistem dan langsung terlihat oleh bagian keuangan. Tautan ini tidak berlaku lagi.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="bg-navy text-white rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-wide opacity-70">Kirim Tagihan</p>
          <p className="font-serif text-xl font-bold">{form.po_nomor}</p>
          <p className="text-xs opacity-80 mt-1">
            {form.vendor_nama}
            {form.project_name ? ` · ${form.project_name}` : ''}
          </p>
          <p className="text-xs opacity-80">
            Nilai PO {fmt(form.total)} · {teksTerm(form.term as TermPembayaran, form.term_hari)}
          </p>
        </div>

        {form.sudah_dikirim > 0 && (
          <p className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3">
            Sudah pernah ada {form.sudah_dikirim} tagihan untuk PO ini.
          </p>
        )}

        {/* ── Unggah ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold" />
            <p className="font-bold text-navy text-sm">Foto atau PDF tagihannya</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Cukup unggah sekali — kolom di bawah terisi sendiri. Kalau ada yang keliru terbaca,
            langsung betulkan; yang Anda ketik yang dipakai.
          </p>

          {!berkas ? (
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2
              border-dashed border-border py-8 cursor-pointer hover:bg-slate-50 transition-colors">
              <Upload className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm font-bold text-navy">Pilih foto / PDF</span>
              <span className="text-[11px] text-muted-foreground">maksimal 25 MB</span>
              <input data-unggah-invoice type="file" accept="image/*,application/pdf"
                className="hidden" onChange={e => void pilihBerkas(e)} />
            </label>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-border p-2.5">
              {berkas.mime.startsWith('image/')
                ? <ImageIcon className="w-4 h-4 text-navy shrink-0" />
                : <FileText className="w-4 h-4 text-navy shrink-0" />}
              <span className="text-xs truncate flex-1">{berkas.nama}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{berkas.ukuran}</span>
              <button onClick={() => setBerkas(null)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {membaca && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sedang membaca tagihannya…
            </p>
          )}
          {pesanAi && !membaca && (
            <p className="text-xs bg-slate-50 border border-border rounded-xl p-2.5">{pesanAi}</p>
          )}
        </div>

        {/* ── Isian ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
          <p className="font-bold text-navy text-sm">Rincian tagihan</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">Nomor invoice</span>
              <input data-inv-nomor className={inputCls} value={inv.nomor_invoice}
                onChange={e => ubah('nomor_invoice', e.target.value)} placeholder="INV/2026/0123" />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">Tanggal</span>
              <input type="date" className={inputCls} value={inv.tanggal}
                onChange={e => ubah('tanggal', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">Jatuh tempo</span>
              <input type="date" className={inputCls} value={inv.jatuh_tempo}
                onChange={e => ubah('jatuh_tempo', e.target.value)} />
            </label>
          </div>

          <div className="space-y-2">
            {inv.items.map((it, i) => (
              <div key={i} data-inv-item className="rounded-xl border border-border p-2.5 space-y-2">
                <div className="flex gap-2">
                  <input className={inputCls} value={it.nama} placeholder="Nama barang"
                    onChange={e => ubahItem(i, { nama: e.target.value })} />
                  <button onClick={() => hapusItem(i)}
                    className="p-2 text-muted-foreground hover:text-rose-600 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input className={inputCls} inputMode="decimal" value={it.qty || ''} placeholder="Qty"
                    onChange={e => ubahItem(i, { qty: angkaRupiah(e.target.value) })} />
                  <input className={inputCls} value={it.satuan} placeholder="Satuan"
                    onChange={e => ubahItem(i, { satuan: e.target.value })} />
                  <input className={inputCls} inputMode="decimal" value={it.harga || ''} placeholder="Harga"
                    onChange={e => ubahItem(i, { harga: angkaRupiah(e.target.value) })} />
                </div>
                <p className="text-[11px] text-right text-muted-foreground">
                  Subtotal <b className="text-navy">{fmt(it.subtotal)}</b>
                </p>
              </div>
            ))}
            <button onClick={tambahItem}
              className="w-full text-xs font-bold text-navy border border-dashed border-border
                rounded-xl py-2 hover:bg-slate-50">
              + Tambah baris
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">PPN (Rp)</span>
              <input className={inputCls} inputMode="decimal" value={inv.ppn || ''}
                onChange={e => {
                  const p = angkaRupiah(e.target.value)
                  const t = hitungTotalInvoice(inv.items, p)
                  setInv(s => ({ ...s, ppn: p, subtotal: t.subtotal, total: t.total }))
                }} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">Total tagihan</span>
              <input data-inv-total className={`${inputCls} font-bold`} inputMode="decimal"
                value={inv.total || ''} onChange={e => ubah('total', angkaRupiah(e.target.value))} />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-muted-foreground">Nama pengirim</span>
            <input data-inv-pengirim className={inputCls} value={inv.dikirim_oleh}
              onChange={e => ubah('dikirim_oleh', e.target.value)} placeholder="Nama Anda" />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-muted-foreground">Catatan (opsional)</span>
            <input className={inputCls} value={inv.catatan}
              onChange={e => ubah('catatan', e.target.value)} />
          </label>
        </div>

        {/* Selisih terhadap PO diperlihatkan KEPADA VENDOR juga, bukan hanya
            kepada kami. Vendor sering bisa menjelaskannya di tempat — dan
            selisih yang sudah dijelaskan tidak perlu menahan pembayaran
            berhari-hari sambil saling menunggu kabar. */}
        {selisih.length > 0 && (
          <div data-inv-selisih className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-1.5">
            <p className="text-sm font-bold text-amber-900">Berbeda dengan PO</p>
            <ul className="space-y-1">
              {selisih.map((s, i) => (
                <li key={i} className="text-xs text-amber-900 leading-relaxed">• {s.pesan}</li>
              ))}
            </ul>
            <p className="text-[11px] text-amber-800 pt-1">
              Tagihannya tetap bisa dikirim. Tuliskan sebabnya di catatan supaya tidak perlu
              ditanyakan ulang.
            </p>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-border p-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">Total tagihan</p>
            <p className="font-bold text-navy truncate">{fmt(inv.total)}</p>
          </div>
          <button data-kirim-invoice onClick={() => void kirim()}
            disabled={!siap.boleh || mengirim || membaca}
            className="rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-navy
              disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
            {mengirim ? 'Mengirim…' : 'Kirim Tagihan'}
          </button>
        </div>
        {/* Tombol mati tanpa alasan membuat orang mencoba menebak, lalu
            menyerah dan mengirim fotonya lewat WhatsApp seperti dulu. */}
        {!siap.boleh && (
          <p className="max-w-lg mx-auto text-[11px] text-muted-foreground pt-1.5">{siap.alasan}</p>
        )}
      </div>
    </div>
  )
}
