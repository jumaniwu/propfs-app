/**
 * Navigasi bawah ala aplikasi mobile (hanya tampil di layar < lg).
 *
 * Dulu isinya lima pintu ke lima dunia berbeda — Beranda akun, Feasibility
 * Study, AI Architect, Kontraktor AI, Profil. Susunan itu masuk akal ketika
 * PropFS masih dua produk terpisah, tetapi tidak lagi: pekerjaan sehari-hari
 * seluruhnya terjadi di Kontraktor AI, dan tiga tombol pertama hanya
 * memindahkan orang menjauh darinya.
 *
 * Sekarang Beranda MENUJU Home Kontraktor AI, dan slot kedua diisi Chat AI —
 * satu pintu untuk menyuruh AI mengerjakan data lintas modul. Feasibility Study
 * dan AI Architect pindah menjadi ikon di dalam grid menu; halamannya tidak
 * dihapus, hanya tidak lagi memakan slot navigasi.
 *
 * Susunannya sama untuk akun tim: yang dulu perlu disembunyikan dari karyawan
 * (Feasibility Study, dashboard akun utama) memang sudah tidak ada di sini.
 *
 * Isi & aturan penyalaan ada di lib/navBawah.ts supaya bisa diuji di Node.
 */
import { useLocation, useNavigate } from 'react-router-dom'
import { Home, MessageSquare, User } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { ITEM_NAV, itemAktif, navTampil } from '@/lib/navBawah'

const IKON: Record<string, React.ComponentType<{ className?: string }>> = {
  '/kontraktor': Home,
  '/kontraktor/chat': MessageSquare,
  '/profile': User,
}

export function useBottomNavVisible(): boolean {
  const location = useLocation()
  const user = useAuthStore(s => s.user)
  return navTampil(location.pathname, !!user)
}

export default function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const visible = useBottomNavVisible()
  if (!visible) return null

  const aktif = itemAktif(ITEM_NAV, location.pathname)

  return (
    <>
      {/* spacer agar konten halaman tidak tertutup nav yang fixed */}
      <div aria-hidden className="h-16 lg:hidden" />
      <nav
        aria-label="Navigasi utama"
        className="fixed bottom-0 inset-x-0 z-50 lg:hidden bg-white dark:bg-navy border-t border-border shadow-[0_-2px_10px_rgba(13,27,42,0.08)] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="h-16 grid" style={{ gridTemplateColumns: `repeat(${ITEM_NAV.length}, minmax(0, 1fr))` }}>
          {ITEM_NAV.map(item => {
            const active = aktif?.path === item.path
            const Icon = IKON[item.path] ?? Home
            return (
              <button
                key={item.path}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center justify-center gap-1 transition-colors min-w-0 px-1 ${
                  active ? 'text-gold' : 'text-muted-foreground hover:text-navy dark:hover:text-cream'
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${active ? 'stroke-[2.5]' : ''}`} />
                <span className={`text-[10px] leading-none truncate max-w-full ${active ? 'font-bold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
