import { useEffect, useMemo, useState } from 'react'
import {
  X, Download, Send, Loader2, ShieldCheck, AlertTriangle, Copy, Upload, FileCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import SignaturePad from '@/components/cost/SignaturePad'
import { useToast } from '@/hooks/use-toast'
import { kopSaya } from '@/lib/identitasSaya'
import { waKe } from '@/lib/waLink'
import {
  kwitansiApi, kwitansiLink, bubuhkanMaterai,
  type BarisKwitansi,
} from '@/lib/kwitansiApi'
import { unduhKwitansiPdf, kwitansiPdfBase64 } from '@/lib/kwitansiPdf'
import {
  KWITANSI_KOSONG, nomorKwitansi, terbilang, perluMaterai, statusMaterajAwal,
  siapKirimKwitansi, bolehBubuhMaterai, sisaKuota, pesanWaKwitansi,
  peringatanMaterai, TAUTAN_EMETERAI,
  AMBANG_MATERAI, LABEL_METODE_TERIMA, LABEL_STATUS_MATERAI, TONE_STATUS_MATERAI,
  type Kwitansi, type MetodeTerima, type KuotaMaterai,
} from '@/lib/kwitansi'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`
const inputCls = 'w-full rounded-xl border border-border bg-white px-3 py-2 text-sm '
  + 'focus:outline-none focus:ring-2 focus:ring-gold/40'

/**
 * Membuat kwitansi dari satu penerimaan yang sudah tercatat.
 *
 * Nominal dan uraiannya diambil dari entri pemasukannya, tidak diketik ulang.
 * Mengetik ulang adalah tempat lahirnya kwitansi yang angkanya berbeda dari
 * pembukuan — dan yang ketahuan belakangan hanya kalau ada yang membandingkan.
 */
export default function DialogKwitansi({ awal, projectName, namaSaya, onTutup }: {
  awal: { pemasukanId: string; tanggal: string; sumber: string; jumlah: number }
  projectName: string
  namaSaya: string
  onTutup: () => void
}) {
  const { toast } = useToast()
  const [k, setK] = useState<Kwitansi>(() => ({
    ...KWITANSI_KOSONG,
    nomor: '',
    tanggal: awal.tanggal,
    untuk_pembayaran: awal.sumber,
    jumlah: awal.jumlah,
    project_name: projectName,
    penanda_nama: namaSaya,
    materai_status: statusMaterajAwal(awal.jumlah),
  }))
  const [baris, setBaris] = useState<BarisKwitansi | null>(null)
  const [kuota, setKuota] = useState<KuotaMaterai>({ dibeli: 0, terpakai: 0 })
  const [proses, setProses] = useState('')
  const [pesanMaterai, setPesanMaterai] = useState('')
  const [distributor, setDistributor] = useState<string[]>([])
  const [pesanSimpan, setPesanSimpan] = useState('')
  const [materaiPdf, setMateraiPdf] = useState<{ nama: string; data: string } | null>(null)
  const [tandaTangan, setTandaTangan] = useState(false)
  const [beli, setBeli] = useState(0)

  useEffect(() => {
    void (async () => {
      const api = kwitansiApi()
      setKuota(await api.kuota().catch(() => ({ dibeli: 0, terpakai: 0 })))
      // Nomor urut diambil dari jumlah kwitansi bulan ini yang sudah ada.
      const semua = await api.list().catch(() => [] as BarisKwitansi[])
      const bl = awal.tanggal.slice(0, 7)
      const urut = semua.filter(x => (x.tanggal ?? '').startsWith(bl)).length + 1
      setK(s => (s.nomor ? s : { ...s, nomor: nomorKwitansi(urut, new Date(awal.tanggal)) }))
    })()
  }, [awal.tanggal])

  const wajib = perluMaterai(k.jumlah)
  const merek = useMemo(() => kopSaya(), [])
  const siap = siapKirimKwitansi(k)
  // Penyedia dianggap belum siap sampai perantara mengatakan sebaliknya.
  // Menganggapnya siap lalu gagal berarti kuota terpotong untuk apa-apa.
  const [penyediaSiap, setPenyediaSiap] = useState(true)
  const bolehBubuh = bolehBubuhMaterai(k, kuota, penyediaSiap)

  const ubah = <K extends keyof Kwitansi>(key: K, v: Kwitansi[K]) =>
    setK(s => ({ ...s, [key]: v, ...(key === 'jumlah' ? { materai_status: statusMaterajAwal(v) } : {}) }))

  /** Simpan sekali; sesudahnya kembalikan baris yang sama. */
  async function pastikanTersimpan(): Promise<BarisKwitansi> {
    if (baris) return baris
    const b = await kwitansiApi().buat({
      ...k,
      pemasukan_id: awal.pemasukanId,
      perlu_materai: wajib,
    })
    setBaris(b)
    return b
  }

  /**
   * Unduh PDF — TIDAK menunggu penyimpanan.
   *
   * Sebelumnya ia memanggil `pastikanTersimpan()` lebih dulu, sehingga satu
   * galat server (403 karena migrasinya belum dijalankan) MEMBATALKAN unduhan
   * yang sebenarnya seluruhnya dikerjakan di dalam peramban. Pekerjaan lokal
   * tidak boleh digantungkan pada jaringan.
   *
   * Penyimpanannya tetap dijalankan, di belakang, dan kegagalannya dilaporkan
   * sebagai catatan — bukan sebagai kegagalan mengunduh.
   */
  function unduh() {
    unduhKwitansiPdf(k, merek)
    void pastikanTersimpan().catch(e => {
      setPesanSimpan(`PDF sudah terunduh, tetapi kwitansinya belum tersimpan di server: ${pesan(e)}`)
    })
  }

  async function bubuh() {
    setProses('materai')
    setPesanMaterai('')
    let b: BarisKwitansi | null = null
    let terpotong = false
    try {
      b = await pastikanTersimpan()

      // Kuota dipotong LEBIH DULU, lalu dikembalikan bila gagal. Urutan
      // sebaliknya membuka celah: dua pembubuhan bersamaan sama-sama lolos
      // pemeriksaan sisa, lalu salah satunya ditolak Peruri setelah
      // dokumennya terlanjur ditandai bermeterai.
      terpotong = await kwitansiApi().pakaiKuota(b.id)
      if (!terpotong) {
        setPesanMaterai('Kuota e-Meterai sudah habis. Beli dulu kuotanya di distributor resmi.')
        return
      }

      const hasil = await bubuhkanMaterai({
        pdfBase64: kwitansiPdfBase64(k, merek),
        nomor: k.nomor,
        tanggal: k.tanggal,
      })

      if (!hasil.ok) {
        await kwitansiApi().kembalikanKuota(b.id, hasil.pesan ?? 'gagal').catch(() => {})
        terpotong = false
        setPenyediaSiap(!hasil.belumDipasang)
        setDistributor(hasil.distributor ?? [])
        setPesanMaterai(hasil.pesan ?? 'Pembubuhan gagal.')
        await kwitansiApi().ubah(b.id, {
          materai_status: 'gagal', materai_galat: (hasil.pesan ?? '').slice(0, 300),
        } as Partial<BarisKwitansi>).catch(() => {})
        return
      }

      await kwitansiApi().ubah(b.id, {
        materai_status: 'terbubuh', materai_sn: hasil.sn ?? '',
        materai_at: new Date().toISOString(),
      } as Partial<BarisKwitansi>)
      setK(s => ({ ...s, materai_status: 'terbubuh', materai_sn: hasil.sn ?? '' }))
      setKuota(q => ({ ...q, terpakai: q.terpakai + 1 }))
      toast({ title: '✅ e-Meterai terbubuh' })
    } catch (e) {
      if (b && terpotong) await kwitansiApi().kembalikanKuota(b.id, pesan(e)).catch(() => {})
      setPesanMaterai(pesan(e))
    } finally { setProses('') }
  }

  /**
   * Terima PDF yang sudah dibubuhi meterai.
   *
   * Yang diunggah menggantikan berkas yang dikirim ke konsumen. Ukurannya
   * dibatasi karena ia disimpan bersama barisnya; PDF satu halaman bermeterai
   * jauh di bawah batas ini, dan yang jauh di atasnya bukan kwitansi.
   */
  async function pilihMateraiPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setPesanMaterai('')
    if (f.size > 3 * 1024 * 1024) {
      setPesanMaterai('Berkasnya lebih dari 3 MB. Kwitansi satu halaman semestinya jauh di bawah itu.')
      return
    }
    const data = await new Promise<string>((selesai, gagal) => {
      const r = new FileReader()
      r.onload = () => selesai(String(r.result ?? ''))
      r.onerror = () => gagal(r.error)
      r.readAsDataURL(f)
    })
    setMateraiPdf({ nama: f.name, data })
    setK(s => ({ ...s, materai_status: 'terbubuh', materai_pdf: data }))
    void simpanMaterai(data)
  }

  /** Simpan versi bermeterai; kegagalannya tidak menghapus yang sudah diunggah. */
  async function simpanMaterai(data: string) {
    setProses('manual')
    try {
      const b = await pastikanTersimpan()
      await kwitansiApi().ubah(b.id, {
        materai_status: 'terbubuh', materai_pdf: data,
        materai_at: new Date().toISOString(),
      } as Partial<BarisKwitansi>)
      toast({ title: 'PDF bermeterai tersimpan' })
    } catch (e) {
      setPesanSimpan(`PDF bermeterai belum tersimpan di server: ${pesan(e)}`)
    } finally { setProses('') }
  }

  async function kirim() {
    if (!siap.boleh) return
    setProses('kirim')
    try {
      const b = await pastikanTersimpan()
      await kwitansiApi().tandaiTerkirim(b.id)
      const tautan = kwitansiLink(b.view_token)
      window.open(waKe(k.penerima_wa, pesanWaKwitansi(k, tautan)), '_blank')
      toast({ title: 'Kwitansi dikirim', description: 'Tautannya sudah bisa dibuka konsumen.' })
      onTutup()
    } catch (e) {
      toast({ title: 'Gagal mengirim', description: pesan(e), variant: 'destructive' })
    } finally { setProses('') }
  }

  async function tambahKuota() {
    if (beli <= 0) return
    setProses('kuota')
    try {
      await kwitansiApi().tambahKuota(beli, 'dicatat manual setelah pembelian di distributor')
      setKuota(q => ({ ...q, dibeli: q.dibeli + beli }))
      setBeli(0)
      toast({ title: `${beli} e-Meterai ditambahkan ke kuota` })
    } catch (e) {
      toast({ title: 'Gagal', description: pesan(e), variant: 'destructive' })
    } finally { setProses('') }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onTutup}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh]
          overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-border px-5 py-3 flex items-center
          justify-between">
          <div>
            <p className="font-bold text-navy">Kwitansi Digital</p>
            <p className="text-[11px] text-muted-foreground">{k.nomor || 'menyiapkan nomor…'}</p>
          </div>
          <button onClick={onTutup} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">Telah terima dari</span>
              <input data-kw-dari className={inputCls} value={k.penerima_dari}
                onChange={e => ubah('penerima_dari', e.target.value)} placeholder="Nama konsumen" />
            </label>
            <label className="col-span-2 space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">Untuk pembayaran</span>
              <input className={inputCls} value={k.untuk_pembayaran}
                onChange={e => ubah('untuk_pembayaran', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">Tanggal</span>
              <input type="date" className={inputCls} value={k.tanggal}
                onChange={e => ubah('tanggal', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">Cara pembayaran</span>
              <select className={inputCls} value={k.metode}
                onChange={e => ubah('metode', e.target.value as MetodeTerima)}>
                {Object.entries(LABEL_METODE_TERIMA).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">WhatsApp konsumen</span>
              <input className={inputCls} value={k.penerima_wa} inputMode="tel"
                onChange={e => ubah('penerima_wa', e.target.value)} placeholder="08…" />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">Jabatan penanda tangan</span>
              <input className={inputCls} value={k.penanda_jabatan}
                onChange={e => ubah('penanda_jabatan', e.target.value)} placeholder="Direktur" />
            </label>
          </div>

          {/* Terbilang diperlihatkan saat mengisi, bukan hanya tercetak di PDF.
              Di sinilah salah ketik nominal paling mudah tertangkap: angkanya
              sendiri terlihat wajar, katanya tidak. */}
          <div className="rounded-xl border border-border bg-slate-50 p-3">
            <p className="text-2xl font-bold text-navy">{fmt(k.jumlah)}</p>
            <p className="text-xs italic text-muted-foreground mt-0.5">{terbilang(k.jumlah)}</p>
          </div>

          {/* ── e-Meterai: unduh → bubuhkan sendiri → unggah kembali ──── */}
          {wajib && (
            <div className={`rounded-xl border p-3 space-y-2 ${
              k.materai_status === 'terbubuh'
                ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-bold text-navy">
                  <ShieldCheck className="w-4 h-4" /> e-Meterai
                </p>
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full
                  ${TONE_STATUS_MATERAI[k.materai_status]}`}>
                  {LABEL_STATUS_MATERAI[k.materai_status]}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Nominal di atas Rp {AMBANG_MATERAI.toLocaleString('id-ID')}{' '}
                <b>wajib bermeterai</b> menurut UU No. 10/2020. Unduh PDF-nya, bubuhkan
                e-Meterai sendiri, lalu unggah kembali di sini — yang dikirim ke konsumen
                adalah versi yang bermeterai.
              </p>

              {k.materai_status === 'terbubuh' && materaiPdf ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200
                  bg-white p-2">
                  <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs truncate flex-1">{materaiPdf.nama}</span>
                  <button onClick={() => { setMateraiPdf(null); ubah('materai_status', 'menunggu') }}
                    className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <label data-unggah-materai className="flex items-center justify-center gap-2
                  rounded-lg border-2 border-dashed border-amber-300 bg-white py-3 cursor-pointer
                  text-xs font-bold text-navy">
                  <Upload className="w-4 h-4" /> Unggah PDF yang sudah bermeterai
                  <input type="file" accept="application/pdf" className="hidden"
                    onChange={e => void pilihMateraiPdf(e)} />
                </label>
              )}
              {pesanMaterai && (
                <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200
                  rounded-lg p-2">{pesanMaterai}</p>
              )}
            </div>
          )}

          {/* Tanda tangan digital, sama seperti SPK. Kwitansi tanpa tanda
              tangan hanyalah selembar angka; yang membuatnya berlaku sebagai
              tanda terima adalah tanda tangan penerimanya. */}
          <div className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-navy">Tanda tangan penerima</p>
              {k.penanda_signature && (
                <button onClick={() => { ubah('penanda_signature', null); setTandaTangan(false) }}
                  className="text-[11px] font-bold text-muted-foreground underline">Ulangi</button>
              )}
            </div>
            {k.penanda_signature ? (
              <img data-ttd-tersimpan src={k.penanda_signature} alt="Tanda tangan"
                className="h-20 object-contain bg-white rounded-lg border border-border" />
            ) : tandaTangan ? (
              <SignaturePad height={150} onChange={d => ubah('penanda_signature', d)} />
            ) : (
              <button data-buka-ttd onClick={() => setTandaTangan(true)}
                className="w-full rounded-xl border-2 border-dashed border-border py-4
                  text-xs font-bold text-navy hover:bg-slate-50">
                Tanda tangani sekarang
              </button>
            )}
            <p className="text-[11px] text-muted-foreground">
              Ditandatangani <b className="text-navy">{k.penanda_nama || '—'}</b>
              {k.penanda_jabatan ? `, ${k.penanda_jabatan}` : ''}.
            </p>
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-muted-foreground">Catatan (opsional)</span>
            <input className={inputCls} value={k.catatan}
              onChange={e => ubah('catatan', e.target.value)} />
          </label>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-border p-4 space-y-2">
          <div className="flex gap-2">
            <Button onClick={unduh}
              variant="outline" className="flex-1 gap-1.5 font-bold">
              <Download className="w-4 h-4" /> Unduh PDF
            </Button>
            <Button data-kirim-kwitansi onClick={() => void kirim()}
              disabled={!siap.boleh || proses !== ''}
              variant="gold" className="flex-1 gap-1.5 font-bold">
              {proses === 'kirim' ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
              Kirim ke Konsumen
            </Button>
          </div>
          {!siap.boleh && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-900">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {siap.alasan}
            </p>
          )}
          {/* Kewajiban meterai DIKATAKAN, tetapi tidak lagi menahan. Yang
              memutuskan kapan mengirim adalah orang yang mengerjakannya. */}
          {siap.boleh && peringatanMaterai(k) && (
            <p data-peringatan-materai className="flex items-start gap-1.5 text-[11px] text-amber-900">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {peringatanMaterai(k)}
            </p>
          )}
          {/* Kegagalan menyimpan dilaporkan sebagai CATATAN, bukan sebagai
              kegagalan mengunduh: PDF-nya sudah ada di tangan pemakainya. */}
          {pesanSimpan && (
            <p data-pesan-simpan className="text-[11px] text-amber-900 bg-amber-50
              border border-amber-200 rounded-lg p-2">{pesanSimpan}</p>
          )}
          {baris && (
            <button
              onClick={() => {
                navigator.clipboard?.writeText(kwitansiLink(baris.view_token))
                toast({ title: 'Tautan kwitansi disalin' })
              }}
              className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
              <Copy className="w-3 h-3" /> Salin tautan kwitansi
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const pesan = (e: unknown) => (e instanceof Error ? e.message : String(e))
