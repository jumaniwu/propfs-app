// ============================================================
// Lonceng notifikasi Kontraktor AI.
//
// Isinya diturunkan dari tabel yang sudah ada — tidak ada tabel notifikasi,
// tidak ada migrasi. Yang disimpan hanya KAPAN TERAKHIR DIBACA, satu tanda
// waktu per perangkat, supaya lencananya bisa dihitung.
//
// KENAPA ISINYA DIMUAT SEBELUM LONCENGNYA DIBUKA
//
// Dulu tidak. Isinya baru diminta ketika loncengnya dibuka, dan sebelum itu
// daftarnya kosong — sehingga lencana, yang dihitung dari daftar itu, SELALU
// NOL. Satu-satunya cara mengetahui ada kabar baru adalah membuka loncengnya
// untuk memeriksa. Yang tersisa dari sebuah notifikasi kalau begitu hanya
// namanya.
//
// Tetapi memuatnya di setiap layar juga bukan jawabannya, dan keberatan yang
// dulu ditulis di sini tetap berlaku: delapan permintaan jaringan sekaligus
// tiap kali halaman dibuka, ditanggung pemakai yang sedang di lapangan dengan
// sinyal seadanya. KontraktorHeader dipasang di belasan halaman.
//
// Jalan keluarnya bukan memilih salah satu, melainkan MEMBAGI hasilnya.
// Satu simpanan tingkat modul dipakai bersama seluruh halaman: berpindah
// halaman menampilkan angka yang sudah ada tanpa satu pun permintaan baru,
// dan pemuatannya sendiri berulang pelan di latar. Keputusan "sudah pantaskah
// bertanya lagi" ada di lib/kabarBaru.ts supaya bisa diuji tanpa DOM.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Loader2, RefreshCw, X, HardHat, PackageOpen, ShoppingCart, Truck, FileSignature, ClipboardList, ReceiptText, MessageSquare } from 'lucide-react'
import { fieldApi } from '@/lib/fieldReports'
import { materialApi } from '@/lib/materialApi'
import { penerimaanApi } from '@/lib/penerimaanApi'
import { procurementApi } from '@/lib/procurementApi'
import { spkApi } from '@/lib/spkApi'
import { chatTimApi } from '@/lib/chatTimApi'
import { useAuthStore } from '@/store/authStore'
import {
  susunNotifikasi, belumDibaca, lencana, waktuLalu, ringkasNotifikasi,
  LABEL_JENIS, type Notifikasi, type JenisNotifikasi,
} from '@/lib/notifikasi'
import { perluMuat, batasDibaca, labelLonceng, JEDA_MUAT_MS } from '@/lib/kabarBaru'

const KUNCI_DIBACA = 'propfs-notifikasi-dibaca'

// ── Simpanan bersama seluruh halaman ────────────────────────────────────────
//
// Hidup di tingkat modul, bukan di dalam komponen: KontraktorHeader di-mount
// ulang setiap kali halaman berpindah, dan keadaan di dalam komponen akan
// hilang bersamanya — lalu delapan permintaan jaringan dikirim lagi hanya
// untuk memperoleh kembali angka yang tadi sudah ada.
let simpanan: Notifikasi[] = []
let terakhirMuat = 0
let sedangMuat = false
const pendengar = new Set<(d: Notifikasi[]) => void>()

function siarkan(d: Notifikasi[]) {
  simpanan = d
  terakhirMuat = Date.now()
  for (const f of pendengar) { try { f(d) } catch { /* satu pendengar rusak tidak menghentikan sisanya */ } }
}

/**
 * Ambil kabar dari seluruh modul.
 *
 * Kegagalan satu sumber TIDAK boleh mengosongkan daftar — kabar dari modul
 * lain tetap layak ditampilkan, dan lonceng yang mendadak kosong karena satu
 * tabel sedang bermasalah terbaca sebagai "tidak ada apa-apa", bukan sebagai
 * kegagalan.
 */
async function ambilKabar(sayaId?: string): Promise<Notifikasi[]> {
  const [laporan, pakai, request, terima, spk, opname, invoice, chat] = await Promise.all([
    fieldApi().listReportsTerbaru(30).catch(() => []),
    materialApi().listUsage().catch(() => []),
    materialApi().listRequests().catch(() => []),
    penerimaanApi().listDo().catch(() => []),
    spkApi().listSpk().catch(() => []),
    spkApi().listOpname().catch(() => []),
    procurementApi().listInvoice().catch(() => []),
    chatTimApi().list(40).catch(() => []),
  ])
  return susunNotifikasi({
    laporan: laporan as never, pakai, request, terima,
    ttd: spk as never, opname: opname as never, invoice: invoice as never,
    chat: chat as never, sayaId,
  })
}

const IKON: Record<JenisNotifikasi, typeof Bell> = {
  laporan: HardHat, pakai: PackageOpen, request: ShoppingCart,
  terima: Truck, ttd: FileSignature, opname: ClipboardList, invoice: ReceiptText,
  chat: MessageSquare,
}
const WARNA: Record<JenisNotifikasi, string> = {
  laporan: 'bg-amber-100 text-amber-700',
  pakai: 'bg-blue-100 text-blue-700',
  request: 'bg-rose-100 text-rose-700',
  terima: 'bg-emerald-100 text-emerald-700',
  ttd: 'bg-violet-100 text-violet-700',
  opname: 'bg-slate-100 text-slate-700',
  invoice: 'bg-sky-100 text-sky-700',
  chat: 'bg-navy/10 text-navy',
}

function bacaTerakhir(): string {
  try { return localStorage.getItem(KUNCI_DIBACA) ?? '' } catch { return '' }
}

