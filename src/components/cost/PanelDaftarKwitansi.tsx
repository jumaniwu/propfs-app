import { useEffect, useState } from 'react'
import {
  ReceiptText, Download, Copy, RefreshCw, Loader2, ShieldCheck, Send, Check,
  Pencil, Trash2, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { kopSaya } from '@/lib/identitasSaya'
import { waKe } from '@/lib/waLink'
import { kwitansiApi, kwitansiLink, type BarisKwitansi } from '@/lib/kwitansiApi'
import { unduhKwitansiPdf, unduhPdfTersimpan } from '@/lib/kwitansiPdf'
import {
  perluMaterai, siapKirimKwitansi, pesanWaKwitansi, namaFileKwitansi,
  bolehKelolaKwitansi, akibatHapusKwitansi,
  LABEL_STATUS_MATERAI, TONE_STATUS_MATERAI,
} from '@/lib/kwitansi'
import { roleSaatIni, teamApi, type Workspace } from '@/lib/teamApi'
import { useAuthStore } from '@/store/authStore'
import DialogUnggahMaterai from './DialogUnggahMaterai'
import DaftarBulanan from './DaftarBulanan'
import DialogKwitansi from './DialogKwitansi'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`
const tgl = (s?: string | null) => {
  if (!s) return '-'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? String(s)
    : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Riwayat kwitansi yang sudah diterbitkan — dan tempat semua tindakannya.
 *
 * Unduh PDF, pembubuhan meterai, dan pengiriman ke konsumen ada DI SINI, bukan
 * di dalam formulir pembuatannya. Ketiganya masuk akal berkali-kali dan pada
 * waktu yang berlainan: meterai dibubuhkan di situs lain lalu dibawa kembali,
 * konsumen bisa minta dikirim ulang minggu depan. Formulir pembuatan hanya
 * masuk akal sekali, jadi ia tidak boleh menjadi satu-satunya pintu menuju
 * pekerjaan yang berulang.
 *
 * Yang ditampilkan adalah baris yang BENAR-BENAR tersimpan di server. Kalau
 * daftarnya kosong padahal kwitansinya baru dibuat, itu keterangan yang
 * berguna, dan sebabnya dikatakan di sini.
 */
export default function PanelDaftarKwitansi({ muatUlang = 0 }: { muatUlang?: number }) {
  const { toast } = useToast()
  const [daftar, setDaftar] = useState<BarisKwitansi[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [kirimId, setKirimId] = useState('')
  const [unduhId, setUnduhId] = useState('')
  const [materaiUntuk, setMateraiUntuk] = useState<BarisKwitansi | null>(null)
  const [ubahUntuk, setUbahUntuk] = useState<BarisKwitansi | null>(null)
  const [hapusUntuk, setHapusUntuk] = useState<BarisKwitansi | null>(null)
  const [hapusProses, setHapusProses] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])

  useEffect(() => {
    teamApi().myWorkspaces().then(setWorkspaces).catch(() => setWorkspaces([]))
  }, [])

  // Gerbangnya dihitung sekali di sini, bukan di tiap baris: satu jawaban
  // untuk seluruh panel menghindari daftar yang sebagian barisnya bisa dihapus
  // dan sebagian tidak tanpa alasan yang bisa diterangkan.
  const superadmin = useAuthStore(st => st.profile?.role) === 'superadmin'
  const izin = bolehKelolaKwitansi(roleSaatIni(workspaces), superadmin)

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

  /**
   * Unduh yang BERMETERAI bila barisnya sudah punya.
   *
   * `materai_pdf` sengaja tidak ikut dimuat bersama daftar — berkasnya sampai
   * 3 MB per baris. Jadi ia diambil di sini, saat tombolnya benar-benar
   * ditekan. Bila ternyata kosong (baris lama yang statusnya 'terbubuh' dari
   * jalur otomatis dulu, tanpa berkas), PDF-nya digambar seperti biasa —
   * lebih baik memberi yang bersih daripada tidak memberi apa-apa.
   */
  async function unduh(k: BarisKwitansi) {
    if (k.materai_status !== 'terbubuh') { unduhKwitansiPdf(k, merek); return }
    setUnduhId(k.id)
    try {
      const pdf = await kwitansiApi().materaiPdf(k.id)
      if (pdf) unduhPdfTersimpan(pdf, namaFileKwitansi({ ...k, materai_pdf: pdf }))
      else unduhKwitansiPdf(k, merek)
    } catch {
      unduhKwitansiPdf(k, merek)
    } finally { setUnduhId('') }
  }

  /**
   * Tandai terkirim LEBIH DULU, baru buka WhatsApp.
   *
   * Urutan sebaliknya terasa lebih cepat, tetapi `window.open` memindahkan
   * fokus ke aplikasi lain, dan permintaan yang belum selesai di tab yang
   * ditinggalkan tidak dijamin sampai. Tautannya sendiri baru bisa dibuka
   * konsumen setelah barisnya bertanda terkirim — jadi menandainya belakangan
   * berarti mengirim tautan yang saat itu masih tertutup.
   */
  async function hapus() {
    const k = hapusUntuk
    if (!k || hapusProses) return
    setHapusProses(true)
    try {
      await kwitansiApi().hapus(k.id)
      toast({ title: `Kwitansi ${k.nomor} dihapus` })
      setHapusUntuk(null)
      await muat()
    } catch (e) {
      toast({
        title: 'Gagal menghapus', variant: 'destructive',
        description: e instanceof Error ? e.message : String(e),
      })
    } finally { setHapusProses(false) }
  }

  async function kirim(k: BarisKwitansi) {
    const siap = siapKirimKwitansi(k)
    if (!siap.boleh) {
      toast({ title: 'Belum bisa dikirim', description: siap.alasan, variant: 'destructive' })
      return
    }
    setKirimId(k.id)
    try {
      await kwitansiApi().tandaiTerkirim(k.id)
      window.open(waKe(k.penerima_wa, pesanWaKwitansi(k, kwitansiLink(k.view_token))), '_blank')
      toast({ title: 'Kwitansi dikirim', description: 'Tautannya sudah bisa dibuka konsumen.' })
      await muat()
    } catch (e) {
      toast({
        title: 'Gagal mengirim', variant: 'destructive',
        description: e instanceof Error ? e.message : String(e),
      })
    } finally { setKirimId('') }
  }

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
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : daftar.length === 0 && !galat ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Belum ada kwitansi terbit. Buat dari baris pemasukan di atas.
        </p>
      ) : (
        <DaftarBulanan
          baris={daftar}
          tanggalDari={k => k.tanggal}
          nilaiDari={k => k.jumlah}
          kunci={k => k.id}
          satuan="kwitansi"
          className="max-h-[60vh] overflow-y-auto overscroll-contain pr-0.5"
          render={k => {
            const perlu = perluMaterai(k.jumlah)
            const belumMaterai = perlu && k.materai_status !== 'terbubuh'
            return (
              <div className="rounded-xl border border-border p-3 space-y-2 min-w-0">
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
                  {perlu && (
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
                      <Check className="w-3 h-3" /> Bertanda tangan
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    data-unduh-riwayat
                    onClick={() => void unduh(k)}
                    disabled={unduhId === k.id}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border
                      border-border px-2 py-1.5 text-[11px] font-bold text-navy">
                    {unduhId === k.id ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Download className="w-3 h-3" />}
                    {k.materai_status === 'terbubuh' ? 'PDF Bermeterai' : 'Unduh PDF'}
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

                {/* Pembubuhan meterai punya tombolnya sendiri, di luar formulir,
                    karena urutannya menyeberang ke situs e-Meterai lalu kembali. */}
                {perlu && (
                  <button data-bubuh-materai onClick={() => setMateraiUntuk(k)}
                    className={`w-full flex items-center justify-center gap-1.5 rounded-lg border
                      px-2 py-1.5 text-[11px] font-bold ${belumMaterai
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                    <ShieldCheck className="w-3 h-3" />
                    {belumMaterai ? 'Bubuhkan e-Meterai' : 'Ganti PDF bermeterai'}
                  </button>
                )}

                <Button data-kirim-kwitansi onClick={() => void kirim(k)}
                  disabled={kirimId === k.id}
                  variant="gold" size="sm" className="w-full gap-1.5 text-xs font-bold">
                  {kirimId === k.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Send className="w-3.5 h-3.5" />}
                  {k.terkirim_at ? 'Kirim Ulang ke Konsumen' : 'Kirim ke Konsumen'}
                </Button>

                {/* Ubah & Hapus HANYA untuk pemilik/superadmin. Kwitansi
                    adalah bukti penerimaan uang yang bernomor urut; orang yang
                    mencatatnya tidak boleh sekaligus bisa menghilangkannya. */}
                {izin.boleh && (
                  <div className="flex gap-2 pt-0.5">
                    <button data-ubah-kwitansi onClick={() => setUbahUntuk(k)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border
                        border-border px-2 py-1.5 text-[11px] font-bold text-navy">
                      <Pencil className="w-3 h-3" /> Ubah
                    </button>
                    <button data-hapus-kwitansi onClick={() => setHapusUntuk(k)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border
                        border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-700">
                      <Trash2 className="w-3 h-3" /> Hapus
                    </button>
                  </div>
                )}

                {belumMaterai && (
                  <p className="text-[10px] leading-relaxed text-amber-900">
                    Belum bermeterai. Boleh dikirim, tetapi versi bermeterai lebih kuat
                    kalau kwitansinya dipersoalkan.
                  </p>
                )}
              </div>
            )
          }}
        />
      )}

      {/* Alasan penolakan dikatakan sekali di kaki panel, bukan pada tiap
          baris: tanpa ini tombol yang tidak ada terbaca sebagai aplikasi
          rusak, bukan sebagai batasan yang disengaja. */}
      {!izin.boleh && daftar.length > 0 && (
        <p className="text-[10px] text-muted-foreground">{izin.alasan}</p>
      )}

      {materaiUntuk && (
        <DialogUnggahMaterai
          k={materaiUntuk}
          onSelesai={() => void muat()}
          onTutup={() => setMateraiUntuk(null)}
        />
      )}

      {ubahUntuk && (
        <DialogKwitansi
          baris={ubahUntuk}
          namaSaya={ubahUntuk.penanda_nama}
          onTutup={() => { setUbahUntuk(null); void muat() }}
        />
      )}

      {hapusUntuk && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center
          justify-center p-0 sm:p-4" onClick={() => setHapusUntuk(null)}>
          <div onClick={e => e.stopPropagation()}
            className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 space-y-3">
            <p className="flex items-center gap-2 font-bold text-navy">
              <AlertTriangle className="w-4 h-4 text-rose-600" /> Hapus kwitansi?
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground break-words">
              {akibatHapusKwitansi(hapusUntuk)}
            </p>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 font-bold"
                onClick={() => setHapusUntuk(null)}>Batal</Button>
              <Button data-hapus-ya onClick={() => void hapus()} disabled={hapusProses}
                className="flex-1 gap-1.5 font-bold bg-rose-600 hover:bg-rose-700 text-white">
                {hapusProses ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />}
                Hapus
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
