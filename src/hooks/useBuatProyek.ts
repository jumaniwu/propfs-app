// ============================================================
// PropFS — Gerbang "Buat Proyek Baru"
//
// Sebelumnya, keputusan boleh-tidaknya menambah proyek (kuota paket, slot
// tambahan yang bisa dibeli, arahan upgrade) hanya ada di CostDashboard.
// Akibatnya kartu "Buat Proyek Baru" di Home hanya bisa melempar pengguna ke
// dashboard itu, lalu tombol yang sama harus ditekan sekali lagi.
//
// Aturannya dipindah ke sini supaya kedua tempat memakai keputusan yang sama
// persis — kalau disalin, cepat atau lambat keduanya akan berbeda jawaban.
// ============================================================
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useSubscription } from '@/hooks/useSubscription'
import { useCostStore } from '@/store/costStore'
import { useToast } from '@/hooks/use-toast'
import { buatInvoiceAddon } from '@/lib/invoice'

export interface GerbangBuatProyek {
  /** Kuota masih cukup untuk menambah satu proyek lagi. */
  bisaTambah: boolean
  /** Batas proyek menurut paket + slot tambahan yang sudah dibeli. */
  maksProyek: number
  jumlahProyek: number
  /**
   * Membuka dialog bila kuota cukup. Bila penuh, pengguna diarahkan sesuai
   * keadaan: membeli slot tambahan, upgrade paket, atau sekadar diberi tahu.
   */
  mulai: () => void
  terbuka: boolean
  tutup: () => void
}

export function useBuatProyek(): GerbangBuatProyek {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [terbuka, setTerbuka] = useState(false)

  const { savedProjects } = useCostStore()
  const { canCreateProject, isSubscriptionEnabled } = useSubscription()
  const { addonFeaturesEnabled, addonCostPrice, user, planCatalog } = useAuthStore()

  const bisaTambah = canCreateProject(savedProjects.length, 'cost')

  // Diambil dari getKuota, bukan dihitung ulang di sini: superadmin dan
  // kesepakatan khusus per pelanggan ikut terbawa, dan angkanya tidak akan
  // pernah berbeda dari yang dipakai canCreateProject.
  const kuota = useMemo(
    () => useAuthStore.getState().getKuota('cost'),
    [planCatalog, user], // eslint-disable-line react-hooks/exhaustive-deps
  )
  // Layar lama mengharapkan angka. Tak terbatas dijawab dengan jumlah proyek
  // yang ada + 1 supaya kalimat "x dari y" tetap masuk akal dan tidak pernah
  // terbaca sebagai "sudah penuh".
  const maksProyek = kuota.batas ?? savedProjects.length + 1

  const mulai = useCallback(() => {
    if (bisaTambah) { setTerbuka(true); return }

    if (!isSubscriptionEnabled) {
      toast({
        title: 'Batas proyek tercapai',
        description: 'Anda sudah mencapai batas proyek.',
        variant: 'destructive',
      })
      return
    }

    if (addonFeaturesEnabled) {
      toast({
        title: 'Batas proyek tercapai',
        description: `Anda bisa membeli slot tambahan Cost Control seharga Rp ${addonCostPrice.toLocaleString('id-ID')}, atau upgrade paket Anda.`,
        variant: 'destructive',
      })
      buatInvoiceAddon('addon_cost', addonCostPrice)
        .then(id => navigate(`/payment/${id}`))
        .catch(e => toast({
          title: 'Gagal memulai pembelian',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        }))
      return
    }

    toast({
      title: 'Batas proyek tercapai',
      description: 'Anda sudah mencapai batas maksimal proyek untuk paket ini. Silakan upgrade paket Anda.',
      variant: 'destructive',
    })
    navigate('/pricing')
  }, [bisaTambah, isSubscriptionEnabled, addonFeaturesEnabled, addonCostPrice, navigate, toast])

  return {
    bisaTambah,
    maksProyek,
    jumlahProyek: savedProjects.length,
    mulai,
    terbuka,
    tutup: useCallback(() => setTerbuka(false), []),
  }
}