export default function PanelNotifikasi() {
  const navigate = useNavigate()
  const sayaId = useAuthStore(s => s.user?.id)
  const [buka, setBuka] = useState(false)
  const [daftar, setDaftar] = useState<Notifikasi[]>(simpanan)
  const [memuat, setMemuat] = useState(false)
  const [terakhir, setTerakhir] = useState<string>(() => bacaTerakhir())

  const muat = useCallback(async (paksa = false) => {
    if (!perluMuat({ terakhirMuat, sedangMuat, sekarang: Date.now(), paksa })) return
    sedangMuat = true
    setMemuat(true)
    try {
      siarkan(await ambilKabar(sayaId))
    } catch {
      // Diam: lonceng yang memunculkan pesan galat setiap kali sinyal hilang
      // lebih mengganggu daripada lencana yang telat sebentar.
    } finally {
      sedangMuat = false
      setMemuat(false)
    }
  }, [sayaId])

  // Berlangganan simpanan bersama: halaman lain yang memuat ulang ikut
  // memperbarui lencana di sini, tanpa permintaan kedua.
  useEffect(() => {
    pendengar.add(setDaftar)
    return () => { pendengar.delete(setDaftar) }
  }, [])

  // Dimuat di latar, berulang pelan — INILAH yang membuat lencananya berarti.
  //
  // Tidak menahan render apa pun: yang dipanggil di sini janji yang hasilnya
  // dibiarkan datang belakangan, bukan sesuatu yang ditunggu halamannya.
  useEffect(() => {
    if (!sayaId) return
    void muat()
    const jam = setInterval(() => { void muat() }, JEDA_MUAT_MS)
    // Kembali dari aplikasi lain adalah saat orang paling ingin tahu apa yang
    // terlewat — dan saat itu jeda dua menitnya bisa saja baru berjalan
    // sedetik.
    const balik = () => { if (document.visibilityState === 'visible') void muat(true) }
    document.addEventListener('visibilitychange', balik)
    return () => { clearInterval(jam); document.removeEventListener('visibilitychange', balik) }
  }, [sayaId, muat])

  // Membuka lonceng memaksa penyegaran: yang membukanya sedang bertanya
  // "apa yang baru", dan jawaban dua menit lalu bukan jawabannya.
  useEffect(() => { if (buka) void muat(true) }, [buka]) // eslint-disable-line react-hooks/exhaustive-deps

  const baru = belumDibaca(daftar, terakhir)
  const tandaBaca = () => {
    // Diambil dari kabar TERATAS yang sedang tampil, bukan dari jam sekarang —
    // lihat lib/kabarBaru.ts: memakai jam sekarang akan menandai terbaca kabar
    // yang belum pernah muncul di layar.
    const t = batasDibaca(daftar, new Date().toISOString())
    try { localStorage.setItem(KUNCI_DIBACA, t) } catch { /* mode privat: lencana saja yang tidak menempel */ }
    setTerakhir(t)
  }

  return (
    <>
      <button onClick={() => setBuka(true)}
        className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center relative"
        title={labelLonceng(baru.length)} aria-label={labelLonceng(baru.length)}>
        <Bell className="w-[18px] h-[18px]" />
        {baru.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-gold text-navy text-[10px] font-black flex items-center justify-center">
            {lencana(baru.length)}
          </span>
        )}
      </button>

      {buka && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Daftar notifikasi">
          <button className="absolute inset-0 bg-black/40" onClick={() => setBuka(false)} aria-label="Tutup" />
          <div className="relative w-full sm:max-w-sm bg-white h-full shadow-2xl flex flex-col text-navy">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-sm">Notifikasi</p>
                <p className="text-[11px] text-muted-foreground truncate">{ringkasNotifikasi(daftar)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => void muat(true)} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center" title="Muat ulang">
                  <RefreshCw className={`w-4 h-4 ${memuat ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => setBuka(false)} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center" title="Tutup">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {baru.length > 0 && (
              <button onClick={tandaBaca}
                className="text-[11px] font-bold text-navy bg-gold-lt hover:bg-gold/30 py-2 border-b border-border transition-colors">
                Tandai semua sudah dibaca ({lencana(baru.length)})
              </button>
            )}

            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {memuat && daftar.length === 0 && (
                <div className="p-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Memuat kabar lapangan…
                </div>
              )}
              {!memuat && daftar.length === 0 && (
                <p className="p-6 text-center text-xs text-muted-foreground">
                  Belum ada kabar dari lapangan. Begitu tukang atau pengawas mengisi
                  laporan, memakai material, atau meminta barang, kabarnya muncul di sini.
                </p>
              )}
              {daftar.map(n => {
                const Ikon = IKON[n.jenis]
                const belum = belumDibaca([n], terakhir).length > 0
                return (
                  <button key={n.id}
                    onClick={() => { setBuka(false); navigate(n.tautan) }}
                    className={`w-full text-left px-3 py-2.5 flex gap-2.5 hover:bg-slate-50 transition-colors ${belum ? 'bg-gold-lt/40' : ''}`}>
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${WARNA[n.jenis]}`}>
                      <Ikon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-bold truncate">{n.judul}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{waktuLalu(n.waktu)}</span>
                      </span>
                      <span className="block text-[11px] text-muted-foreground truncate">{n.rincian}</span>
                      <span className="block text-[10px] text-muted-foreground/80 truncate">
                        {LABEL_JENIS[n.jenis]}{n.proyek ? ` · ${n.proyek}` : ''}
                        {n.menunggu && <span className="ml-1 font-bold text-rose-700">• perlu tindakan</span>}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
