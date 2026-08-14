import { useEffect, useState } from 'react'
import { ReceiptText, Download, Copy, RefreshCw, Loader2, ShieldCheck, Send } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { kopSaya } from '@/lib/identitasSaya'
import { kwitansiApi, kwitansiLink, type BarisKwitansi } from '@/lib/kwitansiApi'
import { unduhKwitansiPdf } from '@/lib/kwitansiPdf'
import { perluMaterai, LABEL_STATUS_MATERAI, TONE_STATUS_MATERAI } from '@/lib/kwitansi'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`
const tgl = (s?: string | null) => {
  if (!s) return '-'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? String(s)
    : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Riwayat kwitansi yang sudah diterbitkan.
 *
 * Tanpa daftar ini, kwitansi hanya ada sebagai berkas unduhan di perangkat
 * yang membuatnya. Nomornya pun berurut dari hitungan yang tidak bisa dilihat
 * siapa pun — dan ketika konsumen bertanya "kwitansi termin kedua nomor
 * berapa", tidak ada tempat untuk menjawabnya.
 *
 * Yang ditampilkan adalah baris yang BENAR-BENAR tersimpan di server. Kalau
 * daftarnya kosong padahal PDF-nya sudah diunduh, itu keterangan yang berguna:
 * penyimpanannya belum berhasil, dan sebabnya dikatakan di sini.
 */
export default function PanelDaftarKwitansi({ muatUlang = 0 }: { muatUlang?: number }) {
  const { toast } = useToast()
  const [daftar, setDaftar] = useState<BarisKwitansi[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  async function muat() {
    setMemuat(true)
    try {
      setDaftar(await kwitansiApi().list())
      setGalat('')
    } catch (e) {
      setGalat(e instanceof Error ? e.message : String(e))
    } finally { setMemuat(false) }
  }
  useEffect(() => { void muat() }, [muatUlang])

  const merek = kopSaya()

  return (
    <div data-daftar-kwitansi className="bg-white rounded-3xl border border-border p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ReceiptText className="w-4 h-4 text-navy shrink-0" />
          <h3 className="font-bold text-navy text-sm truncate">
            Kwitansi Terbit ({daftar.length})
          </h3>
        </div>
        <button onClick={() => void muat()} disabled={memuat}
          className="p-1.5 text-muted-foreground hover:text-navy" aria-label="Muat ulang">
          <RefreshCw className={`w-3.5 h-3.5 ${memuat ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {galat && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200
          rounded-xl p-2.5 break-words">{galat}</p>
      )}

      {memuat && daftar.length === 0 ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : daftar.length === 0 && !galat ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Belum ada kwitansi terbit. Buat dari baris pemasukan di atas.
        </p>
      ) : (
        <div className="space-y-2 max-h-[45vh] overflow-y-auto overscroll-contain pr-0.5">
          {daftar.map(k => (
            <div key={k.id} className="rounded-xl border border-border p-3 space-y-2 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-navy break-words">{k.nomor}</p>
                  <p className="text-[10px] text-muted-foreground break-words">
                    {k.penerima_dari || '—'} · {tgl(k.tanggal)}
                    {k.untuk_pembayaran ? ` · ${k.untuk_pembayaran}` : ''}
                  </p>
                </div>
                <p className="text-xs font-bold text-navy shrink-0">{fmt(k.jumlah)}</p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {perluMaterai(k.jumlah) && (
                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full
                    ${TONE_STATUS_MATERAI[k.materai_status]}`}>
                    {LABEL_STATUS_MATERAI[k.materai_status]}
                  </span>
                )}
                {k.terkirim_at ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                    <Send className="w-3 h-3" /> Terkirim {tgl(k.terkirim_at)}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Belum dikirim</span>
                )}
                {k.penanda_signature && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-navy">
                    <ShieldCheck className="w-3 h-3" /> Bertanda tangan
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  data-unduh-riwayat
                  onClick={() => unduhKwitansiPdf(k, merek)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border
                    border-border px-2 py-1.5 text-[11px] font-bold text-navy">
                  <Download className="w-3 h-3" /> PDF
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(kwitansiLink(k.view_token))
                    toast({
                      title: 'Tautan disalin',
                      description: k.terkirim_at ? undefined
                        : 'Tautannya baru bisa dibuka konsumen setelah kwitansinya dikirim.',
                    })
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border
                    border-border px-2 py-1.5 text-[11px] font-bold text-navy">
                  <Copy className="w-3 h-3" /> Tautan
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
