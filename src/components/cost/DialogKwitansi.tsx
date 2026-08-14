import { useEffect, useMemo, useState } from 'react'
import { X, Save, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SignaturePad from '@/components/cost/SignaturePad'
import { useToast } from '@/hooks/use-toast'
import { kwitansiApi, type BarisKwitansi } from '@/lib/kwitansiApi'
import {
  KWITANSI_KOSONG, nomorKwitansi, terbilang, perluMaterai, statusMaterajAwal,
  siapSimpanKwitansi, AMBANG_MATERAI, LABEL_METODE_TERIMA,
  type Kwitansi, type MetodeTerima,
} from '@/lib/kwitansi'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`
const inputCls = 'w-full rounded-xl border border-border bg-white px-3 py-2 text-sm '
  + 'focus:outline-none focus:ring-2 focus:ring-gold/40'

/**
 * Formulir kwitansi — mengisi dan MENYIMPAN, tidak lebih.
 *
 * Nominal dan uraiannya diambil dari entri pemasukannya, tidak diketik ulang.
 * Mengetik ulang adalah tempat lahirnya kwitansi yang angkanya berbeda dari
 * pembukuan — dan yang ketahuan belakangan hanya kalau ada yang membandingkan.
 *
 * Unduh PDF, kirim ke konsumen, dan pembubuhan meterai TIDAK ada di sini.
 * Ketiganya dikerjakan dari daftar kwitansi terbit, sesudah kwitansinya
 * tersimpan — sama seperti SPK. Alasannya bukan kerapian: ketiga tindakan itu
 * masuk akal berkali-kali dan pada waktu yang berbeda-beda (meterai dibubuhkan
 * di situs lain, konsumen dikirimi ulang minggu depan), sedangkan formulir ini
 * hanya masuk akal sekali. Menggabungkannya memaksa formulir tetap terbuka
 * untuk pekerjaan yang bukan miliknya.
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
  const [proses, setProses] = useState(false)
  const [pesanSimpan, setPesanSimpan] = useState('')
  const [rinciSimpan, setRinciSimpan] = useState(false)
  const [tandaTangan, setTandaTangan] = useState(false)

  useEffect(() => {
    void (async () => {
      // Nomor urut diambil dari jumlah kwitansi bulan ini yang sudah ada.
      const semua = await kwitansiApi().list().catch(() => [] as BarisKwitansi[])
      const bl = awal.tanggal.slice(0, 7)
      const urut = semua.filter(x => (x.tanggal ?? '').startsWith(bl)).length + 1
      setK(s => (s.nomor ? s : { ...s, nomor: nomorKwitansi(urut, new Date(awal.tanggal)) }))
    })()
  }, [awal.tanggal])

  const wajib = perluMaterai(k.jumlah)
  const siap = useMemo(() => siapSimpanKwitansi(k), [k])

  const ubah = <K extends keyof Kwitansi>(key: K, v: Kwitansi[K]) =>
    setK(s => ({ ...s, [key]: v, ...(key === 'jumlah' ? { materai_status: statusMaterajAwal(v) } : {}) }))

  async function simpan() {
    if (!siap.boleh || proses) return
    setProses(true)
    setPesanSimpan('')
    try {
      await kwitansiApi().buat({ ...k, pemasukan_id: awal.pemasukanId, perlu_materai: wajib })
      toast({
        title: 'Kwitansi tersimpan',
        description: 'Unduh PDF, bubuhkan meterai, dan kirim ke konsumen dari daftar di bawah.',
      })
      onTutup()
    } catch (e) {
      setPesanSimpan(e instanceof Error ? e.message : String(e))
    } finally { setProses(false) }
  }

  return (
    // z-[60], di ATAS navigasi bawah yang ber-z-50. Dengan z-50 keduanya seri,
    // dan urutan DOM memenangkan navigasi — bilah tombol dialog ini tertutup
    // olehnya di ponsel, sehingga terbaca sebagai "tidak bisa digulung".
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center
      p-0 sm:p-4" onClick={onTutup}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh]
          flex flex-col overflow-hidden">
        {/* Tiga baris: kepala tetap, isi yang menggulung, kaki tetap. Dulu
            seluruh dialog yang menggulung sementara kaki dan kepalanya
            `sticky` — dan `sticky` di dalam kotak yang juga menggulung sendiri
            adalah tempat lahirnya bilah yang menutupi isinya. */}
        <div className="border-b border-border px-5 py-3 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <p className="font-bold text-navy">Kwitansi Digital</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {k.nomor || 'menyiapkan nomor…'}
            </p>
          </div>
          <button onClick={onTutup} className="p-1.5 hover:bg-slate-100 rounded-lg shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4">
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

          {/* Kewajiban meterai DIKATAKAN di sini, tetapi tidak dikerjakan di
              sini: pembubuhannya menyeberang ke situs lain, jadi ia menunggu
              sampai kwitansinya tersimpan dan punya baris sendiri. */}
          {wajib && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50
              p-3 text-[11px] leading-relaxed text-amber-900">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="flex-1 min-w-0">
                Nominal di atas Rp {AMBANG_MATERAI.toLocaleString('id-ID')}{' '}
                <b>wajib bermeterai</b> menurut UU No. 10/2020. Simpan dulu kwitansinya —
                pembubuhan meterainya dikerjakan dari daftar kwitansi terbit.
              </span>
            </p>
          )}

          {/* Tanda tangan digital, sama seperti SPK. Kwitansi tanpa tanda
              tangan hanyalah selembar angka; yang membuatnya berlaku sebagai
              tanda terima adalah tanda tangan penerimanya. */}
          <div className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-navy">Tanda tangan penerima</p>
              {k.penanda_signature ? (
                <button onClick={() => { ubah('penanda_signature', null); setTandaTangan(true) }}
                  className="text-[11px] font-bold text-muted-foreground underline">Ulangi</button>
              ) : tandaTangan ? (
                <button onClick={() => setTandaTangan(false)}
                  className="text-[11px] font-bold text-muted-foreground underline">Batal</button>
              ) : null}
            </div>
            {k.penanda_signature ? (
              <img data-ttd-tersimpan src={k.penanda_signature} alt="Tanda tangan"
                className="h-20 object-contain bg-white rounded-lg border border-border" />
            ) : tandaTangan ? (
              // `onSimpan`, BUKAN `onChange`. Dengan `onChange`, goresan pertama
              // langsung tersimpan sebagai `penanda_signature`, cabang di atas
              // ini menang pada render berikutnya, dan kanvasnya lenyap di
              // tengah orang menandatangani — satu garis lalu selesai.
              <SignaturePad height={150}
                onSimpan={d => { ubah('penanda_signature', d); setTandaTangan(false) }} />
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

        <div className="border-t border-border p-4 space-y-2 shrink-0">
          {pesanSimpan && (
            <div data-pesan-simpan className="rounded-lg bg-rose-50 border border-rose-200 p-2">
              <div className="flex items-start gap-1.5">
                <p className="flex-1 min-w-0 text-[11px] text-rose-900 break-words">
                  Kwitansinya belum tersimpan.{' '}
                  <button onClick={() => setRinciSimpan(v => !v)} className="font-bold underline">
                    {rinciSimpan ? 'Tutup' : 'Kenapa?'}
                  </button>
                </p>
                <button onClick={() => setPesanSimpan('')}
                  className="p-0.5 text-rose-900/60 hover:text-rose-900 shrink-0"
                  aria-label="Tutup pesan">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {rinciSimpan && (
                <p className="mt-1.5 text-[11px] text-rose-900 break-words">{pesanSimpan}</p>
              )}
            </div>
          )}
          {!siap.boleh && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-900">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {siap.alasan}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onTutup} className="font-bold">Batal</Button>
            <Button data-simpan-kwitansi onClick={() => void simpan()}
              disabled={!siap.boleh || proses}
              variant="gold" className="flex-1 gap-1.5 font-bold">
              {proses ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Simpan Kwitansi
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
