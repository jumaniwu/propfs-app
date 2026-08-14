// ============================================================
// KWITANSI — TAMPILAN UNTUK KONSUMEN (publik, tanpa login)
//
// Tujuan tautan WhatsApp yang dikirim setelah pembayaran termin diterima.
// WhatsApp klik-untuk-chat tidak bisa melampirkan berkas, jadi konsumen
// diarahkan ke sini untuk melihat dan mengunduh kwitansinya.
//
// RPC kwitansi_by_token hanya membuka kwitansi yang SUDAH DIKIRIM, jadi yang
// masih disiapkan tidak bocor walau tautannya tersebar — draft yang terbaca
// lebih buruk daripada tautan yang belum berlaku, sebab isinya masih berubah.
// ============================================================
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react'
import { kwitansiApi, type KwitansiPublik } from '@/lib/kwitansiApi'
import { unduhKwitansiPdf } from '@/lib/kwitansiPdf'
import { terbilang, perluMaterai, LABEL_METODE_TERIMA, KWITANSI_KOSONG } from '@/lib/kwitansi'
import { TANPA_WATERMARK, type IdentitasLaporan } from '@/lib/branding'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`
const tglPanjang = (s?: string | null) => {
  if (!s) return '-'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? String(s)
    : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

function kop(k: KwitansiPublik): IdentitasLaporan {
  const nama = (k.kop_nama ?? '').trim()
  if (!nama) return { nama: 'PropFS', logo: '', kontak: 'propfs.id', bawaan: true, sumber: 'bawaan' }
  return {
    nama, logo: (k.kop_logo ?? '').trim(), kontak: (k.kop_kontak ?? '').trim(),
    bawaan: false, sumber: 'perusahaan',
  }
}

export default function KwitansiViewPage() {
  const { token = '' } = useParams()
  const [k, setK] = useState<KwitansiPublik | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    let hidup = true
    kwitansiApi().byToken(token)
      .then(r => {
        if (!hidup) return
        if (!r) setGalat('Kwitansi ini tidak ditemukan, atau tautannya sudah tidak berlaku.')
        else setK(r)
      })
      .catch(() => hidup && setGalat('Tidak bisa membuka kwitansi ini. Coba lagi sebentar.'))
      .finally(() => hidup && setMemuat(false))
    return () => { hidup = false }
  }, [token])

  if (memuat) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-navy" />
      </div>
    )
  }
  if (galat || !k) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="max-w-sm text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
          <p className="font-bold text-navy">{galat || 'Kwitansi tidak ditemukan.'}</p>
          <p className="text-sm text-muted-foreground">Silakan hubungi penerbit kwitansinya.</p>
        </div>
      </div>
    )
  }

  const wajib = perluMaterai(k.jumlah)

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="bg-navy text-white rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-wide opacity-70">Kwitansi</p>
          <p className="font-serif text-xl font-bold">{k.nomor}</p>
          <p className="text-xs opacity-80 mt-1">{k.kop_nama || 'PropFS'}</p>
        </div>

        <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
          <Baris label="Telah terima dari" isi={k.penerima_dari} tebal />
          <div>
            <p className="text-[11px] font-bold text-muted-foreground">Uang sejumlah</p>
            <p className="text-sm font-bold italic text-navy bg-slate-50 border border-border
              rounded-xl px-3 py-2 mt-1 leading-relaxed">
              {terbilang(k.jumlah)}
            </p>
          </div>
          <Baris label="Untuk pembayaran" isi={k.untuk_pembayaran} />
          {k.project_name && <Baris label="Proyek" isi={k.project_name} />}
          <Baris label="Cara pembayaran"
            isi={LABEL_METODE_TERIMA[k.metode] ?? String(k.metode)} />
          <Baris label="Tanggal" isi={tglPanjang(k.tanggal)} />
          {k.catatan && <Baris label="Catatan" isi={k.catatan} />}

          <div className="rounded-xl bg-navy text-white px-4 py-3">
            <p className="text-[11px] opacity-70">Jumlah diterima</p>
            <p className="text-2xl font-bold">{fmt(k.jumlah)}</p>
          </div>

          {/* Keadaan meterai dikatakan apa adanya kepada konsumen juga.
              Dialah yang kelak memakai kwitansi ini sebagai alat bukti, dan
              menyembunyikan bahwa meterainya belum ada berarti membiarkannya
              mengira dokumennya lebih kuat daripada yang sebenarnya. */}
          {wajib && (
            <p className={`flex items-start gap-2 text-xs rounded-xl p-2.5 ${
              k.materai_status === 'terbubuh'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {k.materai_status === 'terbubuh'
                  ? <>Sudah dibubuhi <b>e-Meterai resmi</b>{k.materai_sn ? ` · ${k.materai_sn}` : ''}.</>
                  : <>Nominalnya wajib bermeterai, dan <b>e-Meterai belum terbubuh</b> pada
                     kwitansi ini. Silakan minta penerbitnya melengkapi.</>}
              </span>
            </p>
          )}

          {k.penanda_nama && (
            <div className="pt-1">
              <p className="text-[11px] font-bold text-muted-foreground">Penerima</p>
              {k.penanda_signature && (
                <img src={k.penanda_signature} alt="Tanda tangan"
                  className="h-14 object-contain my-1" />
              )}
              <p className="text-sm font-bold text-navy">{k.penanda_nama}</p>
              {k.penanda_jabatan && (
                <p className="text-[11px] text-muted-foreground">{k.penanda_jabatan}</p>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => unduhKwitansiPdf({ ...KWITANSI_KOSONG, ...k }, kop(k), TANPA_WATERMARK)}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3
            text-sm font-bold text-navy">
          <Download className="w-4 h-4" /> Unduh PDF
        </button>
      </div>
    </div>
  )
}

function Baris({ label, isi, tebal }: { label: string; isi: string; tebal?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
      <p className={`text-navy ${tebal ? 'text-base font-bold' : 'text-sm'}`}>{isi || '-'}</p>
    </div>
  )
}
