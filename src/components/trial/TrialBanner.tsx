// PropFS — Trial Status Banner
// Tampil di semua halaman authenticated berdasarkan sisa hari

import { useNavigate } from 'react-router-dom'
import { Clock, AlertTriangle, XCircle, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'

export default function TrialBanner() {
  const navigate = useNavigate()
  const { getTrialInfo, subscription } = useAuthStore()
  
  // Jangan tampil jika sudah subscribe
  if (subscription?.status === 'active') return null
  
  const trial = getTrialInfo()
  
  // Jangan tampil jika free_forever
  if (trial.status === 'free_forever') return null

  // EXPIRED
  if (trial.isExpired || trial.status === 'trial_expired') {
    return (
      <div className="w-full bg-red-600 text-white px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <XCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-bold">
            Masa trial Anda telah berakhir. 
            Upgrade sekarang untuk tetap akses semua fitur.
          </p>
        </div>
        <Button
          size="sm"
          className="bg-white text-red-600 hover:bg-red-50 font-black shrink-0 h-8 px-4 rounded-xl"
          onClick={() => navigate('/pricing')}
        >
          Upgrade Sekarang
        </Button>
      </div>
    )
  }

  // H-3 atau kurang → merah/urgent
  if (trial.daysRemaining <= 3 && trial.daysRemaining >= 0) {
    return (
      <div className="w-full bg-red-500 text-white px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 animate-pulse" />
          <p className="text-sm font-bold">
            ⚠️ Trial berakhir dalam{' '}
            <strong>{trial.daysRemaining} hari</strong>!
            Upgrade sebelum kehilangan akses.
          </p>
        </div>
        <Button
          size="sm"
          className="bg-white text-red-600 hover:bg-red-50 font-black shrink-0 h-8 px-4 rounded-xl"
          onClick={() => navigate('/pricing')}
        >
          Upgrade →
        </Button>
      </div>
    )
  }

  // H-7 atau kurang → amber/warning
  if (trial.daysRemaining <= 7) {
    return (
      <div className="w-full bg-amber-500 text-white px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 shrink-0" />
          <p className="text-sm font-bold">
            Trial berakhir dalam{' '}
            <strong>{trial.daysRemaining} hari</strong>.
            Pilih paket sebelum akses terbatas.
          </p>
        </div>
        <Button
          size="sm"
          className="bg-white text-amber-600 hover:bg-amber-50 font-black shrink-0 h-8 px-4 rounded-xl"
          onClick={() => navigate('/pricing')}
        >
          Lihat Paket
        </Button>
      </div>
    )
  }

  // Normal trial aktif → navy/info ringan
  return (
    <div className="w-full bg-navy/90 text-white px-4 py-2.5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Crown className="h-4 w-4 shrink-0 text-gold" />
        <p className="text-xs font-bold text-white/80">
          Free Trial aktif —{' '}
          <span className="text-gold">{trial.daysRemaining} hari tersisa</span>
          {' '}· Nikmati semua fitur Starter gratis.
        </p>
      </div>
      <button
        className="text-xs font-black text-gold hover:underline shrink-0"
        onClick={() => navigate('/pricing')}
      >
        Lihat Paket →
      </button>
    </div>
  )
}
