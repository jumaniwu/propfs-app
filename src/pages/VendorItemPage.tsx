// ============================================================
// VENDOR — PERBARUI DAFTAR BARANG (publik, lewat tautan pribadi)
// Vendor yang sudah mendaftar kembali lewat tautan /vendor/item/:token untuk
// mengubah harga atau menambah/menghapus barang. Profilnya hanya ditampilkan
// (diubah lewat perusahaan) supaya tautan yang tersebar tidak bisa dipakai
// mengganti identitas vendor.
// ============================================================
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Package, Plus, Trash2, Loader2, CheckCircle2, Store } from 'lucide-react'
import { procurementApi, type ItemVendorPublik } from '@/lib/procurementApi'
import { teksTerm, LABEL_STATUS_VENDOR, type StatusVendor, type TermPembayaran } from '@/lib/procurement'

const itemKosong: ItemVendorPublik = {
  nama: '', satuan: '', harga: 0, merek: '', min_order: 0, catatan: '',
}
const inputCls = 'w-full h-11 rounded-xl border border-input bg-white px-3 text-sm text-navy placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold'

interface Profil {
  nama: string; pic: string; no_wa: string; kategori: string
  term: TermPembayaran; term_hari: number; status: StatusVendor
}

export default function VendorItemPage() {
  const { token = '' } = useParams()
  const [profil, setProfil] = useState<Profil | null>(null)
  const [items, setItems] = useState<ItemVendorPublik[]>([])
  const [memuat, setMemuat] = useState(true)
  const [simpan, setSimpan] = useState(false)
  const [error, setError] = useState('')
  const [tersimpan, setTersimpan] = useState(false)

  useEffect(() => {
    procurementApi().vendorBySelfToken(token)
      .then(v => {
        if (!v) { setProfil(null); return }
        setProfil({
          nama: v.nama, pic: v.pic, no_wa: v.no_wa, kategori: v.kategori,
          term: v.term, term_hari: v.term_hari, status: v.status,
        })
        setItems(v.items?.length ? v.items : [{ ...itemKosong }])
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setMemuat(false))
  }, [token])

  const setItem = <K extends keyof ItemVendorPublik>(i: number, k: K, v: ItemVendorPublik[K]) =>
    setItems(list => list.map((it, n) => (n === i ? { ...it, [k]: v } : it)))

  async function kirim() {
    setError(''); setTersimpan(false)
    const terisi = items.filter(i => i.nama.trim())
    if (terisi.length === 0) return setError('Isi minimal satu barang.')
    setSimpan(true)
    try {
      const ok = await procurementApi().simpanItemVendor(
        token,
        terisi.map(i => ({
          ...i, nama: i.nama.trim(),
          harga: Number(i.harga) || 0, min_order: Number(i.min_order) || 0,
        })),
      )
      if (!ok) throw new Error('Tautan tidak dikenali. Minta tautan baru dari perusahaan.')
      setTersimpan(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSimpan(false) }
  }

  if (memuat) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!profil) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center space-y-3 shadow-lg">
          <Store className="w-12 h-12 mx-auto opacity-30" />
          <h1 className="font-serif text-xl font-bold text-navy">Tautan Tidak Dikenali</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {error || 'Tautan ini tidak ditemukan. Minta tautan baru dari perusahaan yang mengundang Anda.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <div className="bg-navy text-white px-4 pt-8 pb-12">
        <div className="max-w-2xl mx-auto">
          <p className="text-gold text-[11px] font-black uppercase tracking-[0.2em]">Daftar Barang Vendor</p>
          <h1 className="font-serif text-2xl font-bold mt-1">{profil.nama}</h1>
          <p className="text-white/70 text-xs mt-2">
            {profil.kategori || 'Vendor'} · {teksTerm(profil.term, profil.term_hari)}
            {profil.status !== 'aktif' && ` · ${LABEL_STATUS_VENDOR[profil.status]}`}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-6 space-y-4">
        <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-navy text-sm flex items-center gap-2">
              <Package className="w-4 h-4" /> Barang & Harga
            </h2>
            <span className="text-[11px] text-muted-foreground">{items.filter(i => i.nama.trim()).length} barang</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Perubahan harga hanya berlaku untuk pesanan baru. Pesanan yang sudah terbit tidak berubah.
          </p>

          <div className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <input value={it.nama} onChange={e => setItem(i, 'nama', e.target.value)}
                    placeholder="Nama barang" className={`${inputCls} flex-1`} />
                  <button onClick={() => setItems(l => (l.length > 1 ? l.filter((_, n) => n !== i) : [{ ...itemKosong }]))}
                    aria-label="Hapus barang"
                    className="h-11 px-2 text-muted-foreground hover:text-rose-600 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Satuan</label>
                    <input value={it.satuan} onChange={e => setItem(i, 'satuan', e.target.value)}
                      placeholder="sak" className={`${inputCls} h-10`} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Harga Jual (Rp)</label>
                    <input type="number" min={0} value={it.harga || ''}
                      onChange={e => setItem(i, 'harga', Number(e.target.value) || 0)}
                      inputMode="numeric" className={`${inputCls} h-10`} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Merek</label>
                    <input value={it.merek} onChange={e => setItem(i, 'merek', e.target.value)}
                      className={`${inputCls} h-10`} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Min. Order</label>
                    <input type="number" min={0} value={it.min_order || ''}
                      onChange={e => setItem(i, 'min_order', Number(e.target.value) || 0)}
                      inputMode="numeric" className={`${inputCls} h-10`} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => setItems(l => [...l, { ...itemKosong }])}
            className="w-full h-11 rounded-xl border-2 border-dashed border-navy/25 text-navy text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:border-navy/50">
            <Plus className="w-4 h-4" /> Tambah Barang
          </button>
        </div>

        {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>}
        {tersimpan && (
          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3 inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Daftar barang tersimpan.
          </p>
        )}

        <button onClick={kirim} disabled={simpan}
          className="w-full h-12 rounded-xl bg-gold text-navy font-black text-sm inline-flex items-center justify-center gap-2 hover:bg-gold/90 disabled:opacity-60">
          {simpan && <Loader2 className="w-4 h-4 animate-spin" />}
          SIMPAN PERUBAHAN
        </button>
      </div>
    </div>
  )
}
