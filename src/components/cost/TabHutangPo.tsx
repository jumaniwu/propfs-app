// ============================================================
// HUTANG VENDOR (PO) — sub-tab Akuntan
//
// Menjawab pertanyaan keuangan yang selama ini harus dicari manual:
// PO mana yang sudah dibayar, mana yang baru DP, dan mana yang jatuh temponya
// sudah lewat.
//
// Jatuh tempo dihitung dari TANGGAL NOTA yang dicatat logistik saat barang
// datang. PO yang barangnya belum datang sengaja ditandai "Belum Tertagih",
// bukan disembunyikan — supaya terlihat bahwa uangnya memang belum wajib
// keluar, bukan terlewat.
// ============================================================
import { useMemo, useRef, useState } from 'react'
import {
  Wallet, Loader2, X, Trash2, Upload, AlertTriangle, Receipt, CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { downscaleImage } from '@/lib/imageUtil'
import { penerimaanApi } from '@/lib/penerimaanApi'
import DaftarBulanan from './DaftarBulanan'
import {
  ringkasHutang, bayarMilikPo, teksTempo,
  LABEL_STATUS_BAYAR, TONE_STATUS_BAYAR,
  LABEL_STATUS_TAGIHAN, TONE_STATUS_TAGIHAN,
  LABEL_STATUS_TERIMA, LABEL_METODE,
  type DeliveryOrder, type PoPayment, type MetodeBayar, type RingkasTagihan,
} from '@/lib/penerimaan'
import type { PurchaseOrder } from '@/lib/procurement'

const inputCls = 'w-full h-10 rounded-lg border border-input bg-white px-3 text-sm text-navy'
const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`
const hariIni = () => new Date().toISOString().slice(0, 10)

type Saring = 'perlu_bayar' | 'semua' | 'lunas'

export default function TabHutangPo({ pos, dos, bayar, bolehUbah, onUbah }: {
  pos: PurchaseOrder[]
  dos: DeliveryOrder[]
  bayar: PoPayment[]
  bolehUbah: boolean
  onUbah: () => void
}) {
  const [saring, setSaring] = useState<Saring>('perlu_bayar')
  const [formPoId, setFormPoId] = useState<string | null>(null)

  const h = useMemo(() => ringkasHutang(pos, dos, bayar), [pos, dos, bayar])
  const terlihat = useMemo(() => {
    if (saring === 'lunas') return h.baris.filter(b => b.statusBayar === 'lunas')
    if (saring === 'perlu_bayar') return h.baris.filter(b => b.statusBayar !== 'lunas')
    return h.baris
  }, [h.baris, saring])

  const SARING: Array<[Saring, string, number]> = [
    ['perlu_bayar', 'Perlu Dibayar', h.baris.filter(b => b.statusBayar !== 'lunas').length],
    ['lunas', 'Lunas', h.baris.filter(b => b.statusBayar === 'lunas').length],
    ['semua', 'Semua', h.baris.length],
  ]

  return (
    <div className="space-y-4">
      {/* Ringkasan angka: yang mendesak ditaruh paling menonjol */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-white rounded-2xl border border-border p-3.5">
          <p className="text-[11px] font-bold text-muted-foreground">Total Hutang Vendor</p>
          <p className="text-lg font-black text-navy mt-0.5">{fmt(h.totalHutang)}</p>
        </div>
        <div className={`rounded-2xl border p-3.5 ${
          h.jumlahTerlambat > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-border'}`}>
          <p className="text-[11px] font-bold text-muted-foreground">Sudah Lewat Tempo</p>
          <p className={`text-lg font-black mt-0.5 ${h.jumlahTerlambat > 0 ? 'text-rose-700' : 'text-navy'}`}>
            {fmt(h.totalTerlambat)}
          </p>
          {h.jumlahTerlambat > 0 && (
            <p className="text-[11px] text-rose-700 font-bold">{h.jumlahTerlambat} PO</p>
          )}
        </div>
      </div>

      {h.jumlahJatuhTempoHariIni > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span><b>{h.jumlahJatuhTempoHariIni} PO jatuh tempo hari ini.</b> Bayar hari ini agar tidak telat.</span>
        </p>
      )}

      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {SARING.map(([key, label, n]) => (
          <button key={key} onClick={() => setSaring(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap shrink-0 ${
              saring === key ? 'bg-navy text-white shadow' : 'bg-white text-muted-foreground border border-border hover:bg-slate-50'}`}>
            {label}
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
              saring === key ? 'bg-white/20' : 'bg-slate-100'}`}>{n}</span>
          </button>
        ))}
      </div>

      {terlihat.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center">
          <Wallet className="w-10 h-10 mx-auto opacity-30 mb-3" />
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {h.baris.length === 0
              ? 'Belum ada PO yang dikirim ke vendor. Tagihan muncul di sini setelah PO terkirim.'
              : saring === 'perlu_bayar'
                ? 'Tidak ada tagihan yang perlu dibayar. Semua sudah lunas.'
                : 'Belum ada yang lunas.'}
          </p>
        </div>
      ) : (
        <DaftarBulanan
          baris={terlihat}
          tanggalDari={b => b.po.tanggal}
          nilaiDari={b => b.sisa}
          kunci={b => b.po.id}
          satuan="tagihan"
          render={b => (
            <KartuTagihan
              r={b} bayar={bayarMilikPo(b.po.id, bayar)}
              bolehUbah={bolehUbah}
              formTerbuka={formPoId === b.po.id}
              onBukaForm={() => setFormPoId(b.po.id)}
              onTutupForm={() => setFormPoId(null)}
              onUbah={onUbah}
            />
          )}
        />
      )}
    </div>
  )
}

