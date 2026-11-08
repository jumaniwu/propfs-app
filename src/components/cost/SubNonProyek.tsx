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
  Wrench, Building2, Plus, Trash2, Loader2, RefreshCw, Download, X, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useAkuntanStore } from '@/store/akuntanStore'
import { asetApi } from '@/lib/asetApi'
import {
  masihDimiliki, totalAsetTetap, totalPerolehan, penyusutanBulanIni, singkatanDariNama, cocokCari,
  ASET_KOSONG,
  type AsetAlat,
} from '@/lib/asetAlat'
import { asetPinjamApi } from '@/lib/asetPinjamApi'
import {
  ringkasLacak, kalimatLacak, saringanAlat, LABEL_SARINGAN,
  type Peminjaman, type Saringan,
} from '@/lib/lacakAlat'
import { useAuthStore } from '@/store/authStore'
import SerahAlat from './SerahAlat'
import FormAset, { type DrafAset } from './FormAset'
import KartuAset from './KartuAset'
import { poKantorBelumTercatat, type UsulDariPo } from '@/lib/sinkronRealisasi'
import DaftarBulanan from './DaftarBulanan'
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
        <DaftarBulanan
          baris={[...biayaUmumEntries].reverse()}
          tanggalDari={e => e.tanggal}
          nilaiDari={e => e.jumlah}
          kunci={e => e.id}
          satuan="biaya"
          className="max-h-[40vh] overflow-y-auto overscroll-contain"
          render={e => (
            <div className="flex items-center justify-between gap-2 rounded-lg
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
          )}
        />
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
  const perusahaan = useAuthStore(s => s.profile?.company)
  const [daftar, setDaftar] = useState<AsetAlat[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [form, setForm] = useState<{ mode: 'baru' | 'ubah'; awal: DrafAset } | null>(null)
  const [pinjaman, setPinjaman] = useState<Peminjaman[]>([])
  const [serah, setSerah] = useState<AsetAlat | null>(null)
  const [cari, setCari] = useState('')
  const [saring, setSaring] = useState<Saringan>('semua')

  async function muat() {
    setMemuat(true)
    try { setDaftar(await asetApi().list()); setGalat('') }
    catch (e) { setGalat(e instanceof Error ? e.message : String(e)) }
    finally { setMemuat(false) }
  }

  /**
   * Catatan serah-terima dimuat TERPISAH, dan kegagalannya tidak dijadikan
   * `galat`.
   *
   * Tabelnya baru; sebagian pemakai belum menjalankan migrasinya. Kalau
   * kegagalan memuatnya ikut memerahkan panel ini, seluruh daftar aset —
   * yang sama sekali tidak bermasalah — akan tampak rusak karena satu tabel
   * tambahan yang belum ada.
   */
  async function muatPinjaman() {
    try { setPinjaman(await asetPinjamApi().list()) }
    catch { setPinjaman([]) }
  }
  useEffect(() => { void muat(); void muatPinjaman() }, [])

  const hariIni = useMemo(() => new Date(), [])
  const hidup = daftar.filter(masihDimiliki)
  const perolehan = totalPerolehan(daftar)
  const buku = totalAsetTetap(daftar, hariIni)
  const susut = penyusutanBulanIni(daftar, hariIni)
  const singkatan = singkatanDariNama(perusahaan)

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

  const hitung = useMemo(() => {
    const h: Record<Saringan, number> = { semua: 0, dipinjam: 0, gudang: 0, cek: 0 }
    for (const a of daftar) for (const k of saringanAlat(a, pinjaman)) h[k]++
    return h
  }, [daftar, pinjaman])
  const tampil = daftar.filter(a => cocokCari(a, cari) && saringanAlat(a, pinjaman).includes(saring))

  async function simpanForm(d: DrafAset) {
    if (!form) return
    try {
      if (form.mode === 'baru') {
        const { id: _abaikan, ...isi } = d
        await asetApi().buat(isi)
        toast({ title: 'Alat dicatat sebagai aset', description: d.kode })
      } else if (d.id) {
        // Hanya identitas alat. Harga, tanggal beli, dan umur ekonomis tidak
        // ikut: ketiganya menentukan penyusutan yang sudah masuk laporan.
        await asetApi().ubah(d.id, {
          nama: d.nama, kode: d.kode, merek: d.merek, nomor_seri: d.nomor_seri,
          foto: d.foto ?? '', kelengkapan: d.kelengkapan ?? [],
        })
        toast({ title: 'Data alat diperbarui', description: d.kode })
      }
      setForm(null)
      await muat()
      onUbah()
    } catch (e) {
      toast({
        title: 'Gagal menyimpan', variant: 'destructive',
        description: e instanceof Error ? e.message : String(e),
      })
    }
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
    setForm({
      mode: 'baru',
      awal: {
        ...ASET_KOSONG,
        nama: String(it?.nama ?? '').trim(),
        harga: Number(po.total) || Number(it?.subtotal) || 0,
        tanggal_beli: String(po.tanggal ?? '').slice(0, 10),
        po_id: po.id,
        catatan: `Dari ${po.nomor} · ${po.vendor_nama}`,
      },
    })
  }

  return (
    <div data-panel-aset className="bg-white rounded-3xl border border-border p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Wrench className="w-4 h-4 text-navy shrink-0" />
          <h3 className="font-bold text-navy text-sm truncate">Aset & Alat ({hidup.length})</h3>
        </div>
        <button onClick={() => { void muat(); void muatPinjaman() }} disabled={memuat}
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

      {/* Ringkasan keberadaan alat, di atas daftarnya. Yang perlu diketahui
          sebelum menggulir adalah berapa alat yang sedang tidak ada di gudang —
          bukan setelah menemukannya satu per satu. */}
      {daftar.length > 0 && (
        <p data-ringkas-lacak className={`text-[11px] font-semibold rounded-xl px-2.5 py-2 ${
          ringkasLacak(pinjaman).terlambat > 0
            ? 'text-rose-800 bg-rose-50 border border-rose-200'
            : 'text-navy bg-slate-50 border border-border'}`}>
          {kalimatLacak(ringkasLacak(pinjaman))}
        </p>
      )}

      {galat && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200
          rounded-xl p-2.5 break-words">{galat}</p>
      )}

      {/* PO alat yang barangnya sudah datang tapi belum jadi aset */}
      {bolehUbah && belumDicatat.length > 0 && !form && (
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

      {bolehUbah && (form ? (
        <FormAset key={`${form.mode}-${form.awal.id ?? 'baru'}`} mode={form.mode} awal={form.awal}
          daftar={daftar} singkatan={singkatan}
          onBatal={() => setForm(null)} onSimpan={simpanForm} />
      ) : (
        <button data-buka-aset onClick={() => setForm({ mode: 'baru', awal: { ...ASET_KOSONG } })}
          className="w-full rounded-xl border-2 border-dashed border-border py-2.5
            text-[11px] font-bold text-navy hover:bg-slate-50">
          + Catat alat kerja
        </button>
      ))}

      {/* Cari & saring. Dengan puluhan gerinda bermerek sama, satu-satunya
          cara menemukan "yang dibawa Budi" adalah nomor asetnya atau
          saringan "Dipinjam". */}
      {daftar.length > 0 && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input data-cari-aset value={cari} onChange={e => setCari(e.target.value)}
              placeholder="Cari nomor aset, nama, merek…"
              className={`${inputCls} pl-8`} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(LABEL_SARINGAN) as Saringan[]).map(k => (
              <button key={k} type="button" data-saring={k} onClick={() => setSaring(k)}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                  saring === k
                    ? (k === 'cek' ? 'bg-rose-600 border-rose-600 text-white' : 'bg-navy border-navy text-white')
                    : (k === 'cek' && hitung.cek > 0 ? 'border-rose-300 text-rose-700' : 'border-border text-navy')}`}>
                {LABEL_SARINGAN[k]} ({hitung[k]})
              </button>
            ))}
          </div>
        </div>
      )}

      {memuat && daftar.length === 0 ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : daftar.length === 0 && !galat ? (
        <p className="text-xs text-muted-foreground py-3 text-center">
          Belum ada alat tercatat. Alat yang dibeli lewat PO Alat Kerja bisa dicatat dari sini.
        </p>
      ) : tampil.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center">Tidak ada alat yang cocok.</p>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto overscroll-contain pr-0.5">
          {tampil.map(a => (
            <KartuAset key={a.id} alat={a} pinjaman={pinjaman} daftarProyek={daftarProyek}
              bolehUbah={bolehUbah} hariIni={hariIni}
              onSerah={() => setSerah(a)}
              onUbahKondisi={k => void ubah(a.id, { kondisi: k })}
              onLengkapi={() => setForm({ mode: 'ubah', awal: { ...a } })}
              onLepas={() => {
                if (window.confirm(`Tandai ${a.kode || a.nama} sudah dilepas / dijual? Penyusutannya berhenti.`)) {
                  void ubah(a.id, { dilepas_at: new Date().toISOString() })
                }
              }} />
          ))}
        </div>
      )}

      {serah && (
        <SerahAlat alat={serah} daftar={pinjaman} daftarProyek={daftarProyek}
          bolehUbah={bolehUbah} onTutup={() => setSerah(null)}
          onBerubah={async () => {
            // Keduanya dimuat ulang: pemicu di database ikut memperbarui lokasi
            // dan kondisi di `aset_alat`, jadi memuat catatan peminjaman saja
            // akan menyisakan baris alat yang masih menyebut tempat lamanya.
            await muatPinjaman(); await muat(); onUbah()
          }} />
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
