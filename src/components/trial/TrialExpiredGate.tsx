// Wrapper component — tampilkan konten jika trial aktif,
// tampilkan paywall jika expired

import { useNavigate } from 'react-router-dom'
import { Lock, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'

interface Props {
  children: React.ReactNode
  feature?: string  // nama fitur untuk pesan spesifik
}

export default function TrialExpiredGate({ children, feature }: Props) {
  const navigate = useNavigate()
  const { isTrialExpired, subscription } = useAuthStore()

  // Sudah subscribe → tampil normal
  if (subscription?.status === 'active') return <>{children}</>
  
  // Trial masih aktif → tampil normal
  if (!isTrialExpired()) return <>{children}</>

  // Trial expired → tampil paywall
  return (
    <div className="relative rounded-[28px] overflow-hidden">
      {/* Blur overlay */}
      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-navy/10 flex items-center justify-center">
          <Lock className="h-8 w-8 text-navy" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-black text-navy">
            Masa Trial Telah Berakhir
          </h3>
          <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
            {feature 
              ? `Fitur "${feature}" membutuhkan paket berbayar.`
              : 'Upgrade untuk melanjutkan akses ke semua fitur PropFS.'
            }
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button
            variant="gold"
            className="h-12 rounded-2xl font-black gap-2"
            onClick={() => navigate('/pricing')}
          >
            <Crown className="h-4 w-4" />
            Lihat Paket & Harga
          </Button>
          <p className="text-xs text-slate-400">
            Mulai dari Rp 149.000/bulan
          </p>
        </div>
      </div>
      {/* Konten asli di belakang blur */}
      <div className="pointer-events-none select-none opacity-30">
        {children}
      </div>
    </div>
  )
}
