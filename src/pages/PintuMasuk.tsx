// ============================================================
// PINTU MASUK — pengganti dashboard akun lama di `/home`.
//
// Dulu setiap kali masuk (tombol "Buka Portal" di landing page, setelah login,
// tombol Portal di header) pemakainya mendarat di dashboard akun: sapaan,
// empat kotak angka, dan tiga kartu modul. Bagi pelanggan Kontraktor AI itu
// satu ketukan tambahan sebelum sampai ke pekerjaannya. Halaman itu kini
// pensiun — isinya sudah ada di tempat yang lebih tepat: langganan & invoice di
// Profil, proyek & modul di Home Kontraktor AI.
//
// Alamat `/home` sendiri dipertahankan, tidak dihapus, karena satu tugas yang
// hanya dikerjakan di sini: MENERBITKAN TAGIHAN untuk paket yang baru dipilih.
// Alamat itu sudah tersebar di tautan konfirmasi email pendaftaran, jadi
// mematikannya akan memutus alur berlangganan orang yang mendaftar kemarin.
// Setelah tagihannya terbit — atau bila memang tidak ada — pemakainya
// diteruskan ke berandanya sendiri tanpa pernah melihat halaman ini.
// ============================================================
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { fetchPPNRate } from '@/hooks/usePPNRate'
import { bacaRencanaTertunda } from '@/lib/berandaMasuk'
import { hitungTagihan, nomorInvoice, akhirPeriode } from '@/lib/tagihan'
import { batasWaktu } from '@/lib/batasWaktu'
import { useRutaMasuk } from '@/hooks/useRutaMasuk'

const KUNCI_TERTUNDA = 'propfs_pending_plan'


/** Harga sebulan sebuah paket, dari katalog. Nilai bawaan bila katalog gagal dibaca. */
async function hargaPaket(planId: string): Promise<number> {
  const bawaan = planId === 'pro' ? 399000 : 149000
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'plan_catalog').maybeSingle()
    if (data && Array.isArray(data.value)) {
      const p = data.value.find((x: any) => x?.id === planId)
      if (p?.priceIdr) return Number(p.priceIdr)
    }
  } catch {
    // Katalog tak terbaca bukan alasan menggagalkan pembelian.
  }
  return bawaan
}

export default function PintuMasuk() {
  const location = useLocation()
  const navigate = useNavigate()
  const profile = useAuthStore(s => s.profile)
  const beranda = useRutaMasuk()

  const rencana = bacaRencanaTertunda(location.search, localStorage.getItem(KUNCI_TERTUNDA))
  const [menerbitkan, setMenerbitkan] = useState(!!rencana)

  useEffect(() => {
    if (!rencana || !profile?.id) return
    let batal = false

    void (async () => {
      // Dikonsumsi lebih dulu supaya kegagalan di tengah jalan tidak membuat
      // tagihan yang sama terbit berulang kali setiap halaman ini dibuka.
      localStorage.removeItem(KUNCI_TERTUNDA)

      const bawaanHarga = rencana.plan === 'pro' ? 399000 : 149000
      const [harga, ppnRate] = await Promise.all([
        batasWaktu(hargaPaket(rencana.plan), 5000, bawaanHarga),
        batasWaktu(fetchPPNRate(), 5000, 0.11),
      ])
      const t = hitungTagihan(harga, rencana.bulan, ppnRate)
      const mulai = new Date()

      const isi = {
        user_id: profile.id,
        plan_id: rencana.plan,
        invoice_number: nomorInvoice(mulai),
        period_start: mulai.toISOString(),
        period_end: akhirPeriode(rencana.bulan, mulai).toISOString(),
        subtotal_idr: t.subtotal,
        ppn_idr: t.ppn,
        total_idr: t.total,
        status: 'pending' as const,
      }

      const { data, error } = await batasWaktu(
        supabase.from('invoices').insert(isi).select().single(),
        8000,
        { data: null, error: { message: 'server tidak menjawab tepat waktu' } } as any,
      )

      // Bila server menolak, tagihannya tetap dibuat secara lokal supaya
      // pemakainya bisa melihat nominal & instruksi transfer. PaymentPage
      // memang sudah membaca dari localStorage sebagai cadangan.
      const id = data && !error ? data.id : `local_${Math.random().toString(36).slice(2, 11)}`
      localStorage.setItem(`propfs_invoice_${id}`, JSON.stringify({
        ...isi, id, created_at: data?.created_at ?? mulai.toISOString(),
      }))
      if (error) console.warn('[Invoice] gagal disimpan di server:', error.message)

      if (!batal) navigate(`/payment/${id}`, { replace: true })
    })().catch(() => { if (!batal) setMenerbitkan(false) })

    return () => { batal = true }
  }, [rencana?.plan, rencana?.bulan, profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Jaring pengaman: kalau profil tak kunjung siap atau Supabase menggantung,
  // jangan tinggalkan pemakainya menatap pemutar yang berputar selamanya —
  // antarkan saja ke berandanya. Tagihannya masih bisa diterbitkan dari
  // halaman Paket.
  useEffect(() => {
    if (!menerbitkan) return
    const t = setTimeout(() => setMenerbitkan(false), 12000)
    return () => clearTimeout(t)
  }, [menerbitkan])

  if (menerbitkan) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 mx-auto border-4 border-gold border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Menyiapkan tagihan langganan…</p>
        </div>
      </div>
    )
  }

  return <Navigate to={beranda} replace state={location.state} />
}
