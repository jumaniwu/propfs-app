// ============================================================
// Dua hal yang dulu hanya ada di dashboard akun `/home`, dan yang harus ikut
// pindah ketika halaman itu pensiun:
//
//   1. Peringatan invoice yang belum dibayar. Ini satu-satunya tempat pemakai
//      diberi tahu bahwa ada tagihan menunggu; menghilangkannya berarti
//      langganannya bisa mati tanpa ia pernah melihat peringatan apa pun.
//   2. Sambutan untuk pemakai baru.
//
// Sisanya — jumlah proyek, kartu modul, kartu langganan, pemakaian AI — memang
// sudah ada di tempat yang lebih tepat: proyek & modul di halaman ini, dan
// langganan beserta riwayat invoice di Profil.
// ============================================================
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { batasWaktu } from '@/lib/batasWaktu'
import { Button } from '@/components/ui/button'
import WelcomeModal from '@/components/onboarding/WelcomeModal'
import { bolehLihatSambutan } from '@/lib/sambutanAwal'
import { sesiTim, getWorkspaceOwner } from '@/lib/teamApi'

interface Invoice { id: string; invoice_number?: string; plan_id?: string; status?: string; created_at?: string }

/** Tagihan yang belum lunas, dari server maupun yang tersimpan lokal. */
async function tagihanBelumLunas(userId: string): Promise<Invoice | null> {
  const semua: Invoice[] = []
  // Diberi tenggat: supabase-js bisa menggantung tanpa pernah gagal, dan
  // `try/catch` tidak menolong terhadap janji yang tidak pernah selesai —
  // tagihan yang tersimpan lokal pun ikut tak pernah ditampilkan.
  const { data, error } = await batasWaktu(
    supabase.from('invoices').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    6000,
    { data: null, error: { message: 'server tidak menjawab tepat waktu' } } as any,
  )
  if (data && !error) semua.push(...data)

  // Tagihan yang gagal disimpan di server tetap ada di perangkat ini.
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k?.startsWith('propfs_invoice_')) continue
    try {
      const inv = JSON.parse(localStorage.getItem(k) || '{}')
      if (inv.user_id === userId && !semua.some(x => x.id === inv.id)) semua.push(inv)
    } catch { /* baris rusak dilewati */ }
  }

  semua.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
  return semua.find(i => i.status && i.status !== 'paid') ?? null
}

export default function PanelAkun() {
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const [tagihan, setTagihan] = useState<Invoice | null>(null)

  // Karyawan TIDAK PERNAH melihat sambutan ini.
  //
  // Isinya menyuruh menekan "+ Proyek Baru" untuk membuat proyek Feasibility
  // Study — tombol yang memang tidak ada untuknya, di modul yang dikunci untuk
  // sesi tim oleh RouteGuards. Dua syarat lamanya (belum ditutup, dan
  // total_projects_created masih nol) SELALU benar untuk karyawan: ia memang
  // tidak pernah membuat proyek FS, dan tidak akan pernah.
  const [sambutan, setSambutan] = useState(() => bolehLihatSambutan({
    sesiTim: sesiTim(),
    workspaceOwner: getWorkspaceOwner(),
    userId: user?.id ?? null,
    sudahDitutup: !!user && !!localStorage.getItem(`propfs_welcome_shown_${user.id}`),
    proyekDibuat: profile?.total_projects_created ?? 0,
  }))

  useEffect(() => {
    if (!profile?.id) return
    let batal = false
    void tagihanBelumLunas(profile.id).then(t => { if (!batal) setTagihan(t) })
    return () => { batal = true }
  }, [profile?.id])

  function tutupSambutan() {
    if (user) localStorage.setItem(`propfs_welcome_shown_${user.id}`, 'true')
    setSambutan(false)
  }

  return (
    <>
      {sambutan && profile && (
        <WelcomeModal userName={profile.full_name || ''} onClose={tutupSambutan} />
      )}

      {tagihan && (
        <div data-panel="tagihan"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50 border border-amber-300 rounded-2xl p-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">💳</div>
            <div className="min-w-0">
              <p className="font-bold text-navy text-sm">Ada invoice menunggu pembayaran</p>
              <p className="text-xs text-muted-foreground truncate">
                No. {tagihan.invoice_number} · Paket {(tagihan.plan_id || '').toUpperCase()}
              </p>
            </div>
          </div>
          <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white font-bold shrink-0"
            onClick={() => navigate(`/payment/${tagihan.id}`)}>
            Bayar sekarang
          </Button>
        </div>
      )}
    </>
  )
}
