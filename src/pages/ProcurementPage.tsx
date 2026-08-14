// ============================================================
// PROCUREMENT — Vendor · Katalog · Purchase Order
//
// Menyambung Material Request yang sudah disetujui ke pemesanan:
//   request disetujui → pilih (boleh sebagian) → pilih vendor → PO terbit
//   → tanda tangan pembuat → persetujuan Owner/Manajemen/PM → kirim WA
//
// Tombol "Kirim ke Vendor" sengaja tetap mati sampai kedua syarat terpenuhi,
// dan syarat yang sama diperiksa ulang di server oleh po_tandai_terkirim().
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Store, Package, ShoppingCart, Loader2, RefreshCw, Trash2, Plus, Copy,
  Send, Check, X, Link2, PenLine, Download, FileText, Search, AlertTriangle,
  ReceiptIcon, Truck, ReceiptText,
} from 'lucide-react'
import type { RealisasiEntry } from '@/lib/ai-realisasi'
import { useSearchParams } from 'react-router-dom'
import { subSah } from '@/lib/posisiKerja'
import { Button } from '@/components/ui/button'
import KontraktorHeader from '@/components/cost/KontraktorHeader'
import SignaturePad from '@/components/cost/SignaturePad'
import { useAuthStore } from '@/store/authStore'
import { useCostStore } from '@/store/costStore'
import { useToast } from '@/hooks/use-toast'
import { teamApi, roleSaatIni, type Workspace } from '@/lib/teamApi'
import { can } from '@/lib/teamRoles'
import { materialApi, type MaterialRequest } from '@/lib/materialApi'
import {
  procurementApi, vendorDaftarLink, poViewLink, invoiceKirimLink,
  type BarisInvoice,
  type ProfilVendorPublik,
} from '@/lib/procurementApi'
import { downloadPoPdf } from '@/lib/poPdf'
import { waKe, nomorWaInternasional } from '@/lib/waLink'
import { tokenSudahPendek } from '@/lib/tautanPendek'
import TabPenerimaan from '@/components/cost/TabPenerimaan'
import TabInvoiceVendor from '@/components/cost/TabInvoiceVendor'
import { penerimaanApi } from '@/lib/penerimaanApi'
import { statusTerima, type DeliveryOrder } from '@/lib/penerimaan'
import {
  belumTerpesan, sisaQty, hitungTotalPo, nomorPo, bolehKirimPo, waEfektifPo, statusPoSetelah,
  ringkasKatalog, hargaVendorUntuk, teksTerm, pesanWaPo, katalogDariNota, tokoBelumJadiVendor,
  profilAwal,
  LABEL_STATUS_PO, TONE_STATUS_PO, LABEL_STATUS_VENDOR, TONE_STATUS_VENDOR, LABEL_TERM,
  type Vendor, type VendorItem, type PurchaseOrder, type PoItem,
} from '@/lib/procurement'

