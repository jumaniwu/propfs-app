// ============================================================
// REGISTRASI VENDOR (publik, tanpa login)
// Vendor membuka tautan milik satu perusahaan, mengisi profil + nomor WA,
// lalu mendaftarkan barang yang dijualnya beserta harga dan term payment.
// Selesai mengisi, vendor menerima tautan pribadi untuk memperbarui
// daftar barangnya kapan saja.
// ============================================================
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Store, Plus, Trash2, Loader2, CheckCircle2, Copy, ExternalLink, Package,
} from 'lucide-react'
import {
  procurementApi, vendorItemLink,
  type ProfilVendorPublik, type ItemVendorPublik,
} from '@/lib/procurementApi'
import { LABEL_TERM } from '@/lib/procurement'

const profilKosong: ProfilVendorPublik = {
  nama: '', pic: '', no_wa: '', email: '', alamat: '', npwp: '',
  kategori: '', term: 'cash', term_hari: 0, catatan: '',
}
const itemKosong: ItemVendorPublik = {
  nama: '', satuan: '', harga: 0, merek: '', min_order: 0, catatan: '',
}

const inputCls = 'w-full h-11 rounded-xl border border-input bg-white px-3 text-sm text-navy placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold'

export default function VendorDaftarPage() {
  const { token = '' } = useParams()
  const [perusahaan, setPerusahaan] = useState('')
  const [memuat, setMemuat] = useState(true)
  const [profil, setProfil] = useState<ProfilVendorPublik>(profilKosong)
  const [items, setItems] = useState<ItemVendorPublik[]>([{ ...itemKosong }])
  const [kirim, setKirim] = useState(false)
  const [error, setError] = useState('')
  const [selesai, setSelesai] = useState<string | null>(null)

  useEffect(() => {
    procurementApi().perusahaanByVendorToken(token)
      .then(setPerusahaan)
      .catch(() => setPerusahaan(''))
      .finally(() => setMemuat(false))
  }, [token])

  const set = <K extends keyof ProfilVendorPublik>(k: K, v: ProfilVendorPublik[K]) =>
    setProfil(p => ({ ...p, [k]: v }))
  const setItem = <K extends keyof ItemVendorPublik>(i: number, k: K, v: ItemVendorPublik[K]) =>
    setItems(list => list.map((it, n) => (n === i ? { ...it, [k]: v } : it)))

  async function daftar() {
    setError('')
    if (profil.nama.trim().length < 2) return setError('Nama perusahaan/toko wajib diisi.')
    if (profil.no_wa.replace(/\D/g, '').length < 8) return setError('Nomor WhatsApp wajib diisi agar kami bisa menghubungi Anda.')
    const terisi = items.filter(i => i.nama.trim())
    if (terisi.length === 0) return setError('Isi minimal satu barang yang Anda jual.')

    setKirim(true)
    try {
      const selfToken = await procurementApi().daftarVendor(
        token,
        { ...profil, nama: profil.nama.trim(), term_hari: profil.term === 'term' ? Number(profil.term_hari) || 0 : 0 },
        terisi.map(i => ({ ...i, nama: i.nama.trim(), harga: Number(i.harga) || 0, min_order: Number(i.min_order) || 0 })),
      )
      if (!selfToken) throw new Error('Tautan registrasi tidak dikenali. Minta tautan terbaru dari perusahaan yang mengundang Anda.')
      setSelesai(selfToken)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setKirim(false) }
  }

  if (memuat) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Tautan tidak dikenali — jangan biarkan vendor mengisi form yang sia-sia.
  if (!perusahaan) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center space-y-3 shadow-lg">
          <Store className="w-12 h-12 mx-auto opacity-30" />
          <h1 className="font-serif text-xl font-bold text-navy">Tautan Tidak Dikenali</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Tautan registrasi ini tidak ditemukan atau sudah diganti. Silakan minta tautan
            terbaru dari perusahaan yang mengundang Anda.
          </p>
        </div>
      </div>
    )
  }

  if (selesai) {
    const tautan = vendorItemLink(selesai)
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 space-y-4 shadow-lg">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="font-serif text-xl font-bold text-navy">Pendaftaran Terkirim</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Terima kasih. Data Anda sudah masuk ke {perusahaan} dan menunggu verifikasi.
              Kami akan menghubungi Anda lewat WhatsApp bila ada pesanan.
            </p>
          </div>

          <div className="rounded-2xl border border-gold/40 bg-gold-lt/40 p-4 space-y-2">
            <p className="text-xs font-bold text-navy">Simpan tautan ini</p>
            <p className="text-[11px] text-slate-700 leading-relaxed">
              Pakai tautan berikut kapan pun Anda ingin memperbarui daftar barang atau harga.
              Jangan dibagikan ke orang lain.
            </p>
            <p className="text-[11px] font-mono break-all bg-white rounded-lg p-2 border border-border">{tautan}</p>
            <div className="flex gap-2">
              <button onClick={() => navigator.clipboard?.writeText(tautan)}
                className="h-9 px-3 rounded-xl bg-navy text-white text-xs font-bold inline-flex items-center gap-1.5">
                <Copy className="w-3.5 h-3.5" /> Salin
              </button>
              <a href={tautan}
                className="h-9 px-3 rounded-xl border border-border text-navy text-xs font-bold inline-flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> Buka
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <div className="bg-navy text-white px-4 pt-8 pb-12">
        <div className="max-w-2xl mx-auto">
          <p className="text-gold text-[11px] font-black uppercase tracking-[0.2em]">Pendaftaran Vendor</p>
          <h1 className="font-serif text-2xl font-bold mt-1">{perusahaan}</h1>
          <p className="text-white/70 text-xs mt-2 leading-relaxed">
            Isi profil usaha Anda dan daftar barang yang Anda jual beserta harganya.
            Data ini dipakai {perusahaan} saat membuat pesanan pembelian.
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-6 space-y-4">
        {/* ── Profil ── */}
        <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
          <h2 className="font-bold text-navy text-sm flex items-center gap-2">
            <Store className="w-4 h-4" /> Profil Usaha
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Nama Perusahaan / Toko *</label>
              <input value={profil.nama} onChange={e => set('nama', e.target.value)}
                placeholder="mis. PT Sumber Beton Jaya" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nama yang Dihubungi</label>
              <input value={profil.pic} onChange={e => set('pic', e.target.value)}
                placeholder="mis. Pak Andi" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nomor WhatsApp *</label>
              <input value={profil.no_wa} onChange={e => set('no_wa', e.target.value)}
                placeholder="mis. 081234567890" inputMode="tel" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input type="email" value={profil.email} onChange={e => set('email', e.target.value)}
                placeholder="mis. sales@sumberbeton.co.id" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Kategori Barang</label>
              <input value={profil.kategori} onChange={e => set('kategori', e.target.value)}
                placeholder="mis. Semen & Beton" className={inputCls} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Alamat</label>
              <input value={profil.alamat} onChange={e => set('alamat', e.target.value)}
                placeholder="Alamat usaha" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">NPWP</label>
              <input value={profil.npwp} onChange={e => set('npwp', e.target.value)}
                placeholder="Opsional" className={inputCls} />
            </div>
          </div>
        </div>

        {/* ── Term payment ── */}
        <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
          <h2 className="font-bold text-navy text-sm">Syarat Pembayaran yang Anda Terima</h2>
          <div className="flex gap-2">
            {(['cash', 'term'] as const).map(t => (
              <button key={t} onClick={() => set('term', t)}
                className={`flex-1 h-11 rounded-xl text-xs font-bold border transition-colors ${
                  profil.term === t
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white text-muted-foreground border-border hover:bg-slate-50'}`}>
                {LABEL_TERM[t]}
              </button>
            ))}
          </div>
          {profil.term === 'term' && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tempo berapa hari?</label>
              <input type="number" min={1} value={profil.term_hari || ''}
                onChange={e => set('term_hari', Number(e.target.value) || 0)}
                placeholder="mis. 30" inputMode="numeric" className={inputCls} />
              <p className="text-[11px] text-muted-foreground">
                Contoh: 30 berarti pembayaran jatuh tempo 30 hari setelah barang diterima.
              </p>
            </div>
          )}
        </div>

        {/* ── Daftar barang ── */}
        <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-navy text-sm flex items-center gap-2">
              <Package className="w-4 h-4" /> Barang yang Anda Jual
            </h2>
            <span className="text-[11px] text-muted-foreground">{items.filter(i => i.nama.trim()).length} barang</span>
          </div>

          <div className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <input value={it.nama} onChange={e => setItem(i, 'nama', e.target.value)}
                    placeholder="Nama barang, mis. Semen Portland 50kg"
                    className={`${inputCls} flex-1`} />
                  {items.length > 1 && (
                    <button onClick={() => setItems(l => l.filter((_, n) => n !== i))}
                      aria-label="Hapus barang"
                      className="h-11 px-2 text-muted-foreground hover:text-rose-600 shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
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
                      placeholder="65000" inputMode="numeric" className={`${inputCls} h-10`} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Merek</label>
                    <input value={it.merek} onChange={e => setItem(i, 'merek', e.target.value)}
                      placeholder="Opsional" className={`${inputCls} h-10`} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Min. Order</label>
                    <input type="number" min={0} value={it.min_order || ''}
                      onChange={e => setItem(i, 'min_order', Number(e.target.value) || 0)}
                      placeholder="0" inputMode="numeric" className={`${inputCls} h-10`} />
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

        {error && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>
        )}

        <button onClick={daftar} disabled={kirim}
          className="w-full h-12 rounded-xl bg-gold text-navy font-black text-sm inline-flex items-center justify-center gap-2 hover:bg-gold/90 disabled:opacity-60">
          {kirim && <Loader2 className="w-4 h-4 animate-spin" />}
          KIRIM PENDAFTARAN
        </button>

        <p className="text-center text-[11px] text-muted-foreground">
          Dikelola dengan PropFS · Kontraktor AI
        </p>
      </div>
    </div>
  )
}