function KartuTagihan({ r, bayar, bolehUbah, formTerbuka, onBukaForm, onTutupForm, onUbah }: {
  r: RingkasTagihan
  bayar: PoPayment[]
  bolehUbah: boolean
  formTerbuka: boolean
  onBukaForm: () => void
  onTutupForm: () => void
  onUbah: () => void
}) {
  const { toast } = useToast()
  const [lihatBukti, setLihatBukti] = useState<string | null>(null)

  async function hapusBayar(p: PoPayment) {
    if (!window.confirm(`Hapus pembayaran ${fmt(p.jumlah)} tanggal ${p.tanggal}?`)) return
    try {
      await penerimaanApi().deleteBayar(p.id)
      toast({ title: 'Pembayaran dihapus' })
      onUbah()
    } catch (e) {
      toast({ title: 'Gagal menghapus', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  const mendesak = r.statusTagihan === 'terlambat'
  return (
    <div className={`bg-white rounded-2xl border p-4 space-y-2.5 ${
      mendesak ? 'border-rose-300' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-navy text-sm truncate">{r.po.nomor}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {r.po.vendor_nama}{r.po.project_name && ` · ${r.po.project_name}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${TONE_STATUS_TAGIHAN[r.statusTagihan]}`}>
            {LABEL_STATUS_TAGIHAN[r.statusTagihan]}
          </span>
          {/* Lencana pembayaran hanya bila ia MENAMBAH keterangan.
              `statusTagihan === 'lunas'` diturunkan dari `statusBayar === 'lunas'`,
              jadi saat lunas keduanya menulis kata yang sama persis — dua
              lencana "LUNAS" bertumpuk yang tidak memberi tahu apa pun. Yang
              berpasangan justru berguna: "Lewat Tempo" + "Dibayar Sebagian". */}
          {r.statusBayar !== 'lunas' && (
            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${TONE_STATUS_BAYAR[r.statusBayar]}`}>
              {LABEL_STATUS_BAYAR[r.statusBayar]}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <p className="text-muted-foreground">Nilai PO</p>
          <p className="font-bold text-navy">{fmt(r.po.total)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Sudah dibayar</p>
          <p className="font-bold text-emerald-700">{fmt(r.dibayar)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Sisa</p>
          <p className={`font-bold ${r.sisa > 0 ? 'text-rose-700' : 'text-navy'}`}>{fmt(r.sisa)}</p>
        </div>
      </div>

      {/* Kelebihan bayar dikatakan, tidak ditelan diam-diam oleh "Sisa Rp 0". */}
      {r.lebih > 0 && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200
          rounded-lg p-2 leading-relaxed">
          <b>Terbayar {fmt(r.lebih)} lebih besar</b> daripada nilai PO-nya. Biasanya ini
          berarti ada pembayaran yang tercatat pada PO yang salah — periksa daftar
          pembayaran di bawah.
        </p>
      )}

      <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
        <span>📦 Barang: {LABEL_STATUS_TERIMA[r.statusTerima]}</span>
        {r.jatuhTempo ? (
          <span className={mendesak ? 'text-rose-700 font-bold' : ''}>
            🗓️ Jatuh tempo {r.jatuhTempo} · {teksTempo(r.hariLagi)}
          </span>
        ) : (
          <span>🗓️ Nota vendor belum dicatat — tempo belum berjalan</span>
        )}
      </div>

      {bayar.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-border">
          {bayar.map(p => (
            <div key={p.id} className="flex items-center gap-2 text-[11px] bg-slate-50 rounded-lg px-2.5 py-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-navy font-bold">{fmt(p.jumlah)} · {LABEL_METODE[p.metode]}</p>
                <p className="text-muted-foreground truncate">
                  {p.tanggal}{p.referensi && ` · Ref ${p.referensi}`}{p.catatan && ` · ${p.catatan}`}
                </p>
              </div>
              {p.bukti && (
                <button onClick={() => setLihatBukti(p.bukti)}
                  className="text-navy hover:underline font-bold shrink-0">Bukti</button>
              )}
              {bolehUbah && (
                <button onClick={() => hapusBayar(p)} className="text-muted-foreground hover:text-rose-600 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {bolehUbah && r.sisa > 0 && (
        formTerbuka
          ? <FormBayar po={r.po} sisa={r.sisa} onBatal={onTutupForm}
              onSukses={() => { onTutupForm(); onUbah() }} />
          : (
            <Button size="sm" onClick={onBukaForm}
              className="h-8 text-[11px] gap-1.5 bg-navy hover:bg-navy/90 font-bold">
              <Receipt className="w-3.5 h-3.5" /> Catat Pembayaran
            </Button>
          )
      )}

      {lihatBukti && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLihatBukti(null)}>
          <img src={lihatBukti} alt="Bukti pembayaran" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  )
}

function FormBayar({ po, sisa, onBatal, onSukses }: {
  po: PurchaseOrder
  sisa: number
  onBatal: () => void
  onSukses: () => void
}) {
  const { toast } = useToast()
  const berkasRef = useRef<HTMLInputElement>(null)
  // Nilai awal = seluruh sisa. Pelunasan lebih sering daripada cicilan kedua,
  // dan angkanya tetap bisa dikurangi bila ini memang DP.
  const [jumlah, setJumlah] = useState<number>(sisa)
  const [tanggal, setTanggal] = useState(hariIni())
  const [metode, setMetode] = useState<MetodeBayar>('transfer')
  const [referensi, setReferensi] = useState('')
  const [catatan, setCatatan] = useState('')
  const [bukti, setBukti] = useState<string | null>(null)
  const [kirim, setKirim] = useState(false)

  async function pilihBukti(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    try { setBukti(await downscaleImage(f, 1400, 0.75)) }
    catch (e) {
      toast({ title: 'Gagal memuat bukti', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally { if (berkasRef.current) berkasRef.current.value = '' }
  }

  async function simpan() {
    if (jumlah <= 0) {
      toast({ title: 'Jumlah pembayaran harus lebih dari 0', variant: 'destructive' })
      return
    }
    setKirim(true)
    try {
      await penerimaanApi().createBayar({
        po_id: po.id, tanggal, jumlah, metode,
        referensi: referensi.trim(), bukti, catatan: catatan.trim(),
      })
      toast({
        title: 'Pembayaran tercatat',
        description: jumlah >= sisa ? 'PO ini sekarang lunas.' : `Sisa ${fmt(sisa - jumlah)}.`,
      })
      onSukses()
    } catch (e) {
      toast({ title: 'Gagal menyimpan', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally { setKirim(false) }
  }

  return (
    <div className="rounded-xl border-2 border-gold/40 p-3.5 space-y-3 bg-slate-50/60">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-navy text-sm">Catat Pembayaran</h4>
        <button onClick={onBatal} className="text-muted-foreground hover:text-navy"><X className="w-4 h-4" /></button>
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5">
        <label className="block">
          <span className="block text-[11px] font-bold text-muted-foreground mb-1">
            Jumlah dibayar <span className="text-muted-foreground/70">· sisa {fmt(sisa)}</span>
          </span>
          <input type="number" min={0} step="any" value={jumlah || ''}
            onChange={e => setJumlah(Number(e.target.value) || 0)} className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-[11px] font-bold text-muted-foreground mb-1">Tanggal bayar</span>
          <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-[11px] font-bold text-muted-foreground mb-1">Metode</span>
          <select value={metode} onChange={e => setMetode(e.target.value as MetodeBayar)}
            className={`${inputCls} font-semibold`}>
            {(Object.keys(LABEL_METODE) as MetodeBayar[]).map(m => (
              <option key={m} value={m}>{LABEL_METODE[m]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-bold text-muted-foreground mb-1">Nomor referensi</span>
          <input value={referensi} onChange={e => setReferensi(e.target.value)}
            placeholder="mis. TRX20260727001" className={inputCls} />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-[11px] font-bold text-muted-foreground mb-1">Catatan</span>
          <input value={catatan} onChange={e => setCatatan(e.target.value)}
            placeholder="mis. DP 40%" className={inputCls} />
        </label>
      </div>

      <div>
        <span className="block text-[11px] font-bold text-muted-foreground mb-1">Bukti transfer</span>
        <div className="flex items-center gap-2">
          {bukti ? (
            <div className="relative">
              <img src={bukti} alt="" className="w-14 h-14 rounded-lg object-cover border border-border" />
              <button onClick={() => setBukti(null)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button onClick={() => berkasRef.current?.click()}
              className="h-10 px-3 rounded-lg border-2 border-dashed border-border text-[11px] font-bold text-muted-foreground hover:border-navy hover:text-navy inline-flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Unggah bukti
            </button>
          )}
          <input ref={berkasRef} type="file" accept="image/*" className="hidden"
            onChange={e => pilihBukti(e.target.files)} />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={simpan} disabled={kirim} className="gap-2 bg-navy hover:bg-navy/90 font-bold">
          {kirim ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
          Simpan Pembayaran
        </Button>
        <Button onClick={onBatal} variant="outline" disabled={kirim} className="font-bold">Batal</Button>
      </div>
    </div>
  )
}
