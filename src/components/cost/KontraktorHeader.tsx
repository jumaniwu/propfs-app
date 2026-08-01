// ============================================================
// Header Kontraktor AI — dipakai SEMUA halaman modul ini (Home, workspace
// proyek, Konsolidasi, Material, Tim) supaya tampilannya satu konsep.
// Baris atas identik di mana pun; judul halaman & tombol kembali opsional.
// ============================================================
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Users, Menu } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import PanelNotifikasi from '@/components/cost/PanelNotifikasi'

interface Props {
  /** Judul halaman di bawah baris atas. Kosong = hanya baris atas (Home). */
  judul?: string
  /** Baris kecil di bawah judul, mis. nama proyek. */
  subjudul?: React.ReactNode
  /** Bila diisi, tombol kembali ditampilkan menuju route ini. */
  kembaliKe?: string
  labelKembali?: string
  /** Tombol tambahan di sisi kanan judul, mis. "Simpan Data". */
  aksi?: React.ReactNode
  /** Konten tambahan di bawah baris atas (Home memakai ini untuk pencarian). */
  children?: React.ReactNode
  /** Ruang ekstra di bawah header agar konten bisa menimpanya (Home). */
  pbExtra?: boolean
  /** Mengganti blok identitas di kiri (Home memakai pemilih workspace). */
  identitas?: React.ReactNode
  /** Bila diisi, tombol menu (☰) tampil di kiri pada layar kecil. */
  onMenu?: () => void
}

export default function KontraktorHeader({
  judul, subjudul, kembaliKe, labelKembali = 'Home Kontraktor AI',
  aksi, children, pbExtra, identitas, onMenu,
}: Props) {
  const navigate = useNavigate()
  const { profile } = useAuthStore()

  return (
    <div className={`bg-gradient-to-b from-navy to-navy/95 text-white ${pbExtra ? 'pb-20' : 'pb-5'}`}>
      <div className="max-w-5xl mx-auto px-4 pt-5">
        {/* Baris atas — sama persis di seluruh halaman Kontraktor AI */}
        <div className="flex items-center justify-between gap-3">
          {onMenu && (
            <button onClick={onMenu} aria-label="Buka Menu"
              className="md:hidden w-9 h-9 -ml-1 rounded-full hover:bg-white/10 flex items-center justify-center shrink-0">
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <button onClick={() => navigate('/kontraktor')}
              className="font-serif font-bold text-lg leading-tight hover:text-gold transition-colors text-left">
              Kontraktor AI
            </button>
            {identitas ?? (
              <p className="text-white/60 text-[11px] truncate">
                {profile?.company || 'Workspace Saya'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => navigate('/kontraktor/tim')}
              className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center" title="Tim">
              <Users className="w-[18px] h-[18px]" />
            </button>
            {/* Lonceng kini punya isi: kabar dari lapangan, diturunkan dari
                data yang sudah ada. Penanda titik merah lama dihapus — lencana
                berangka lebih berguna daripada titik tanpa keterangan. */}
            <PanelNotifikasi />
            <button onClick={() => navigate('/profile')}
              className="w-9 h-9 rounded-full bg-gold text-navy font-black text-sm flex items-center justify-center shrink-0">
              {(profile?.full_name || 'P').charAt(0).toUpperCase()}
            </button>
          </div>
        </div>

        {children}

        {/* Judul halaman + tombol kembali */}
        {(judul || kembaliKe) && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div className="min-w-0">
              {kembaliKe && (
                <button onClick={() => navigate(kembaliKe)}
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-white/10 text-white/80 text-[11px] font-bold hover:bg-white/20 transition-colors mb-2">
                  <ArrowLeft className="h-3.5 w-3.5" /> {labelKembali}
                </button>
              )}
              {judul && <h1 className="font-serif text-xl md:text-2xl font-bold truncate">{judul}</h1>}
              {subjudul && <p className="text-white/60 text-xs mt-0.5 truncate">{subjudul}</p>}
            </div>
            {aksi && <div className="shrink-0 w-full sm:w-auto">{aksi}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
