// ============================================================
// Akuntan — sub-tab NON-PROYEK
//
// Dua hal yang tidak dimiliki proyek mana pun, dan karena itu selama ini tidak
// punya tempat sama sekali di aplikasi:
//
//   1. BIAYA KANTOR — sewa, ATK, listrik, langganan. Beban perusahaan.
//   2. ALAT KERJA — genset, scaffolding, molen. Aset perusahaan yang dipakai
//      berulang di proyek yang berganti-ganti.
//
// Keduanya disatukan di satu tempat karena pertanyaannya sama: "uang
// perusahaan ini keluar untuk apa, kalau bukan untuk proyek?"
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import {
  Wrench, Building2, Plus, Trash2, Loader2, RefreshCw, MapPin, Download, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useAkuntanStore } from '@/store/akuntanStore'
import { asetApi } from '@/lib/asetApi'
import {
  nilaiBuku, sisaUmur, lokasiAlat, siapSimpanAset, masihDimiliki,
  totalAsetTetap, totalPerolehan, penyusutanBulanIni,
  ASET_KOSONG, PILIHAN_UMUR, LABEL_KONDISI, TONE_KONDISI,
  type AsetAlat, type KondisiAlat,
} from '@/lib/asetAlat'
import { poKantorBelumTercatat, type UsulDariPo } from '@/lib/sinkronRealisasi'
import { jenisPo } from '@/lib/procurement'
import type { PurchaseOrder } from '@/lib/procurement'
import type { DeliveryOrder, PoPayment } from '@/lib/penerimaan'
import type { RealisasiEntry } from '@/lib/ai-realisasi'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`
const inputCls = 'w-full rounded-xl border border-border bg-white px-3 py-2 text-sm '
  + 'focus:outline-none focus:ring-2 focus:ring-gold/40'

export default function SubNonProyek({ pos, dos, bayar, daftarProyek, bolehUbah, onUbah }: {
  pos: PurchaseOrder[]
  dos: DeliveryOrder[]
  bayar: PoPayment[]
  daftarProyek: Array<{ id: string; nama: string }>
  bolehUbah: boolean
  onUbah: () => void
}) {
  return (
    <div className="space-y-4">
      <BagianBiayaKantor pos={pos} dos={dos} bayar={bayar} bolehUbah={bolehUbah} onUbah={onUbah} />
      <BagianAset daftarProyek={daftarProyek} pos={pos} dos={dos}
        bolehUbah={bolehUbah} onUbah={onUbah} />
    </div>
  )
}

// ── Biaya kantor ────────────────────────────────────────────────────────────

function BagianBiayaKantor({ pos, dos, bayar, bolehUbah, onUbah }: {
  pos: PurchaseOrder[]
  dos: DeliveryOrder[]
  bayar: PoPayment[]
  bolehUbah: boolean
  onUbah: () => void
}) {
  const { toast } = useToast()
  const { biayaUmumEntries, addBiayaUmum, deleteBiayaUmum } = useAkuntanStore()
  const [buka, setBuka] = useState(false)
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10))
  const [uraian, setUraian] = useState('')
  const [jumlah, setJumlah] = useState(0)

  /**
   * PO biaya kantor yang barangnya sudah datang tetapi belum ada di buku.
   * DITAWARKAN, tidak pernah dimasukkan sendiri — sama seperti panel dari
   * Procurement di Realisasi Biaya.
   */
  const usul = useMemo<UsulDariPo[]>(
    () => poKantorBelumTercatat(dos, pos, biayaUmumEntries, bayar),
    [dos, pos, biayaUmumEntries, bayar],
  )

  const total = biayaUmumEntries.reduce((s, e) => s + (Number(e.jumlah) || 0), 0)

  function tambahManual() {
    if (!uraian.trim() || jumlah <= 0) return
    addBiayaUmum([{
      tipe: 'operasional', tanggal, keterangan: uraian.trim(),
      kategori: 'kantor', jumlah, status: '✅ Dicatat',
    }])
    setUraian(''); setJumlah(0)
    toast({ title: 'Biaya kantor dicatat' })
  }

  function terimaUsul(u: UsulDariPo) {
    addBiayaUmum(u.entri)
    toast({
      title: `${u.entri.length} baris dicatat`,
      description: `Dari ${u.po.nomor} — masuk beban perusahaan, bukan biaya proyek.`,
    })
    onUbah()
  }

  return (
    <div className="bg-white rounded-3xl border border-border p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-4 h-4 text-navy shrink-0" />
          <h3 className="font-bold text-navy text-sm truncate">
            Biaya Kantor ({biayaUmumEntries.length})
          </h3>
        </div>
        <span className="text-sm font-black text-rose-600 tabular-nums shrink-0">{fmt(total)}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Beban perusahaan yang bukan milik proyek mana pun. Ikut mengurangi laba di
        lingkup <b>Konsolidasi</b> dan <b>Umum (Non-Proyek)</b> — tidak pernah mengurangi
        laba sebuah proyek.
      </p>

      {/* Tawaran dari PO biaya kantor yang barangnya sudah datang */}
      {usul.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-[11px] font-bold text-amber-900">
            {usul.length} pembelian kantor sudah datang tetapi belum ada di buku.
          </p>
          {usul.map(u => (
            <div key={u.suratJalan.id} className="rounded-lg bg-white border border-amber-200 p-2.5
              flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-navy truncate">{u.po.nomor}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {u.po.vendor_nama} · {u.entri.length} baris · {fmt(u.total)}
                </p>
              </div>
              {bolehUbah && (
                <Button size="sm" data-terima-usul onClick={() => terimaUsul(u)}
                  className="shrink-0 gap-1 text-[11px] font-bold bg-navy hover:bg-navy/90 h-8">
                  <Download className="w-3 h-3" /> Catat
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Catat manual */}
      {bolehUbah && (buka ? (
        <div className="rounded-xl border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-navy">Catat biaya kantor</p>
            <button onClick={() => setBuka(false)} className="text-muted-foreground hover:text-navy">
              <X className="w-4 h-4" />
            </button>
          </div>
          <input data-biaya-uraian value={uraian} onChange={e => setUraian(e.target.value)}
            placeholder="mis. Sewa kantor Agustus" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)}
              className={inputCls} />
            <input type="number" min={0} data-biaya-jumlah value={jumlah || ''}
              onChange={e => setJumlah(Number(e.target.value) || 0)}
              placeholder="Jumlah (Rp)" inputMode="numeric" className={inputCls} />
          </div>
          <Button data-simpan-biaya onClick={tambahManual} disabled={!uraian.trim() || jumlah <= 0}
            className="w-full gap-1.5 bg-navy hover:bg-navy/90 font-bold h-10">
            <Plus className="w-4 h-4" /> Catat Biaya
          </Button>
        </div>
      ) : (
        <button data-buka-biaya onClick={() => setBuka(true)}
          className="w-full rounded-xl border-2 border-dashed border-border py-2.5
            text-[11px] font-bold text-navy hover:bg-slate-50">
          + Catat biaya kantor
        </button>
      ))}

      {biayaUmumEntries.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center">
          Belum ada biaya kantor tercatat.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[40vh] overflow-y-auto overscroll-contain">
          {[...biayaUmumEntries].reverse().map(e => (
            <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg
              border border-border px-2.5 py-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-navy truncate">{e.keterangan}</p>
                <p className="text-[10px] text-muted-foreground">{e.tanggal} · {e.kategori}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-bold text-rose-600 tabular-nums">
                  {fmt(e.jumlah)}
                </span>
                {bolehUbah && (
                  <button onClick={() => deleteBiayaUmum(e.id)} aria-label="Hapus biaya"
                    className="p-1 text-muted-foreground hover:text-rose-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Aset & alat kerja ───────────────────────────────────────────────────────

function BagianAset({ daftarProyek, pos, dos, bolehUbah, onUbah }: {
  daftarProyek: Array<{ id: string; nama: string }>
  pos: PurchaseOrder[]
  dos: DeliveryOrder[]
  bolehUbah: boolean
  /**
   * WAJIB dipanggil setiap daftar alat berubah.
   *
   * Nilai buku alat ikut ke NERACA, dan neraca dihitung di induk — di sub-tab
   * lain. Tanpa kabar ini, alat yang baru dicatat tersimpan dengan benar,
   * terlihat dengan benar di daftar ini, dan tidak pernah muncul di neraca
   * sampai seluruh halaman dimuat ulang.
   */
  onUbah: () => void
}) {
  const { toast } = useToast()
  const [daftar, setDaftar] = useState<AsetAlat[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [buka, setBuka] = useState(false)
  const [draf, setDraf] = useState<Omit<AsetAlat, 'id'>>({ ...ASET_KOSONG })
  const [simpan, setSimpan] = useState(false)

  async function muat() {
    setMemuat(true)
    try { setDaftar(await asetApi().list()); setGalat('') }
    catch (e) { setGalat(e instanceof Error ? e.message : String(e)) }
    finally { setMemuat(false) }
  }
  useEffect(() => { void muat() }, [])

  const hariIni = useMemo(() => new Date(), [])
  const hidup = daftar.filter(masihDimiliki)
  const perolehan = totalPerolehan(daftar)
  const buku = totalAsetTetap(daftar, hariIni)
  const susut = penyusutanBulanIni(daftar, hariIni)

  /**
   * Barang dari PO alat yang sudah datang tetapi belum ada di daftar aset.
   * Dicocokkan lewat `po_id` — tautan berupa id, bukan kecocokan nama.
   */
  const belumDicatat = useMemo(() => {
    const sudah = new Set(daftar.map(a => String(a.po_id ?? '')).filter(Boolean))
    const poAlat = (pos ?? []).filter(p => jenisPo(p) === 'alat' && !sudah.has(p.id))
    const adaDo = new Set((dos ?? []).map(d => String(d.po_id ?? '')))
    return poAlat.filter(p => adaDo.has(p.id))
  }, [daftar, pos, dos])

  const siap = siapSimpanAset(draf)

  async function simpanAset() {
    if (!siap.boleh || simpan) return
    setSimpan(true)
    try {
      await asetApi().buat(draf)
      toast({ title: 'Alat dicatat sebagai aset' })
      setDraf({ ...ASET_KOSONG })
      setBuka(false)
      await muat()
      onUbah()
    } catch (e) {
      toast({
        title: 'Gagal menyimpan', variant: 'destructive',
        description: e instanceof Error ? e.message : String(e),
      })
    } finally { setSimpan(false) }
  }

  async function ubah(id: string, patch: Partial<AsetAlat>) {
    // `onUbah` juga di sini: melepas alat mengubah nilai aset tetap, dan
    // pemindahan lokasi mengubah apa yang terbaca di laporan.
    try { await asetApi().ubah(id, patch); await muat(); onUbah() }
    catch (e) {
      toast({
        title: 'Gagal memperbarui', variant: 'destructive',
        description: e instanceof Error ? e.message : String(e),
      })
    }
  }

  /** Isi formulir dari PO alat — nama, harga, dan tanggalnya sudah ada di sana. */
  function dariPo(po: PurchaseOrder) {
    const it = (po.items ?? [])[0]
    setDraf({
      ...ASET_KOSONG,
      nama: String(it?.nama ?? '').trim(),
      harga: Number(po.total) || Number(it?.subtotal) || 0,
      tanggal_beli: String(po.tanggal ?? '').slice(0, 10),
      po_id: po.id,
      catatan: `Dari ${po.nomor} · ${po.vendor_nama}`,
    })
    setBuka(true)
  }

  return (
    <div data-panel-aset className="bg-white rounded-3xl border border-border p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Wrench className="w-4 h-4 text-navy shrink-0" />
          <h3 className="font-bold text-navy text-sm truncate">Aset & Alat ({hidup.length})</h3>
        </div>
        <button onClick={() => void muat()} disabled={memuat}
          className="p-1.5 text-muted-foreground hover:text-navy" aria-label="Muat ulang">
          <RefreshCw className={`w-3.5 h-3.5 ${memuat ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Angka label="Perolehan" nilai={perolehan} />
        <Angka label="Nilai buku" nilai={buku} tebal />
        <Angka label="Susut / bln" nilai={susut} merah />
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        <b>Nilai buku</b>-lah yang masuk neraca sebagai aset tetap. Yang membebani laba
        setiap bulan hanya penyusutannya, bukan seluruh harga belinya.
      </p>

      {galat && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200
          rounded-xl p-2.5 break-words">{galat}</p>
      )}

      {/* PO alat yang barangnya sudah datang tapi belum jadi aset */}
      {bolehUbah && belumDicatat.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-2">
          <p className="text-[11px] font-bold text-blue-900">
            {belumDicatat.length} pembelian alat sudah datang tetapi belum jadi aset.
          </p>
          {belumDicatat.map(po => (
            <div key={po.id} className="rounded-lg bg-white border border-blue-200 p-2.5
              flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-navy truncate">{po.nomor}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {po.vendor_nama} · {fmt(po.total)}
                </p>
              </div>
              <Button size="sm" data-catat-dari-po onClick={() => dariPo(po)}
                className="shrink-0 gap-1 text-[11px] font-bold bg-navy hover:bg-navy/90 h-8">
                <Plus className="w-3 h-3" /> Catat
              </Button>
            </div>
          ))}
        </div>
      )}

      {bolehUbah && (buka ? (
        <div className="rounded-xl border-2 border-gold/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-navy">Catat alat</p>
            <button onClick={() => { setBuka(false); setDraf({ ...ASET_KOSONG }) }}
              className="text-muted-foreground hover:text-navy"><X className="w-4 h-4" /></button>
          </div>
          <input data-aset-nama value={draf.nama} placeholder="Nama alat, mis. Genset 5000W"
            onChange={e => setDraf(d => ({ ...d, nama: e.target.value }))}
            className={`${inputCls} font-semibold`} />
          <div className="grid grid-cols-2 gap-2">
            <input value={draf.merek} placeholder="Merek"
              onChange={e => setDraf(d => ({ ...d, merek: e.target.value }))} className={inputCls} />
            <input value={draf.nomor_seri} placeholder="Nomor seri"
              onChange={e => setDraf(d => ({ ...d, nomor_seri: e.target.value }))} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Tanggal beli</span>
              <input type="date" data-aset-tanggal value={draf.tanggal_beli}
                onChange={e => setDraf(d => ({ ...d, tanggal_beli: e.target.value }))}
                className={inputCls} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Harga (Rp)</span>
              <input type="number" min={0} data-aset-harga value={draf.harga || ''}
                onChange={e => setDraf(d => ({ ...d, harga: Number(e.target.value) || 0 }))}
                inputMode="numeric" className={inputCls} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Umur ekonomis</span>
              <select value={draf.umur_bulan} data-aset-umur
                onChange={e => setDraf(d => ({ ...d, umur_bulan: Number(e.target.value) }))}
                className={inputCls}>
                {PILIHAN_UMUR.map(p => (
                  <option key={p.bulan} value={p.bulan}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Nilai residu (Rp)</span>
              <input type="number" min={0} value={draf.nilai_residu || ''}
                onChange={e => setDraf(d => ({ ...d, nilai_residu: Number(e.target.value) || 0 }))}
                placeholder="0" inputMode="numeric" className={inputCls} />
            </label>
          </div>
          {!siap.boleh && <p className="text-[11px] text-amber-800">{siap.alasan}</p>}
          <Button data-simpan-aset onClick={() => void simpanAset()} disabled={!siap.boleh || simpan}
            className="w-full gap-1.5 bg-navy hover:bg-navy/90 font-bold h-10">
            {simpan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Simpan Alat
          </Button>
        </div>
      ) : (
        <button data-buka-aset onClick={() => setBuka(true)}
          className="w-full rounded-xl border-2 border-dashed border-border py-2.5
            text-[11px] font-bold text-navy hover:bg-slate-50">
          + Catat alat kerja
        </button>
      ))}

      {memuat && daftar.length === 0 ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : daftar.length === 0 && !galat ? (
        <p className="text-xs text-muted-foreground py-3 text-center">
          Belum ada alat tercatat. Alat yang dibeli lewat PO Alat Kerja bisa dicatat dari sini.
        </p>
      ) : (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto overscroll-contain pr-0.5">
          {daftar.map(a => (
            <div key={a.id} className={`rounded-xl border p-3 space-y-2 min-w-0 ${
              masihDimiliki(a) ? 'border-border' : 'border-border bg-slate-50 opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-navy break-words">{a.nama}</p>
                  <p className="text-[10px] text-muted-foreground break-words">
                    {[a.merek, a.nomor_seri].filter(Boolean).join(' · ') || 'tanpa merek'}
                    {' · beli '}{a.tanggal_beli}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-navy tabular-nums">
                    {fmt(nilaiBuku(a, hariIni))}
                  </p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    dari {fmt(a.harga)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full
                  ${TONE_KONDISI[a.kondisi]}`}>{LABEL_KONDISI[a.kondisi]}</span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <MapPin className="w-3 h-3" /> {lokasiAlat(a, daftarProyek)}
                </span>
                {masihDimiliki(a) && (
                  <span className="text-[10px] text-muted-foreground">
                    {sisaUmur(a, hariIni) > 0 ? `sisa ${sisaUmur(a, hariIni)} bln` : 'umur habis'}
                  </span>
                )}
              </div>

              {bolehUbah && masihDimiliki(a) && (
                <div className="grid grid-cols-2 gap-2">
                  <select value={a.lokasi_project_id ?? ''} aria-label={`Lokasi ${a.nama}`}
                    onChange={e => void ubah(a.id, {
                      lokasi_project_id: e.target.value || null,
                      lokasi_nama: daftarProyek.find(p => p.id === e.target.value)?.nama ?? '',
                    })}
                    className="h-8 rounded-lg border border-border px-2 text-[11px] font-semibold text-navy">
                    <option value="">🏠 Gudang</option>
                    {daftarProyek.map(p => (
                      <option key={p.id} value={p.id}>🏗️ {p.nama}</option>
                    ))}
                  </select>
                  <select value={a.kondisi} aria-label={`Kondisi ${a.nama}`}
                    onChange={e => void ubah(a.id, { kondisi: e.target.value as KondisiAlat })}
                    className="h-8 rounded-lg border border-border px-2 text-[11px] font-semibold text-navy">
                    {(Object.keys(LABEL_KONDISI) as KondisiAlat[]).map(k => (
                      <option key={k} value={k}>{LABEL_KONDISI[k]}</option>
                    ))}
                  </select>
                </div>
              )}

              {bolehUbah && masihDimiliki(a) && (
                <button data-lepas-aset
                  onClick={() => void ubah(a.id, { dilepas_at: new Date().toISOString() })}
                  className="text-[10px] font-bold text-muted-foreground underline">
                  Tandai sudah dilepas / dijual
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Satu kartu angka ringkasan.
 *
 * Ketiganya seukuran, dan semuanya `text-[11px]`. Sempat yang tengah dibuat
 * `text-sm` supaya menonjol — akibatnya "Rp 54.000.000" patah menjadi TIGA
 * baris di ponsel, dan kartu yang paling penting justru yang paling sulit
 * dibaca. Yang menonjolkannya sekarang tebalnya huruf, bukan ukurannya.
 */
function Angka({ label, nilai, tebal, merah }: {
  label: string; nilai: number; tebal?: boolean; merah?: boolean
}) {
  return (
    <div className="rounded-xl bg-slate-50 border border-border p-2 min-w-0">
      <p className="text-[10px] text-muted-foreground truncate">{label}</p>
      <p className={`text-[11px] leading-tight tabular-nums break-words
        ${tebal ? 'font-black' : 'font-bold'} ${merah ? 'text-rose-600' : 'text-navy'}`}>
        {fmt(nilai)}
      </p>
    </div>
  )
}
