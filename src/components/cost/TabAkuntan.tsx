// ============================================================
// Tab AKUNTAN — Kontraktor AI
// Laba Rugi, Neraca, Pemasukan, Inventori, dan Opname lapangan
// (form opname bisa dibagikan via link untuk diisi tukang/mandor).
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import {
  Scale, TrendingUp, PackageOpen, ClipboardList, Download,
  Plus, Trash2, Link2, Loader2, CheckCircle2, RefreshCw, Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import NumInput from '@/components/siteplan/NumInput'
import { useCostStore } from '@/store/costStore'
import { useAkuntanStore } from '@/store/akuntanStore'
import { useToast } from '@/hooks/use-toast'
import {
  hitungLabaRugi, hitungInventori, hitungNeraca, progresOpname,
  type PemasukanEntry, type OpnameItem,
} from '@/lib/akuntan'
import { spkApi, opnameFillLink, type OpnameDoc } from '@/lib/spkApi'
import { buildReportSheet, reportXlsx } from '@/utils/excel'

const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`
const fmtJt = (n: number) => `Rp ${(n / 1_000_000).toFixed(2)} Jt`

type SubTab = 'labarugi' | 'pemasukan' | 'inventori' | 'opname'

export default function TabAkuntan() {
  const { toast } = useToast()
  const { realisasiEntries, projectInfo } = useCostStore()
  const {
    pemasukanEntries, inventoryAdjustments,
    addPemasukan, deletePemasukan, addAdjustment, deleteAdjustment,
  } = useAkuntanStore()

  const [sub, setSub] = useState<SubTab>('labarugi')

  // tarik data akuntan dari cloud sekali saat tab dibuka (sinkron antar perangkat)
  useEffect(() => { void useAkuntanStore.getState().loadFromCloud() }, [])
  const [opnames, setOpnames] = useState<OpnameDoc[]>([])
  const [opnameLoading, setOpnameLoading] = useState(false)
  const [opnameError, setOpnameError] = useState('')

  const labaRugi = useMemo(() => hitungLabaRugi(pemasukanEntries, realisasiEntries), [pemasukanEntries, realisasiEntries])
  const inventori = useMemo(() => hitungInventori(realisasiEntries, inventoryAdjustments), [realisasiEntries, inventoryAdjustments])
  const neraca = useMemo(() => hitungNeraca(pemasukanEntries, realisasiEntries, inventori), [pemasukanEntries, realisasiEntries, inventori])

  const loadOpnames = () => {
    setOpnameLoading(true)
    setOpnameError('')
    spkApi().listOpname()
      .then(setOpnames)
      .catch(e => setOpnameError(e instanceof Error ? e.message : String(e)))
      .finally(() => setOpnameLoading(false))
  }
  useEffect(() => { if (sub === 'opname') loadOpnames() }, [sub]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Export Excel: Laporan Akuntan lengkap ─────────────────────────────
  const exportAkuntan = () => {
    const wb = reportXlsx.utils.book_new()
    const projectName = projectInfo?.projectName?.trim() || 'Proyek'
    const printed = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
    const subtitle = `Proyek: ${projectName} · Dicetak: ${printed}`

    reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      title: 'NERACA (SEDERHANA)',
      subtitle,
      headers: ['Pos', 'Jumlah (Rp)'],
      rows: [
        ['ASET — Kas & Bank', neraca.kas],
        ['ASET — Persediaan Material', neraca.persediaan],
        ['PASIVA — Modal Disetor', neraca.modalDisetor],
        ['PASIVA — Laba Berjalan', neraca.labaBerjalan],
      ],
      sumCols: [],
    }), 'Neraca')

    reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      title: 'LAPORAN LABA RUGI',
      subtitle,
      headers: ['Uraian', 'Jumlah (Rp)'],
      rows: [
        ...labaRugi.pemasukanPerKategori.map(p => [`PEMASUKAN — ${p.kategori}`, p.jumlah] as [string, number]),
        ['TOTAL PEMASUKAN', labaRugi.totalPemasukan],
        ...labaRugi.pengeluaranPerKategori.map(p => [`PENGELUARAN — ${p.kategori}`, -p.jumlah] as [string, number]),
        ['TOTAL PENGELUARAN', -labaRugi.totalPengeluaran],
        ['LABA / (RUGI)', labaRugi.laba],
      ],
      sumCols: [],
    }), 'Laba Rugi')

    reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      title: 'DAFTAR PEMASUKAN',
      subtitle,
      headers: ['No', 'Tanggal', 'Sumber', 'Kategori', 'Jumlah (Rp)', 'Keterangan'],
      rows: pemasukanEntries.map((p, i) => [i + 1, p.tanggal, p.sumber, p.kategori, p.jumlah, p.keterangan ?? '']),
      sumCols: [4],
    }), 'Pemasukan')

    reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      title: 'DAFTAR PENGELUARAN',
      subtitle,
      headers: ['No', 'Tanggal', 'Tipe', 'Keterangan', 'Kategori', 'Jumlah (Rp)'],
      rows: realisasiEntries.map((e, i) => [i + 1, e.tanggal, e.tipe, e.keterangan, e.kategori, e.jumlah]),
      sumCols: [5],
    }), 'Pengeluaran')

    reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      title: 'DATA INVENTORI MATERIAL',
      subtitle,
      headers: ['No', 'Material', 'Satuan', 'Masuk', 'Keluar/Terpakai', 'Stok', 'Harga Rata (Rp)', 'Nilai Stok (Rp)'],
      rows: inventori.map((r, i) => [i + 1, r.nama, r.satuan, r.masuk, r.keluar, r.stok, Math.round(r.hargaRata), Math.round(r.nilai)]),
      sumCols: [7],
    }), 'Inventori')

    reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      title: 'LAPORAN OPNAME LAPANGAN',
      subtitle,
      headers: ['No', 'Tanggal', 'Judul', 'Status', 'Diisi Oleh', 'Progres (%)'],
      rows: opnames.map((o, i) => [i + 1, o.tanggal, o.judul, o.status, o.filled_by ?? '-', Number(progresOpname(o.items).toFixed(1))]),
      sumCols: [],
    }), 'Opname')

    const dateStr = new Date().toLocaleDateString('id-ID').replace(/\//g, '')
    const safeName = projectName.replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '_') || 'Proyek'
    reportXlsx.writeFile(wb, `Laporan_Akuntan_${safeName}_${dateStr}.xlsx`)
    toast({ title: '✅ Laporan Akuntan diunduh!', description: '6 sheet: Neraca, Laba Rugi, Pemasukan, Pengeluaran, Inventori, Opname.' })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl md:text-2xl font-serif font-bold text-navy flex items-center gap-2">
          <Scale className="w-6 h-6" /> Akuntan
        </h2>
        <Button onClick={exportAkuntan} variant="outline"
          className="gap-2 font-bold text-navy border-navy/20 hover:bg-navy hover:text-white">
          <Download className="w-4 h-4" /> Laporan Akuntan (Excel)
        </Button>
      </div>

      {/* Sub-tab */}
      <div className="flex gap-1.5 flex-wrap">
        {([
          ['labarugi', 'Laba Rugi & Neraca', <Scale key="i" className="w-3.5 h-3.5" />],
          ['pemasukan', 'Pemasukan', <TrendingUp key="i" className="w-3.5 h-3.5" />],
          ['inventori', 'Inventori', <PackageOpen key="i" className="w-3.5 h-3.5" />],
          ['opname', 'Opname', <ClipboardList key="i" className="w-3.5 h-3.5" />],
        ] as Array<[SubTab, string, JSX.Element]>).map(([key, label, icon]) => (
          <button key={key} onClick={() => setSub(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all ${
              sub === key ? 'bg-navy text-white shadow' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {sub === 'labarugi' && <SubLabaRugi labaRugi={labaRugi} neraca={neraca} />}
      {sub === 'pemasukan' && (
        <SubPemasukan entries={pemasukanEntries} onAdd={addPemasukan} onDelete={deletePemasukan} />
      )}
      {sub === 'inventori' && (
        <SubInventori inventori={inventori} adjustments={inventoryAdjustments}
          onAdd={addAdjustment} onDelete={deleteAdjustment} />
      )}
      {sub === 'opname' && (
        <SubOpname opnames={opnames} loading={opnameLoading} error={opnameError}
          onReload={loadOpnames} projectName={projectInfo?.projectName ?? ''} />
      )}
    </div>
  )
}

// ── Sub: Laba Rugi & Neraca ─────────────────────────────────────────────────
function SubLabaRugi({ labaRugi, neraca }: {
  labaRugi: ReturnType<typeof hitungLabaRugi>
  neraca: ReturnType<typeof hitungNeraca>
}) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Laba Rugi */}
      <div className="bg-white rounded-3xl border border-border p-5 space-y-3">
        <h3 className="font-bold text-navy text-sm">Laporan Laba Rugi</h3>
        <div className="space-y-1.5 text-sm">
          {labaRugi.pemasukanPerKategori.map(p => (
            <div key={p.kategori} className="flex justify-between text-emerald-700">
              <span>+ {p.kategori}</span><span>{fmt(p.jumlah)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold border-t border-border pt-1.5">
            <span>Total Pemasukan</span><span className="text-emerald-700">{fmt(labaRugi.totalPemasukan)}</span>
          </div>
          {labaRugi.pengeluaranPerKategori.map(p => (
            <div key={p.kategori} className="flex justify-between text-red-600">
              <span>− {p.kategori}</span><span>({fmt(p.jumlah)})</span>
            </div>
          ))}
          <div className="flex justify-between font-bold border-t border-border pt-1.5">
            <span>Total Pengeluaran</span><span className="text-red-600">({fmt(labaRugi.totalPengeluaran)})</span>
          </div>
          <div className={`flex justify-between font-black text-base rounded-xl px-3 py-2 mt-2 ${
            labaRugi.laba >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
            <span>LABA / (RUGI)</span><span>{fmt(labaRugi.laba)}</span>
          </div>
        </div>
        {labaRugi.perBulan.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-bold text-navy mb-1.5">Per Bulan</p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-navy/5 text-navy">
                  <tr>
                    <th className="px-3 py-1.5 text-left">Bulan</th>
                    <th className="px-3 py-1.5 text-right">Masuk</th>
                    <th className="px-3 py-1.5 text-right">Keluar</th>
                    <th className="px-3 py-1.5 text-right">Laba</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {labaRugi.perBulan.map(b => (
                    <tr key={b.bulan}>
                      <td className="px-3 py-1.5">{b.bulan}</td>
                      <td className="px-3 py-1.5 text-right text-emerald-700">{fmtJt(b.pemasukan)}</td>
                      <td className="px-3 py-1.5 text-right text-red-600">{fmtJt(b.pengeluaran)}</td>
                      <td className={`px-3 py-1.5 text-right font-bold ${b.laba >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmtJt(b.laba)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Neraca */}
      <div className="bg-white rounded-3xl border border-border p-5 space-y-3">
        <h3 className="font-bold text-navy text-sm">Neraca (Sederhana)</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-blue-lt/60 p-3 space-y-1.5">
            <p className="text-xs font-bold text-blue-dk uppercase">Aset</p>
            <div className="flex justify-between"><span>Kas & Bank</span><span className="font-bold">{fmtJt(neraca.kas)}</span></div>
            <div className="flex justify-between"><span>Persediaan</span><span className="font-bold">{fmtJt(neraca.persediaan)}</span></div>
            <div className="flex justify-between border-t border-blue-200 pt-1 font-black">
              <span>Total</span><span>{fmtJt(neraca.totalAset)}</span>
            </div>
          </div>
          <div className="rounded-2xl bg-gold-lt/50 p-3 space-y-1.5">
            <p className="text-xs font-bold text-navy uppercase">Pasiva</p>
            <div className="flex justify-between"><span>Modal Disetor</span><span className="font-bold">{fmtJt(neraca.modalDisetor)}</span></div>
            <div className="flex justify-between"><span>Laba Berjalan</span><span className="font-bold">{fmtJt(neraca.labaBerjalan)}</span></div>
            <div className="flex justify-between border-t border-gold/40 pt-1 font-black">
              <span>Total</span><span>{fmtJt(neraca.totalPasiva)}</span>
            </div>
          </div>
        </div>
        <p className={`text-xs rounded-xl px-3 py-2 ${neraca.seimbang ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {neraca.seimbang ? '✅ Neraca seimbang (Aset = Pasiva).' : '⚠️ Selisih pembulatan neraca — periksa data pemasukan/pengeluaran.'}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Catatan: pemasukan berkategori <b>Modal Disetor</b> masuk ke pasiva modal; material yang masih menjadi stok dihitung sebagai aset persediaan.
        </p>
      </div>
    </div>
  )
}

// ── Sub: Pemasukan ──────────────────────────────────────────────────────────
function SubPemasukan({ entries, onAdd, onDelete }: {
  entries: PemasukanEntry[]
  onAdd: (p: Omit<PemasukanEntry, 'id'>) => void
  onDelete: (id: string) => void
}) {
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10))
  const [sumber, setSumber] = useState('')
  const [kategori, setKategori] = useState<PemasukanEntry['kategori']>('termin')
  const [jumlah, setJumlah] = useState(0)

  const total = entries.reduce((s, p) => s + p.jumlah, 0)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-border p-5 space-y-3">
        <h3 className="font-bold text-navy text-sm">Catat Pemasukan</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Tanggal</Label>
            <Input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sumber</Label>
            <Input value={sumber} onChange={e => setSumber(e.target.value)} placeholder="mis. Termin 1 Ruko A" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kategori</Label>
            <Select value={kategori} onValueChange={v => setKategori(v as PemasukanEntry['kategori'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="termin">Termin Proyek</SelectItem>
                <SelectItem value="penjualan">Penjualan Unit</SelectItem>
                <SelectItem value="modal">Modal Disetor</SelectItem>
                <SelectItem value="lainnya">Lainnya</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Jumlah (Rp)</Label>
            <NumInput value={jumlah} onValue={setJumlah} min={0} placeholder="0" />
          </div>
        </div>
        <Button
          className="gap-2 bg-navy hover:bg-navy/90 font-bold"
          disabled={!sumber.trim() || jumlah <= 0}
          onClick={() => { onAdd({ tanggal, sumber: sumber.trim(), kategori, jumlah }); setSumber(''); setJumlah(0) }}
        >
          <Plus className="w-4 h-4" /> Tambah Pemasukan
        </Button>
      </div>

      <div className="bg-white rounded-3xl border border-border p-5 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-navy text-sm">Daftar Pemasukan ({entries.length})</h3>
          <span className="text-sm font-black text-emerald-700">{fmt(total)}</span>
        </div>
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Belum ada pemasukan tercatat.</p>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto overscroll-contain">
            {[...entries].reverse().map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 border border-border rounded-xl p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy truncate">{p.sumber}</p>
                  <p className="text-[11px] text-muted-foreground">📅 {p.tanggal} · {p.kategori}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-emerald-700">{fmt(p.jumlah)}</span>
                  <button onClick={() => onDelete(p.id)} className="p-1.5 text-muted-foreground hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub: Inventori ──────────────────────────────────────────────────────────
function SubInventori({ inventori, adjustments, onAdd, onDelete }: {
  inventori: ReturnType<typeof hitungInventori>
  adjustments: ReturnType<typeof useAkuntanStore.getState>['inventoryAdjustments']
  onAdd: (a: Omit<(typeof adjustments)[number], 'id'>) => void
  onDelete: (id: string) => void
}) {
  const [nama, setNama] = useState('')
  const [satuan, setSatuan] = useState('pcs')
  const [qty, setQty] = useState(0)
  const [arah, setArah] = useState<'keluar' | 'masuk'>('keluar')
  const totalNilai = inventori.reduce((s, r) => s + r.nilai, 0)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-border p-5 space-y-3">
        <h3 className="font-bold text-navy text-sm">Penyesuaian Stok (pemakaian / koreksi)</h3>
        <p className="text-[11px] text-muted-foreground">
          Stok <b>masuk</b> otomatis dari pembelian material di Realisasi Biaya. Catat pemakaian di lapangan sebagai <b>keluar</b>.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="space-y-1 lg:col-span-2">
            <Label className="text-xs">Nama Material</Label>
            <Input value={nama} onChange={e => setNama(e.target.value)} placeholder="mis. Semen 50kg" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Arah</Label>
            <Select value={arah} onValueChange={v => setArah(v as 'keluar' | 'masuk')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="keluar">Keluar / Terpakai</SelectItem>
                <SelectItem value="masuk">Masuk (koreksi)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Qty</Label>
            <NumInput value={qty} onValue={setQty} min={0} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Satuan</Label>
            <Input value={satuan} onChange={e => setSatuan(e.target.value)} />
          </div>
        </div>
        <Button
          className="gap-2 bg-navy hover:bg-navy/90 font-bold"
          disabled={!nama.trim() || qty <= 0}
          onClick={() => {
            onAdd({
              tanggal: new Date().toISOString().slice(0, 10),
              nama: nama.trim(), satuan,
              qty: arah === 'keluar' ? -qty : qty,
            })
            setNama(''); setQty(0)
          }}
        >
          <Plus className="w-4 h-4" /> Catat Penyesuaian
        </Button>
        {adjustments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {adjustments.slice(-8).map(a => (
              <span key={a.id} className="inline-flex items-center gap-1 text-[10px] bg-muted rounded-full px-2 py-1">
                {a.nama}: {a.qty > 0 ? '+' : ''}{a.qty} {a.satuan}
                <button onClick={() => onDelete(a.id)} className="text-muted-foreground hover:text-red-600">✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-border p-5 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-navy text-sm">Data Inventori ({inventori.length} material)</h3>
          <span className="text-sm font-black text-navy">Nilai stok: {fmt(totalNilai)}</span>
        </div>
        {inventori.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            Belum ada data. Catat pembelian material lewat tab Realisasi Biaya.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border max-h-[55vh] overflow-y-auto overscroll-contain">
            <table className="w-full text-xs">
              <thead className="bg-navy text-white sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Material</th>
                  <th className="px-3 py-2 text-right">Masuk</th>
                  <th className="px-3 py-2 text-right">Keluar</th>
                  <th className="px-3 py-2 text-right">Stok</th>
                  <th className="px-3 py-2 text-right">Nilai (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inventori.map((r, i) => (
                  <tr key={r.nama} className={i % 2 ? 'bg-slate-50' : ''}>
                    <td className="px-3 py-2 font-semibold text-navy">{r.nama} <span className="text-muted-foreground">({r.satuan})</span></td>
                    <td className="px-3 py-2 text-right">{r.masuk.toLocaleString('id-ID')}</td>
                    <td className="px-3 py-2 text-right">{r.keluar.toLocaleString('id-ID')}</td>
                    <td className={`px-3 py-2 text-right font-bold ${r.stok < 0 ? 'text-red-600' : ''}`}>{r.stok.toLocaleString('id-ID')}</td>
                    <td className="px-3 py-2 text-right">{Math.round(r.nilai).toLocaleString('id-ID')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub: Opname ─────────────────────────────────────────────────────────────
function SubOpname({ opnames, loading, error, onReload, projectName }: {
  opnames: OpnameDoc[]
  loading: boolean
  error: string
  onReload: () => void
  projectName: string
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [judul, setJudul] = useState('')
  const [petugas, setPetugas] = useState('')
  const [items, setItems] = useState<OpnameItem[]>([
    { uraian: '', satuan: 'm2', vol_rencana: 0, vol_realisasi: 0 },
  ])
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState<OpnameDoc | null>(null)

  const setItem = (idx: number, patch: Partial<OpnameItem>) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))

  async function handleCreate() {
    const valid = items.filter(i => i.uraian.trim() && i.vol_rencana > 0)
    if (!judul.trim() || valid.length === 0) return
    setSaving(true)
    try {
      const doc = await spkApi().createOpname({
        judul: judul.trim(),
        project_name: projectName,
        tanggal: new Date().toISOString().slice(0, 10),
        petugas: petugas.trim(),
        items: valid,
      })
      setOpen(false)
      setJudul(''); setPetugas('')
      setItems([{ uraian: '', satuan: 'm2', vol_rencana: 0, vol_realisasi: 0 }])
      onReload()
      const link = opnameFillLink(doc.fill_token)
      navigator.clipboard?.writeText(link).catch(() => undefined)
      toast({ title: '✅ Form opname dibuat!', description: 'Link pengisian sudah disalin — bagikan ke tukang/mandor.' })
    } catch (e) {
      toast({ title: 'Gagal membuat form', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const shareWa = (o: OpnameDoc) => {
    const link = opnameFillLink(o.fill_token)
    const msg = `Selamat siang.\n\nMohon isi *Form Opname* pekerjaan berikut dari HP:\n${o.judul}${o.project_name ? ` — ${o.project_name}` : ''}\n\n👉 ${link}\n\nTerima kasih.`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground max-w-md">
          Buat form opname → bagikan link ke tukang/mandor → mereka isi progres dari HP tanpa login → hasil masuk otomatis ke sini.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onReload}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat Ulang
          </Button>
          <Button size="sm" className="gap-1.5 bg-navy hover:bg-navy/90 font-bold" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" /> Buat Form Opname
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
          {error} — pastikan migrasi SQL <code>migration_kontraktor_spk_opname.sql</code> sudah dijalankan di Supabase.
        </p>
      )}

      {loading ? (
        <div className="py-10 flex justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : opnames.length === 0 && !error ? (
        <p className="text-xs text-muted-foreground py-8 text-center bg-white rounded-3xl border border-border">
          Belum ada form opname.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {opnames.map(o => {
            const pct = progresOpname(o.items)
            return (
              <div key={o.id} className="bg-white rounded-2xl border border-border p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-navy text-sm">{o.judul}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                    o.status === 'terbuka' ? 'bg-amber-100 text-amber-700'
                      : o.status === 'terisi' ? 'bg-blue-100 text-blue-700'
                        : 'bg-emerald-100 text-emerald-700'}`}>
                    {o.status}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  📅 {o.tanggal} · {o.items.length} item{o.filled_by && <> · diisi {o.filled_by}</>}
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-1.5">
                    <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <span className="text-[11px] font-bold text-navy">{pct.toFixed(0)}%</span>
                </div>
                <div className="flex gap-1.5 flex-wrap pt-1">
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                    onClick={() => {
                      navigator.clipboard?.writeText(opnameFillLink(o.fill_token))
                      toast({ title: 'Link disalin!', description: 'Tempel di WhatsApp/SMS ke tukang.' })
                    }}>
                    <Link2 className="w-3 h-3" /> Salin Link
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => shareWa(o)}>
                    <Send className="w-3 h-3" /> WhatsApp
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setDetail(o)}>
                    Detail
                  </Button>
                  {o.status === 'terisi' && (
                    <Button size="sm" className="h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700"
                      onClick={async () => { await spkApi().approveOpname(o.id); onReload() }}>
                      <CheckCircle2 className="w-3 h-3" /> Setujui
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Dialog buat form */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buat Form Opname untuk Tukang</DialogTitle>
            <DialogDescription>
              Daftarkan item pekerjaan dan volume rencananya. Tukang/mandor mengisi realisasi lewat link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Judul Opname</Label>
                <Input value={judul} onChange={e => setJudul(e.target.value)} placeholder="mis. Opname Minggu ke-3 Blok A" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Petugas / Mandor (opsional)</Label>
                <Input value={petugas} onChange={e => setPetugas(e.target.value)} placeholder="mis. Pak Yono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Item Pekerjaan</Label>
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_72px_88px_32px] gap-2 items-center">
                  <Input value={it.uraian} onChange={e => setItem(i, { uraian: e.target.value })}
                    placeholder={`Uraian pekerjaan ${i + 1}`} className="text-sm" />
                  <Input value={it.satuan} onChange={e => setItem(i, { satuan: e.target.value })}
                    placeholder="satuan" className="text-sm" />
                  <NumInput value={it.vol_rencana} onValue={n => setItem(i, { vol_rencana: n })} min={0} placeholder="vol" />
                  <button onClick={() => setItems(prev => prev.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-red-600 disabled:opacity-30"
                    disabled={items.length <= 1}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                onClick={() => setItems(prev => [...prev, { uraian: '', satuan: 'm2', vol_rencana: 0, vol_realisasi: 0 }])}>
                <Plus className="w-3.5 h-3.5" /> Tambah Item
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button className="bg-navy hover:bg-navy/90 font-bold gap-2"
              disabled={saving || !judul.trim() || !items.some(i => i.uraian.trim() && i.vol_rencana > 0)}
              onClick={handleCreate}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Buat & Salin Link</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog detail / laporan opname */}
      <Dialog open={!!detail} onOpenChange={o => { if (!o) setDetail(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>Laporan Opname — {detail.judul}</DialogTitle>
                <DialogDescription>
                  📅 {detail.tanggal} · Status: {detail.status}
                  {detail.filled_by && <> · Diisi oleh {detail.filled_by}{detail.filled_at && ` (${new Date(detail.filled_at).toLocaleString('id-ID')})`}</>}
                </DialogDescription>
              </DialogHeader>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-navy text-white">
                    <tr>
                      <th className="px-3 py-2 text-left">Uraian</th>
                      <th className="px-3 py-2 text-right">Rencana</th>
                      <th className="px-3 py-2 text-right">Realisasi</th>
                      <th className="px-3 py-2 text-right">%</th>
                      <th className="px-3 py-2 text-left">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {detail.items.map((it, i) => (
                      <tr key={i} className={i % 2 ? 'bg-slate-50' : ''}>
                        <td className="px-3 py-2">{it.uraian}</td>
                        <td className="px-3 py-2 text-right">{it.vol_rencana.toLocaleString('id-ID')} {it.satuan}</td>
                        <td className="px-3 py-2 text-right">{it.vol_realisasi.toLocaleString('id-ID')} {it.satuan}</td>
                        <td className="px-3 py-2 text-right font-bold">
                          {it.vol_rencana > 0 ? ((it.vol_realisasi / it.vol_rencana) * 100).toFixed(0) : 0}%
                        </td>
                        <td className="px-3 py-2">{it.catatan ?? ''}</td>
                      </tr>
                    ))}
                    <tr className="bg-gold-lt/50 font-bold">
                      <td className="px-3 py-2">PROGRES TOTAL</td>
                      <td colSpan={4} className="px-3 py-2 text-right">{progresOpname(detail.items).toFixed(1)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => {
                  navigator.clipboard?.writeText(opnameFillLink(detail.fill_token))
                  toast({ title: 'Link disalin!' })
                }}>
                  <Link2 className="w-3.5 h-3.5" /> Salin Link Form
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