type Sub = 'vendor' | 'katalog' | 'po' | 'terima' | 'invoice'
const SUB_SAH: readonly Sub[] = ['vendor', 'katalog', 'po', 'terima', 'invoice']

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`
const angka = (n: number) => (n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })
const inputCls = 'w-full h-10 rounded-lg border border-input bg-white px-3 text-sm text-navy'

export default function ProcurementPage() {
  const { toast } = useToast()
  const { profile } = useAuthStore()
  const { projectInfo } = useCostStore()
  // Nota material yang sudah dicatat di Realisasi Biaya ikut mengisi katalog,
  // jadi harga acuan sudah ada bahkan sebelum satu vendor pun mendaftar.
  const semuaRealisasi = useCostStore(s => s.getAllRealisasi)

  const [params, setParams] = useSearchParams()
  const [sub, setSub] = useState<Sub>(() => subSah(params.get('sub'), SUB_SAH, 'vendor'))

  // Sub-menu ikut dicatat di alamat. Tanpa ini, memuat ulang halaman selalu
  // melompat kembali ke sub-menu pertama — dan pekerjaan yang sedang dilihat
  // harus dicari ulang.
  useEffect(() => {
    if (params.get('sub') === sub) return
    const q = new URLSearchParams(params)
    q.set('sub', sub)
    setParams(q, { replace: true })
  }, [sub]) // eslint-disable-line react-hooks/exhaustive-deps

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [items, setItems] = useState<VendorItem[]>([])
  const [posSemua, setPos] = useState<PurchaseOrder[]>([])
  const [requestsSemua, setRequests] = useState<MaterialRequest[]>([])
  const [dos, setDos] = useState<DeliveryOrder[]>([])
  const [invoices, setInvoices] = useState<BarisInvoice[]>([])

  // Procurement adalah halaman tingkat PERUSAHAAN, bukan per proyek: vendor,
  // katalog, dan daftar PO memang dilihat menyeluruh. Proyek sebuah PO tidak
  // ditentukan dari pemilih di layar melainkan dari Material Request yang
  // dipesan — itu jawaban yang pasti benar, sedangkan pemilih di layar hanya
  // menebak dari proyek yang kebetulan sedang aktif.
  const pos = posSemua
  const requests = requestsSemua
  const [token, setToken] = useState('')
  const [memuat, setMemuat] = useState(true)
  const [error, setError] = useState('')

  const role = roleSaatIni(workspaces)
  const bolehUbah = can(role, 'procurement', 'tulis')
  const bolehApprove = can(role, 'procurement', 'approve')

  const muat = useCallback(async (diam = false) => {
    if (!diam) setMemuat(true)
    try {
      const api = procurementApi()
      const [v, it, p, r, d, inv] = await Promise.all([
        api.listVendors(), api.listVendorItems(), api.listPo(),
        materialApi().listRequests().catch(() => [] as MaterialRequest[]),
        // Penerimaan opsional: bila migration_penerimaan.sql belum dijalankan,
        // tab lain harus tetap bisa dipakai.
        penerimaanApi().listDo().catch(() => [] as DeliveryOrder[]),
        // Sama alasannya: migration_invoice_vendor.sql mungkin belum dijalankan,
        // dan seluruh halaman tidak boleh mati karenanya.
        api.listInvoice().catch(() => [] as BarisInvoice[]),
      ])
      setVendors(v); setItems(it); setPos(p); setRequests(r); setDos(d)
      setInvoices(inv); setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setMemuat(false) }
  }, [])

  useEffect(() => {
    muat()
    teamApi().myWorkspaces().then(setWorkspaces).catch(() => setWorkspaces([]))
    procurementApi().vendorToken().then(setToken).catch(() => setToken(''))
  }, [muat])

  const vendorAktif = useMemo(() => vendors.filter(v => v.status === 'aktif'), [vendors])
  const perluVerifikasi = useMemo(() => vendors.filter(v => v.status === 'baru').length, [vendors])
  const siapDipesan = useMemo(() => belumTerpesan(requests, pos), [requests, pos])

  // PO terkirim yang barangnya belum lengkap datang — itulah yang menunggu
  // dicatat penerimaannya.
  // Tagihan yang belum diputuskan. Angkanya dipakai sebagai lencana tab: yang
  // sudah disetujui, ditolak, atau dibayar bukan lagi pekerjaan yang tertunda.
  const invoicePerluDiperiksa = useMemo(
    () => invoices.filter(v => v.status !== 'disetujui' && v.status !== 'ditolak'
      && v.status !== 'dibayar').length,
    [invoices],
  )

  const menungguDatang = useMemo(
    () => pos.filter(p => (p.status === 'terkirim' || p.status === 'selesai')
      && statusTerima(p.items, dos.filter(d => d.po_id === p.id)) !== 'lengkap').length,
    [pos, dos],
  )

  const TAB: Array<[Sub, string, JSX.Element, number]> = [
    ['vendor', 'Vendor', <Store key="i" className="w-4 h-4" />, perluVerifikasi],
    ['katalog', 'Katalog', <Package key="i" className="w-4 h-4" />, 0],
    ['po', 'Purchase Order', <ShoppingCart key="i" className="w-4 h-4" />, siapDipesan.length],
    ['terima', 'Penerimaan', <Truck key="i" className="w-4 h-4" />, menungguDatang],
    ['invoice', 'Tagihan', <ReceiptText key="i" className="w-4 h-4" />, invoicePerluDiperiksa],
  ]

  return (
    <div className="min-h-screen bg-slate-100/70 pb-10">
      <KontraktorHeader
        judul="Procurement"
        subjudul={`${vendors.length} vendor · ${pos.length} purchase order · semua proyek`}
        kembaliKe="/kontraktor"
        aksi={
          <Button onClick={() => muat()} variant="outline" size="sm"
            className="gap-1.5 bg-white/10 text-white border-white/20 hover:bg-white/20">
            <RefreshCw className={`w-3.5 h-3.5 ${memuat ? 'animate-spin' : ''}`} /> Muat Ulang
          </Button>
        }
      />

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {TAB.map(([key, label, icon, badge]) => (
            <button key={key} onClick={() => setSub(key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                sub === key ? 'bg-navy text-white shadow' : 'bg-white text-muted-foreground border border-border hover:bg-slate-50'}`}>
              {icon} {label}
              {badge > 0 && (
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                  sub === key ? 'bg-white/20' : 'bg-red-500 text-white'}`}>{badge}</span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
            {error}
          </p>
        )}

        {memuat ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {sub === 'vendor' && (
              <TabVendor
                vendors={vendors} items={items} token={token} bolehUbah={bolehUbah}
                onUbah={muat} onTokenBaru={setToken} />
            )}
            {sub === 'katalog' && (
              <TabKatalog items={items} vendors={vendors} realisasi={semuaRealisasi()}
                bolehUbah={bolehUbah} onUbah={muat} />
            )}
            {sub === 'terima' && (
              <TabPenerimaan pos={pos} dos={dos} bolehUbah={bolehUbah} onUbah={muat} />
            )}
            {sub === 'invoice' && (
              <TabInvoiceVendor invoices={invoices} pos={pos} bolehUbah={bolehApprove}
                namaSaya={profile?.full_name ?? ''} onUbah={muat} />
            )}
            {sub === 'po' && (
              <TabPo
                pos={pos} requests={siapDipesan} vendors={vendorAktif} semuaVendor={vendors} items={items}
                projectName={projectInfo?.projectName ?? ''}
                namaSaya={profile?.full_name ?? ''}
                bolehUbah={bolehUbah} bolehApprove={bolehApprove}
                onUbah={muat} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ══ TAB VENDOR ══════════════════════════════════════════════════════════════
function TabVendor({ vendors, items, token, bolehUbah, onUbah, onTokenBaru }: {
  vendors: Vendor[]
  items: VendorItem[]
  token: string
  bolehUbah: boolean
  onUbah: () => void
  onTokenBaru: (token: string) => void
}) {
  const { toast } = useToast()
  const [formOpen, setFormOpen] = useState(false)
  // id vendor yang sedang disunting — formnya tampil di dalam kartunya sendiri
  // supaya jelas profil siapa yang sedang diubah saat daftarnya panjang.
  const [suntingId, setSuntingId] = useState<string | null>(null)
  const [cari, setCari] = useState('')
  const [memutar, setMemutar] = useState(false)
  const tautan = token ? vendorDaftarLink(token) : ''
  const tokenPanjang = !!token && !tokenSudahPendek(token)

  async function putarUlangToken() {
    if (!window.confirm(
      'Terbitkan link registrasi vendor yang baru?\n\n'
      + 'Link yang sekarang langsung tidak berlaku. Calon vendor yang sudah '
      + 'menerimanya tapi belum mendaftar harus dikirimi link baru.',
    )) return
    setMemutar(true)
    try {
      const baru = await procurementApi().vendorTokenPutarUlang()
      if (!baru) throw new Error('Server tidak mengembalikan link baru.')
      onTokenBaru(baru)
      toast({ title: 'Link registrasi baru diterbitkan', description: vendorDaftarLink(baru) })
    } catch (e) {
      toast({ title: 'Gagal menerbitkan link', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally { setMemutar(false) }
  }

  const jumlahItem = (id: string) => items.filter(i => i.vendor_id === id).length
  const tersaring = vendors.filter(v =>
    `${v.nama} ${v.kategori} ${v.pic}`.toLowerCase().includes(cari.trim().toLowerCase()))

  async function ubahStatus(v: Vendor, status: Vendor['status']) {
    try {
      await procurementApi().updateVendor(v.id, { status })
      toast({ title: status === 'aktif' ? `${v.nama} diaktifkan` : `${v.nama} dinonaktifkan` })
      onUbah()
    } catch (e) {
      toast({ title: 'Gagal', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  async function hapus(v: Vendor) {
    if (!window.confirm(`Hapus vendor ${v.nama}? Barang yang terdaftar ikut terhapus.`)) return
    try {
      await procurementApi().deleteVendor(v.id)
      toast({ title: 'Vendor dihapus' })
      onUbah()
    } catch (e) {
      toast({ title: 'Gagal menghapus', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      {/* Tautan registrasi vendor */}
      <div className="bg-navy rounded-2xl p-5 text-white">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Link2 className="w-5 h-5 text-gold" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider text-white/60 font-bold">Link Registrasi Vendor</p>
            <p className="font-mono text-[11px] break-all text-gold mt-1">{tautan || '••••••••'}</p>
            <p className="text-[11px] text-white/70 mt-1.5 leading-relaxed">
              Bagikan ke calon vendor. Mereka mengisi profil, nomor WA, daftar barang beserta
              harga jual dan syarat pembayaran sendiri. Vendor baru masuk sebagai
              <b className="text-white"> perlu verifikasi</b> — hanya vendor aktif yang bisa dipilih di PO.
            </p>
          </div>
        </div>
        {tautan && (
          <div className="flex gap-2 mt-3 flex-wrap">
            <button onClick={() => { navigator.clipboard?.writeText(tautan); toast({ title: 'Link registrasi disalin' }) }}
              className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1.5">
              <Copy className="w-3.5 h-3.5" /> Salin Link
            </button>
            <button onClick={() => window.open(waKe('', `Halo, silakan daftar sebagai vendor kami di:\n${tautan}`), '_blank')}
              className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> Bagikan via WA
            </button>
            {bolehUbah && (
              <button onClick={putarUlangToken} disabled={memutar}
                className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                {memutar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {tokenPanjang ? 'Perpendek Link' : 'Terbitkan Ulang'}
              </button>
            )}
          </div>
        )}
        {/* Token yang sudah terlanjur dibuat tidak diperpendek otomatis:
            mengganti diam-diam akan mematikan tautan yang sudah tersebar. */}
        {tautan && tokenPanjang && bolehUbah && (
          <p className="text-[11px] text-gold/90 mt-2.5 leading-relaxed">
            Link ini masih versi panjang. <b>Perpendek Link</b> menerbitkan yang baru dan
            jauh lebih ringkas — tetapi link lama langsung tidak berlaku, jadi bagikan
            ulang ke calon vendor yang belum sempat mendaftar.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={cari} onChange={e => setCari(e.target.value)}
            placeholder="Cari vendor…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-white text-sm" />
        </div>
        {bolehUbah && (
          <Button onClick={() => setFormOpen(v => !v)} size="sm"
            className="gap-1.5 bg-navy hover:bg-navy/90 font-bold shrink-0 h-10">
            <Plus className="w-4 h-4" /> Vendor
          </Button>
        )}
      </div>

      {formOpen && <FormVendor onBatal={() => setFormOpen(false)} onSukses={() => { setFormOpen(false); onUbah() }} />}

      {tersaring.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center">
          <Store className="w-10 h-10 mx-auto opacity-30 mb-3" />
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {vendors.length === 0
              ? 'Belum ada vendor. Bagikan link registrasi di atas, atau tambahkan vendor secara manual.'
              : `Vendor "${cari}" tidak ditemukan.`}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {tersaring.map(v => suntingId === v.id ? (
            <div key={v.id} className="md:col-span-2">
              <FormVendor vendor={v}
                onBatal={() => setSuntingId(null)}
                onSukses={() => { setSuntingId(null); onUbah() }} />
            </div>
          ) : (
            <div key={v.id} className={`bg-white rounded-2xl border p-4 space-y-2.5 ${
              v.status === 'baru' ? 'border-amber-300' : 'border-border'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-navy text-sm truncate">{v.nama}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {v.kategori || 'Tanpa kategori'}{v.pic && ` · ${v.pic}`}
                  </p>
                </div>
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${TONE_STATUS_VENDOR[v.status]}`}>
                  {v.status}
                </span>
              </div>

              <div className="text-[11px] text-muted-foreground space-y-0.5">
                {v.no_wa && <p>📱 {v.no_wa}</p>}
                {v.email && <p className="truncate">✉️ {v.email}</p>}
                <p>💳 {teksTerm(v.term, v.term_hari)}</p>
                <p>📦 {jumlahItem(v.id)} barang terdaftar</p>
              </div>

              {/* Vendor dari nota pembelian lahir hanya dengan nama — tanpa
                  nomor WA, PO tidak bisa dikirim ke mana pun. */}
              {bolehUbah && !v.no_wa && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-relaxed">
                  Belum ada nomor WhatsApp. Lengkapi lewat <b>Edit</b> agar PO bisa dikirim
                  ke vendor ini.
                </p>
              )}

              {v.status === 'baru' && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-relaxed">
                  Vendor ini mendaftar sendiri lewat link. Periksa datanya, lalu aktifkan agar
                  bisa dipilih saat membuat PO.
                </p>
              )}

              {bolehUbah && (
                <div className="flex gap-1.5 pt-1 border-t border-border flex-wrap">
                  {v.status !== 'aktif' ? (
                    <Button size="sm" className="h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => ubahStatus(v, 'aktif')}>
                      <Check className="w-3 h-3" /> Aktifkan
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                      onClick={() => ubahStatus(v, 'nonaktif')}>
                      <X className="w-3 h-3" /> Nonaktifkan
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                    onClick={() => { setFormOpen(false); setSuntingId(v.id) }}>
                    <PenLine className="w-3 h-3" /> Edit
                  </Button>
                  {v.no_wa && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                      onClick={() => window.open(waKe(v.no_wa, `Halo ${v.pic || v.nama},`), '_blank')}>
                      <Send className="w-3 h-3" /> WA
                    </Button>
                  )}
                  <button onClick={() => hapus(v)}
                    className="ml-auto text-muted-foreground hover:text-rose-600 self-center">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Kolom({ label, wajib, lebar, children }: {
  label: string
  wajib?: boolean
  lebar?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={`block ${lebar ? 'sm:col-span-2' : ''}`}>
      <span className="block text-[11px] font-bold text-muted-foreground mb-1">
        {label}{wajib && <span className="text-rose-600"> *</span>}
      </span>
      {children}
    </label>
  )
}

/**
 * Satu form untuk menambah maupun menyunting profil vendor.
 *
 * Vendor yang lahir dari nota pembelian hanya punya nama — kontak, alamat, dan
 * syarat pembayarannya belum terisi, padahal PO membutuhkan nomor WA untuk
 * dikirim. Karena itu mode sunting memakai form yang sama persis, bukan form
 * ringkas terpisah: apa pun yang bisa diisi saat mendaftar harus bisa
 * dilengkapi belakangan.
 */
function FormVendor({ vendor, onBatal, onSukses }: {
  vendor?: Vendor
  onBatal: () => void
  onSukses: () => void
}) {
  const { toast } = useToast()
  const sunting = !!vendor
  const [f, setF] = useState<ProfilVendorPublik>(() => profilAwal(vendor))
  const [kirim, setKirim] = useState(false)
  const set = <K extends keyof ProfilVendorPublik>(k: K, v: ProfilVendorPublik[K]) =>
    setF(p => ({ ...p, [k]: v }))

  // Nomor WA dinilai memakai penormal yang sama dengan pembuat tautan, supaya
  // yang terlihat benar di sini pasti bisa dibuka saat PO dikirim.
  const waSiap = nomorWaInternasional(f.no_wa)

  async function simpan() {
    if (f.nama.trim().length < 2) {
      toast({ title: 'Nama vendor wajib diisi', variant: 'destructive' })
      return
    }
    setKirim(true)
    const bersih = { ...f, nama: f.nama.trim(), pic: f.pic.trim(), no_wa: f.no_wa.trim() }
    try {
      if (vendor) {
        await procurementApi().updateVendor(vendor.id, bersih)
        toast({ title: `Profil ${bersih.nama} diperbarui` })
      } else {
        await procurementApi().createVendor({ ...bersih, status: 'aktif' })
        toast({ title: 'Vendor ditambahkan' })
      }
      onSukses()
    } catch (e) {
      toast({ title: 'Gagal menyimpan', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally { setKirim(false) }
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-gold/40 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-navy text-sm">
          {sunting ? `Edit Profil — ${vendor.nama}` : 'Tambah Vendor Manual'}
        </h3>
        <button onClick={onBatal} className="text-muted-foreground hover:text-navy"><X className="w-4 h-4" /></button>
      </div>
      {/* Label ditulis di atas kolom, bukan hanya placeholder: dalam mode
          sunting kolom datang sudah terisi, sehingga placeholder tidak pernah
          terlihat dan isinya jadi tidak jelas milik kolom apa. */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Kolom label="Nama vendor" wajib>
          <input value={f.nama} onChange={e => set('nama', e.target.value)}
            placeholder="mis. Toko Permata" className={inputCls} />
        </Kolom>
        <Kolom label="Nama kontak">
          <input value={f.pic} onChange={e => set('pic', e.target.value)}
            placeholder="mis. Pak Rudi" className={inputCls} />
        </Kolom>
        <Kolom label="Nomor WhatsApp">
          <input value={f.no_wa} onChange={e => set('no_wa', e.target.value)} inputMode="tel"
            placeholder="mis. 0812…" className={inputCls} />
          {f.no_wa.trim() !== '' && (
            <p className={`text-[11px] mt-1 ${waSiap ? 'text-emerald-700' : 'text-rose-600'}`}>
              {waSiap
                ? `Akan dihubungi sebagai +${waSiap}`
                : 'Nomor belum bisa dipakai — tulis seperti 0812… atau 62812…'}
            </p>
          )}
        </Kolom>
        <Kolom label="Email">
          <input value={f.email} onChange={e => set('email', e.target.value)} inputMode="email"
            placeholder="mis. toko@email.com" className={inputCls} />
        </Kolom>
        <Kolom label="Kategori barang">
          <input value={f.kategori} onChange={e => set('kategori', e.target.value)}
            placeholder="mis. Besi & Baja" className={inputCls} />
        </Kolom>
        <Kolom label="NPWP">
          <input value={f.npwp} onChange={e => set('npwp', e.target.value)}
            placeholder="Opsional" className={inputCls} />
        </Kolom>
        <Kolom label="Syarat pembayaran">
          <select value={f.term} onChange={e => set('term', e.target.value as 'cash' | 'term')}
            className={`${inputCls} font-semibold`}>
            {(['cash', 'term'] as const).map(t => <option key={t} value={t}>{LABEL_TERM[t]}</option>)}
          </select>
        </Kolom>
        {f.term === 'term' && (
          <Kolom label="Lama tempo (hari)">
            <input type="number" min={1} value={f.term_hari || ''}
              onChange={e => set('term_hari', Number(e.target.value) || 0)}
              placeholder="mis. 30" className={inputCls} />
          </Kolom>
        )}
        <Kolom label="Alamat" lebar>
          <input value={f.alamat} onChange={e => set('alamat', e.target.value)}
            placeholder="Alamat toko / gudang" className={inputCls} />
        </Kolom>
        <Kolom label="Catatan" lebar>
          <input value={f.catatan} onChange={e => set('catatan', e.target.value)}
            placeholder="Opsional" className={inputCls} />
        </Kolom>
      </div>
      <div className="flex gap-2">
        <Button onClick={simpan} disabled={kirim} className="gap-2 bg-navy hover:bg-navy/90 font-bold">
          {kirim ? <Loader2 className="w-4 h-4 animate-spin" /> : sunting ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {sunting ? 'Simpan Perubahan' : 'Simpan Vendor'}
        </Button>
        {sunting && (
          <Button onClick={onBatal} variant="outline" disabled={kirim} className="font-bold">Batal</Button>
        )}
      </div>
    </div>
  )
}

// ══ TAB KATALOG ═════════════════════════════════════════════════════════════
// Harga datang dari dua sumber: yang didaftarkan vendor lewat link, dan yang
// dibaca otomatis dari nota material di Realisasi Biaya. Admin juga bisa
// mengisi manual tanpa menunggu vendor.
function TabKatalog({ items, vendors, realisasi, bolehUbah, onUbah }: {
  items: VendorItem[]
  vendors: Vendor[]
  realisasi: RealisasiEntry[]
  bolehUbah: boolean
  onUbah: () => void
}) {
  const { toast } = useToast()
  const [cari, setCari] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [proses, setProses] = useState('')

  const namaVendor = useMemo(() => new Map(vendors.map(v => [v.id, v.nama])), [vendors])
  const dariNota = useMemo(() => katalogDariNota(realisasi), [realisasi])
  const katalog = useMemo(
    () => ringkasKatalog(
      items.map(i => ({ ...i, vendor_nama: namaVendor.get(i.vendor_id) })), vendors, dariNota,
    ),
    [items, vendors, namaVendor, dariNota],
  )
  const tokoBaru = useMemo(() => tokoBelumJadiVendor(dariNota, vendors), [dariNota, vendors])
  const tersaring = katalog.filter(b => b.nama.toLowerCase().includes(cari.trim().toLowerCase()))

  /** Daftarkan toko yang selama ini hanya muncul di nota sebagai vendor. */
  async function jadikanVendor(nama: string) {
    setProses(nama)
    try {
      await procurementApi().createVendor({
        nama, pic: '', no_wa: '', email: '', alamat: '', npwp: '',
        kategori: '', term: 'cash', term_hari: 0,
        catatan: 'Dibuat otomatis dari nota pembelian.', status: 'aktif',
      })
      toast({ title: `${nama} jadi vendor`, description: 'Lengkapi nomor WA-nya agar bisa dikirimi PO.' })
      onUbah()
    } catch (e) {
      toast({ title: 'Gagal', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally { setProses('') }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={cari} onChange={e => setCari(e.target.value)}
            placeholder="Cari barang…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-white text-sm" />
        </div>
        {bolehUbah && (
          <Button onClick={() => setFormOpen(v => !v)} size="sm"
            className="gap-1.5 bg-navy hover:bg-navy/90 font-bold shrink-0 h-10">
            <Plus className="w-4 h-4" /> Barang
          </Button>
        )}
      </div>

      {formOpen && (
        <FormBarangManual vendors={vendors}
          onBatal={() => setFormOpen(false)}
          onSukses={() => { setFormOpen(false); onUbah() }} />
      )}

      {/* Toko yang selama ini hanya muncul di nota — sekali klik jadi vendor */}
      {bolehUbah && tokoBaru.length > 0 && (
        <div className="bg-white rounded-2xl border border-gold/40 p-4">
          <p className="text-xs font-bold text-navy">Toko dari nota pembelian</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 mb-2.5 leading-relaxed">
            {tokoBaru.length} toko ini sudah pernah Anda beli barangnya tapi belum terdaftar
            sebagai vendor. Daftarkan agar bisa dipilih saat membuat PO.
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {tokoBaru.map(t => (
              <button key={t} disabled={proses === t} onClick={() => jadikanVendor(t)}
                className="h-8 px-3 rounded-lg bg-navy/8 text-navy text-[11px] font-bold hover:bg-navy/15 disabled:opacity-50 inline-flex items-center gap-1.5">
                {proses === t ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {tersaring.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center">
          <Package className="w-10 h-10 mx-auto opacity-30 mb-3" />
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {katalog.length === 0
              ? 'Katalog masih kosong. Barang muncul otomatis dari nota material yang Anda catat di Realisasi Biaya, dari vendor yang mengisi link registrasi, atau bisa Anda tambahkan sendiri lewat tombol Barang.'
              : `Barang "${cari}" tidak ditemukan.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tersaring.map(b => (
            <div key={b.nama} className="bg-white rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="font-bold text-navy text-sm">{b.nama}</p>
                  <p className="text-[11px] text-muted-foreground">
                    satuan {b.satuan} · {b.penawaran.length} penawaran
                  </p>
                </div>
                {b.hargaTermurah > 0 && (
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-emerald-700 tabular-nums">{fmt(b.hargaTermurah)}</p>
                    <p className="text-[10px] text-muted-foreground">termurah</p>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                {b.penawaran.map((p, i) => {
                  const termurah = p.harga > 0 && p.harga === b.hargaTermurah
                  return (
                    <div key={`${p.vendor_id}-${p.sumber}-${i}`}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs ${
                        termurah ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50'}`}>
                      <div className="min-w-0">
                        <p className="font-semibold text-navy truncate">
                          {p.vendor_nama}
                          {termurah && <span className="ml-1.5 text-[9px] font-black text-emerald-700">TERMURAH</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap">
                          {p.sumber === 'nota' ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                              <ReceiptIcon className="w-2.5 h-2.5" /> dari nota
                            </span>
                          ) : (
                            <span className="text-[9px] font-black uppercase bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                              vendor
                            </span>
                          )}
                          {p.merek && <span>{p.merek}</span>}
                          {p.term && <span>{p.term}</span>}
                          {p.sumber === 'nota' && p.terakhir && (
                            <span>beli terakhir {p.terakhir}{(p.jumlahBeli ?? 0) > 1 ? ` · ${p.jumlahBeli}×` : ''}</span>
                          )}
                        </p>
                      </div>
                      <span className={`font-bold tabular-nums shrink-0 ${termurah ? 'text-emerald-700' : 'text-navy'}`}>
                        {p.harga > 0 ? fmt(p.harga) : 'belum ada harga'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tambah barang manual (tanpa menunggu vendor mengisi) ────────────────────
function FormBarangManual({ vendors, onBatal, onSukses }: {
  vendors: Vendor[]
  onBatal: () => void
  onSukses: () => void
}) {
  const { toast } = useToast()
  const [vendorId, setVendorId] = useState('')
  const [nama, setNama] = useState('')
  const [satuan, setSatuan] = useState('')
  const [harga, setHarga] = useState(0)
  const [merek, setMerek] = useState('')
  const [kirim, setKirim] = useState(false)

  async function simpan() {
    if (!vendorId) { toast({ title: 'Pilih vendor dulu', variant: 'destructive' }); return }
    if (nama.trim().length < 2) { toast({ title: 'Nama barang wajib diisi', variant: 'destructive' }); return }
    setKirim(true)
    try {
      await procurementApi().createVendorItem(vendorId, {
        nama: nama.trim(), satuan: satuan.trim(), harga: Number(harga) || 0,
        merek: merek.trim(), min_order: 0, catatan: '',
      })
      toast({ title: 'Barang ditambahkan ke katalog' })
      onSukses()
    } catch (e) {
      toast({ title: 'Gagal menyimpan', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally { setKirim(false) }
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-gold/40 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-navy text-sm">Tambah Barang ke Katalog</h3>
        <button onClick={onBatal} className="text-muted-foreground hover:text-navy"><X className="w-4 h-4" /></button>
      </div>
      {vendors.length === 0 ? (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
          Belum ada vendor. Tambahkan vendor lebih dulu di tab Vendor, atau daftarkan toko
          dari nota pembelian yang muncul di halaman ini.
        </p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[10px] font-medium text-muted-foreground">Vendor / Toko *</label>
              <select value={vendorId} onChange={e => setVendorId(e.target.value)}
                className={`${inputCls} font-semibold`}>
                <option value="">— pilih vendor —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.nama}</option>)}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[10px] font-medium text-muted-foreground">Nama Barang *</label>
              <input value={nama} onChange={e => setNama(e.target.value)}
                placeholder="mis. Semen Portland 50kg" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">Satuan</label>
              <input value={satuan} onChange={e => setSatuan(e.target.value)}
                placeholder="sak" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">Harga (Rp)</label>
              <input type="number" min={0} value={harga || ''}
                onChange={e => setHarga(Number(e.target.value) || 0)}
                inputMode="numeric" className={inputCls} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[10px] font-medium text-muted-foreground">Merek</label>
              <input value={merek} onChange={e => setMerek(e.target.value)}
                placeholder="Opsional" className={inputCls} />
            </div>
          </div>
          <Button onClick={simpan} disabled={kirim} className="gap-2 bg-navy hover:bg-navy/90 font-bold">
            {kirim ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Simpan Barang
          </Button>
        </>
      )}
    </div>
  )
}

// ══ TAB PURCHASE ORDER ══════════════════════════════════════════════════════
function TabPo({ pos, requests, vendors, semuaVendor, items, projectName, namaSaya, bolehUbah, bolehApprove, onUbah }: {
  pos: PurchaseOrder[]
  requests: MaterialRequest[]
  /** Vendor aktif — hanya ini yang boleh dipilih saat membuat PO. */
  vendors: Vendor[]
  /** Seluruh vendor, termasuk yang nonaktif: dipakai mencari nomor WA PO lama. */
  semuaVendor: Vendor[]
  items: VendorItem[]
  projectName: string
  namaSaya: string
  bolehUbah: boolean
  bolehApprove: boolean
  onUbah: () => void
}) {
  const [buatOpen, setBuatOpen] = useState(false)

  return (
    <div className="space-y-4">
      {/* Ringkasan request yang siap dipesan */}
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-bold text-navy text-sm">Menunggu Dipesan</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {requests.length === 0
                ? 'Tidak ada request material disetujui yang belum dipesan.'
                : `${requests.length} request material sudah disetujui dan belum penuh terpesan.`}
            </p>
          </div>
          {bolehUbah && requests.length > 0 && (
            <Button onClick={() => setBuatOpen(true)} size="sm"
              className="gap-1.5 bg-gold text-navy hover:bg-gold/90 font-bold shrink-0">
              <Plus className="w-4 h-4" /> Buat PO
            </Button>
          )}
        </div>
        {requests.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {requests.slice(0, 5).map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-xs rounded-lg bg-slate-50 px-2.5 py-2">
                <span className="font-semibold text-navy truncate">{r.nama}</span>
                <span className="text-muted-foreground shrink-0">
                  sisa {angka(sisaQty(r))} {r.satuan}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {buatOpen && (
        <FormPo
          requests={requests} vendors={vendors} items={items}
          projectName={projectName} jumlahPo={pos.length}
          onBatal={() => setBuatOpen(false)}
          onSukses={() => { setBuatOpen(false); onUbah() }} />
      )}

      {/* Daftar PO */}
      {pos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center">
          <FileText className="w-10 h-10 mx-auto opacity-30 mb-3" />
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Belum ada purchase order. PO dibuat dari request material yang sudah disetujui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pos.map(po => (
            <KartuPo key={po.id} po={po} namaSaya={namaSaya} vendors={semuaVendor}
              bolehUbah={bolehUbah} bolehApprove={bolehApprove} onUbah={onUbah} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Form pembuatan PO ───────────────────────────────────────────────────────
interface BarisPilih {
  request_id: string
  nama: string
  satuan: string
  sisa: number
  qty: number
  harga: number
  pilih: boolean
}

function FormPo({ requests, vendors, items, projectName, jumlahPo, onBatal, onSukses }: {
  requests: MaterialRequest[]
  vendors: Vendor[]
  items: VendorItem[]
  projectName: string
  jumlahPo: number
  onBatal: () => void
  onSukses: () => void
}) {
  const { toast } = useToast()
  const [vendorId, setVendorId] = useState('')
  const [butuh, setButuh] = useState('')
  const [ppnPct, setPpnPct] = useState(0)
  const [catatan, setCatatan] = useState('')
  const [kirim, setKirim] = useState(false)
  const [baris, setBaris] = useState<BarisPilih[]>(() => requests.map(r => ({
    request_id: r.id, nama: r.nama, satuan: r.satuan,
    sisa: sisaQty(r), qty: sisaQty(r), harga: 0, pilih: false,
  })))

  const vendor = vendors.find(v => v.id === vendorId)

  /** Nama proyek yang terbaca dari barang-barang yang sedang dipilih. */
  const proyekDariRequest = useMemo(() => {
    const dipesan = new Set(baris.filter(b => b.pilih && b.qty > 0).map(b => b.request_id))
    return requests.find(r => dipesan.has(r.id) && (r.project_name ?? '').trim())?.project_name?.trim() ?? ''
  }, [baris, requests])
  // Request yang menang: barang inilah yang benar-benar dipesan, jadi
  // proyeknya pasti. Proyek aktif hanya cadangan bila requestnya belum
  // membawa nama proyek sama sekali.
  const proyekPo = proyekDariRequest || projectName.trim()

  // Harga terisi otomatis dari katalog vendor; tetap bisa diubah manual karena
  // vendor belum tentu mendaftarkan setiap barang yang diminta.
  useEffect(() => {
    if (!vendorId) return
    setBaris(list => list.map(b => {
      const h = hargaVendorUntuk(items, vendorId, b.nama)
      return h > 0 ? { ...b, harga: h } : b
    }))
  }, [vendorId, items])

  const set = (i: number, patch: Partial<BarisPilih>) =>
    setBaris(list => list.map((b, n) => (n === i ? { ...b, ...patch } : b)))

  const dipilih = baris.filter(b => b.pilih && b.qty > 0)
  const total = useMemo(
    () => hitungTotalPo(dipilih.map(b => ({
      request_id: b.request_id, nama: b.nama, satuan: b.satuan,
      qty: b.qty, harga: b.harga, subtotal: 0,
    })), ppnPct),
    [dipilih, ppnPct],
  )

  async function terbitkan() {
    if (!vendor) { toast({ title: 'Pilih vendor dulu', variant: 'destructive' }); return }
    if (dipilih.length === 0) { toast({ title: 'Pilih minimal satu barang', variant: 'destructive' }); return }
    const lewat = dipilih.find(b => b.qty > b.sisa)
    if (lewat) {
      toast({
        title: 'Qty melebihi sisa',
        description: `${lewat.nama}: sisa yang belum dipesan hanya ${angka(lewat.sisa)} ${lewat.satuan}.`,
        variant: 'destructive',
      })
      return
    }

    setKirim(true)
    try {
      await procurementApi().createPo({
        nomor: nomorPo(jumlahPo),
        vendor_id: vendor.id,
        vendor_nama: vendor.nama,
        vendor_wa: vendor.no_wa,
        // Proyek aktif belum tentu ada — Procurement bisa dibuka langsung dari
        // Home tanpa memuat proyek dulu. Kalau dibiarkan kosong, PO ini menjadi
        // yatim: surat jalannya tercatat tapi barangnya tidak pernah sampai ke
        // stok proyek mana pun. Material Request yang dipesan tahu proyeknya,
        // jadi itu yang dipakai sebagai cadangan.
        project_name: proyekPo,
        butuh_tanggal: butuh || null,
        term: vendor.term,
        term_hari: vendor.term_hari,
        items: total.items as PoItem[],
        subtotal: total.subtotal,
        ppn_pct: ppnPct,
        ppn: total.ppn,
        total: total.total,
        catatan,
      })
      toast({ title: '✅ PO diterbitkan', description: 'Tanda tangani, lalu mintakan persetujuan sebelum dikirim ke vendor.' })
      onSukses()
    } catch (e) {
      toast({ title: 'Gagal menerbitkan PO', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally { setKirim(false) }
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-gold/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-navy text-sm">Buat Purchase Order</h3>
        <button onClick={onBatal} className="text-muted-foreground hover:text-navy"><X className="w-4 h-4" /></button>
      </div>

      {vendors.length === 0 && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed inline-flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Belum ada vendor aktif. Aktifkan vendor di tab Vendor lebih dulu — hanya vendor
          aktif yang bisa dipilih di sini.
        </p>
      )}

      {/* Pilih barang dari request */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-navy">1. Pilih barang yang dipesan</p>
        {baris.map((b, i) => (
          <div key={b.request_id} className={`rounded-xl border p-3 space-y-2 ${
            b.pilih ? 'border-navy bg-navy/[0.03]' : 'border-border'}`}>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={b.pilih}
                onChange={e => set(i, { pilih: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-navy shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-navy truncate">{b.nama}</p>
                <p className="text-[11px] text-muted-foreground">
                  belum terpesan {angka(b.sisa)} {b.satuan}
                </p>
              </div>
            </label>
            {b.pilih && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">Qty dipesan</label>
                  <input type="number" min={0} max={b.sisa} value={b.qty || ''}
                    onChange={e => set(i, { qty: Number(e.target.value) || 0 })}
                    inputMode="decimal" className={inputCls} />
                  {b.qty > b.sisa && (
                    <p className="text-[10px] text-rose-600">Melebihi sisa {angka(b.sisa)}.</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">Harga satuan (Rp)</label>
                  <input type="number" min={0} value={b.harga || ''}
                    onChange={e => set(i, { harga: Number(e.target.value) || 0 })}
                    inputMode="numeric" className={inputCls} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Vendor & syarat */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-navy">2. Vendor & syarat</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground">Vendor *</label>
            <select value={vendorId} onChange={e => setVendorId(e.target.value)}
              className={`${inputCls} font-semibold`}>
              <option value="">— pilih vendor —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.nama}</option>)}
            </select>
            {vendor && (
              <p className="text-[10px] text-muted-foreground">
                Pembayaran: {teksTerm(vendor.term, vendor.term_hari)}
                {vendor.no_wa ? ` · WA ${vendor.no_wa}` : ' · belum ada nomor WA'}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground">Dibutuhkan tanggal</label>
            <input type="date" value={butuh} onChange={e => setButuh(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground">PPN (%)</label>
            <input type="number" min={0} max={100} value={ppnPct || ''}
              onChange={e => setPpnPct(Number(e.target.value) || 0)}
              placeholder="0 = tanpa PPN" inputMode="numeric" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground">Catatan</label>
            <input value={catatan} onChange={e => setCatatan(e.target.value)}
              placeholder="mis. kirim ke gudang proyek" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="rounded-xl bg-slate-50 p-3 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{dipilih.length} barang</span>
          <span className="font-semibold text-navy tabular-nums">{fmt(total.subtotal)}</span>
        </div>
        {ppnPct > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">PPN {ppnPct}%</span>
            <span className="font-semibold text-navy tabular-nums">{fmt(total.ppn)}</span>
          </div>
        )}
        <div className="flex justify-between pt-1 border-t border-border">
          <span className="font-bold text-navy text-sm">Total</span>
          <span className="font-black text-navy text-base tabular-nums">{fmt(total.total)}</span>
        </div>
      </div>

      {/* PO tanpa proyek tidak bisa menyalurkan barangnya ke stok proyek mana
          pun. Diberitahukan di sini, sebelum PO terlanjur terbit. */}
      {dipilih.length > 0 && !proyekPo && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 leading-relaxed">
          <b>PO ini belum punya nama proyek.</b> Barang yang datang nanti tidak akan
          masuk ke stok proyek mana pun. Buka proyeknya dulu lewat Kontraktor AI,
          lalu buat PO-nya dari sana.
        </p>
      )}
      {dipilih.length > 0 && proyekPo && (
        <p className="text-[11px] text-muted-foreground bg-slate-50 border border-border rounded-xl p-2.5">
          PO ini untuk proyek <b>{proyekPo}</b>
          {proyekDariRequest ? ' — diambil dari barang yang dipilih.' : ' — dari proyek yang sedang aktif.'}
        </p>
      )}

      <Button onClick={terbitkan} disabled={kirim || !vendorId || dipilih.length === 0}
        className="w-full gap-2 bg-navy hover:bg-navy/90 font-bold h-11">
        {kirim ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        Terbitkan PO
      </Button>
    </div>
  )
}

// ── Kartu PO: tanda tangan → persetujuan → kirim ────────────────────────────
function KartuPo({ po, namaSaya, vendors, bolehUbah, bolehApprove, onUbah }: {
  po: PurchaseOrder
  namaSaya: string
  vendors: Vendor[]
  bolehUbah: boolean
  bolehApprove: boolean
  onUbah: () => void
}) {
  const { toast } = useToast()
  const [ttdUntuk, setTtdUntuk] = useState<'pembuat' | 'approver' | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [nama, setNama] = useState(namaSaya)
  const [jabatan, setJabatan] = useState('')
  const [proses, setProses] = useState(false)
  const [buka, setBuka] = useState(false)

  const izin = bolehKirimPo(po, vendors)

  async function simpanTtd() {
    if (!ttdUntuk) return
    if (!signature) { toast({ title: 'Tanda tangan belum digambar', variant: 'destructive' }); return }
    if (nama.trim().length < 2) { toast({ title: 'Nama wajib diisi', variant: 'destructive' }); return }

    setProses(true)
    try {
      const setelah = statusPoSetelah({
        status: po.status,
        pembuat_signature: ttdUntuk === 'pembuat' ? signature : po.pembuat_signature,
        approver_signature: ttdUntuk === 'approver' ? signature : po.approver_signature,
      })
      await procurementApi().signPo(po.id, ttdUntuk, {
        nama: nama.trim(), jabatan: jabatan.trim(), signature,
      }, setelah)
      toast({ title: ttdUntuk === 'pembuat' ? 'PO ditandatangani' : 'PO disetujui' })
      setTtdUntuk(null); setSignature(null)
      onUbah()
    } catch (e) {
      toast({ title: 'Gagal menyimpan', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally { setProses(false) }
  }

  async function tolak() {
    const alasan = window.prompt('Alasan penolakan PO ini?')
    if (alasan === null) return
    setProses(true)
    try {
      await procurementApi().rejectPo(po.id, alasan, namaSaya)
      toast({ title: 'PO ditolak' })
      onUbah()
    } catch (e) {
      toast({ title: 'Gagal', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally { setProses(false) }
  }

  async function kirimWa() {
    const wa = waEfektifPo(po, vendors)
    if (!wa) {
      toast({ title: 'Nomor WhatsApp vendor belum ada', variant: 'destructive' })
      return
    }
    setProses(true)
    try {
      // Nomor yang dipakai disimpan balik ke PO. Bila salinannya tadinya
      // kosong, dokumen ini jadi mencatat ke nomor mana ia benar-benar
      // dikirim — bukan tetap kosong selamanya.
      if (wa !== po.vendor_wa) {
        await procurementApi().updatePo(po.id, { vendor_wa: wa }).catch(() => { /* bukan penghalang kirim */ })
      }
      const ok = await procurementApi().kirimPo(po.id)
      if (!ok) throw new Error('Server menolak: pastikan PO sudah ditandatangani dan disetujui.')
      const link = poViewLink(po.view_token)

      // Tautan kedua: tempat vendor mengirim tagihannya nanti.
      //
      // Diterbitkan BARU pada tiap pengiriman, dan yang lama ikut mati. Ia
      // memberi kuasa MENULIS ke basis data kami dan memakai kuota AI kami —
      // berbeda dari tautan PO yang hanya membaca — dan pesan WhatsApp memang
      // diteruskan orang. Kuasa menulis tidak boleh menumpuk di tangan
      // salinan-salinan pesan lama yang sudah tersebar entah ke mana.
      const tokenInvoice = await procurementApi().terbitkanInvoiceToken(po.id)
        .catch(() => null)

      const pesan = pesanWaPo(po, link, tokenInvoice ? invoiceKirimLink(tokenInvoice) : null)
      window.open(waKe(wa, pesan), '_blank')
      toast({ title: 'PO dikirim', description: 'Qty terpesan pada request material sudah diperbarui.' })
      onUbah()
    } catch (e) {
      toast({ title: 'Gagal mengirim', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally { setProses(false) }
  }

  const items = po.items ?? []

  return (
    <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-navy text-sm truncate">{po.nomor}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {po.vendor_nama} · {items.length} barang · {teksTerm(po.term, po.term_hari)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${TONE_STATUS_PO[po.status]}`}>
            {LABEL_STATUS_PO[po.status]}
          </span>
          <p className="text-sm font-bold text-navy tabular-nums mt-1">{fmt(po.total)}</p>
        </div>
      </div>

      <button onClick={() => setBuka(v => !v)}
        className="text-[11px] font-bold text-muted-foreground hover:text-navy">
        {buka ? 'Sembunyikan rincian' : 'Lihat rincian'}
      </button>

      {buka && (
        <div className="space-y-1.5 rounded-xl bg-slate-50 p-3">
          {items.map((it, i) => (
            <div key={i} className="flex justify-between gap-2 text-[11px]">
              <span className="text-navy font-semibold truncate">{it.nama}</span>
              <span className="text-muted-foreground shrink-0">
                {angka(it.qty)} {it.satuan} × {fmt(it.harga)} = <b className="text-navy">{fmt(it.subtotal)}</b>
              </span>
            </div>
          ))}
          {po.catatan && <p className="text-[11px] text-muted-foreground pt-1.5 border-t border-border">📝 {po.catatan}</p>}
        </div>
      )}

      {/* Jejak pengesahan */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {([
          ['Ditandatangani', po.pembuat_nama, po.pembuat_signed_at],
          ['Disetujui', po.approver_nama, po.approver_signed_at],
        ] as Array<[string, string, string | null]>).map(([judul, org, kapan]) => (
          <div key={judul} className={`rounded-lg p-2 ${kapan ? 'bg-emerald-50' : 'bg-slate-100'}`}>
            <p className="text-muted-foreground">{judul}</p>
            <p className="font-bold text-navy truncate">{org || '—'}</p>
            {kapan && <p className="text-[10px] text-emerald-700">{new Date(kapan).toLocaleDateString('id-ID')}</p>}
          </div>
        ))}
      </div>

      {po.status === 'ditolak' && po.catatan_approval && (
        <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
          Ditolak: {po.catatan_approval}
        </p>
      )}

      {/* Aksi */}
      <div className="flex gap-1.5 pt-1 border-t border-border flex-wrap">
        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
          onClick={() => downloadPoPdf(po)}>
          <Download className="w-3 h-3" /> PDF
        </Button>

        {bolehUbah && !po.pembuat_signature && po.status !== 'ditolak' && (
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
            onClick={() => { setTtdUntuk('pembuat'); setJabatan('') }}>
            <PenLine className="w-3 h-3" /> Tanda Tangan
          </Button>
        )}

        {bolehApprove && po.pembuat_signature && !po.approver_signature && po.status !== 'ditolak' && (
          <>
            <Button size="sm" className="h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => { setTtdUntuk('approver'); setJabatan('') }}>
              <Check className="w-3 h-3" /> Setujui
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
              disabled={proses} onClick={tolak}>
              <X className="w-3 h-3" /> Tolak
            </Button>
          </>
        )}

        {bolehUbah && po.status !== 'terkirim' && po.status !== 'selesai' && (
          <Button size="sm" disabled={!izin.boleh || proses} onClick={kirimWa}
            title={izin.boleh ? 'Kirim PO ke WhatsApp vendor' : izin.alasan}
            className="h-7 text-[11px] gap-1 bg-gold text-navy hover:bg-gold/90 disabled:opacity-50">
            {proses ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Kirim ke Vendor
          </Button>
        )}

        {po.status === 'terkirim' && (
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
            onClick={() => { navigator.clipboard?.writeText(poViewLink(po.view_token)); toast({ title: 'Link PO disalin' }) }}>
            <Copy className="w-3 h-3" /> Link Vendor
          </Button>
        )}
      </div>

      {/* Alasan tombol kirim masih mati — supaya tidak perlu menebak */}
      {bolehUbah && !izin.boleh && po.status !== 'terkirim' && po.status !== 'selesai' && (
        <p className="text-[10px] text-muted-foreground">{izin.alasan}</p>
      )}

      {/* Panel tanda tangan */}
      {ttdUntuk && (
        <div className="rounded-xl border-2 border-gold/40 p-3 space-y-2.5">
          <p className="text-xs font-bold text-navy">
            {ttdUntuk === 'pembuat' ? 'Tanda tangan pembuat PO' : 'Persetujuan Owner / Manajemen / Project Manager'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input value={nama} onChange={e => setNama(e.target.value)}
              placeholder="Nama *" className={inputCls} />
            <input value={jabatan} onChange={e => setJabatan(e.target.value)}
              placeholder="Jabatan" className={inputCls} />
          </div>
          <SignaturePad onChange={setSignature} height={140} />
          <div className="flex gap-2">
            <Button size="sm" disabled={proses} onClick={simpanTtd}
              className="gap-1.5 bg-navy hover:bg-navy/90 font-bold">
              {proses ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Simpan
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setTtdUntuk(null); setSignature(null) }}>
              Batal
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
