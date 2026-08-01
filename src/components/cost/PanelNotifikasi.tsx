// ============================================================
// Lonceng notifikasi Kontraktor AI.
//
// Isinya diturunkan dari tabel yang sudah ada — tidak ada tabel notifikasi,
// tidak ada migrasi. Yang disimpan hanya KAPAN TERAKHIR DIBACA, satu tanda
// waktu per perangkat, supaya lencananya bisa dihitung.
//
// Dimuat saat lonceng DIBUKA, bukan saat setiap halaman dirender: kabar
// lapangan tidak sepenting membuat setiap layar menunggu jaringan lebih dulu.
// ============================================================
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Loader2, RefreshCw, X, HardHat, PackageOpen, ShoppingCart, Truck, FileSignature, ClipboardList } from 'lucide-react'
import { fieldApi } from '@/lib/fieldReports'
import { materialApi } from '@/lib/materialApi'
import { penerimaanApi } from '@/lib/penerimaanApi'
import { spkApi } from '@/lib/spkApi'
import {
  susunNotifikasi, belumDibaca, lencana, waktuLalu, ringkasNotifikasi,
  LABEL_JENIS, type Notifikasi, type JenisNotifikasi,
} from '@/lib/notifikasi'

const KUNCI_DIBACA = 'propfs-notifikasi-dibaca'

const IKON: Record<JenisNotifikasi, typeof Bell> = {
  laporan: HardHat, pakai: PackageOpen, request: ShoppingCart,
  terima: Truck, ttd: FileSignature, opname: ClipboardList,
}
const WARNA: Record<JenisNotifikasi, string> = {
  laporan: 'bg-amber-100 text-amber-700',
  pakai: 'bg-blue-100 text-blue-700',
  request: 'bg-rose-100 text-rose-700',
  terima: 'bg-emerald-100 text-emerald-700',
  ttd: 'bg-violet-100 text-violet-700',
  opname: 'bg-slate-100 text-slate-700',
}

function bacaTerakhir(): string {
  try { return localStorage.getItem(KUNCI_DIBACA) ?? '' } catch { return '' }
}

export default function PanelNotifikasi() {
  const navigate = useNavigate()
  const [buka, setBuka] = useState(false)
  const [daftar, setDaftar] = useState<Notifikasi[]>([])
  const [memuat, setMemuat] = useState(false)
  const [terakhir, setTerakhir] = useState<string>(() => bacaTerakhir())

  async function muat() {
    setMemuat(true)
    try {
      // Kegagalan satu sumber tidak boleh mengosongkan seluruh daftar — kabar
      // dari modul lain tetap layak ditampilkan.
      const [laporan, pakai, request, terima, spk, opname] = await Promise.all([
        fieldApi().listReportsTerbaru(30).catch(() => []),
        materialApi().listUsage().catch(() => []),
        materialApi().listRequests().catch(() => []),
        penerimaanApi().listDo().catch(() => []),
        spkApi().listSpk().catch(() => []),
        spkApi().listOpname().catch(() => []),
      ])
      setDaftar(susunNotifikasi({
        laporan: laporan as never, pakai, request, terima,
        ttd: spk as never, opname: opname as never,
      }))
    } finally { setMemuat(false) }
  }

  // Sekali saat lonceng pertama dibuka; sesudahnya lewat tombol muat ulang.
  useEffect(() => { if (buka && daftar.length === 0) void muat() }, [buka]) // eslint-disable-line react-hooks/exhaustive-deps

  const baru = belumDibaca(daftar, terakhir)
  const tandaBaca = () => {
    const t = daftar[0]?.waktu ?? new Date().toISOString()
    try { localStorage.setItem(KUNCI_DIBACA, t) } catch { /* mode privat: lencana saja yang tidak menempel */ }
    setTerakhir(t)
  }

  return (
    <>
      <button onClick={() => setBuka(true)}
        className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center relative"
        title="Notifikasi" aria-label="Notifikasi">
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
                <button onClick={() => void muat()} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center" title="Muat ulang">
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
