// PropFS — Welcome Onboarding Modal for New Users

import { Building2, Calculator, FileText, ArrowRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  userName: string
  onClose: () => void
}

const STEPS = [
  {
    icon: Building2,
    title: 'Buat Proyek Baru',
    desc: 'Klik tombol "+ Proyek Baru" di dashboard untuk memulai analisis.',
  },
  {
    icon: Calculator,
    title: 'Isi Data Proyek',
    desc: 'Masukkan data lahan, estimasi biaya bangunan, dan target harga jual.',
  },
  {
    icon: FileText,
    title: 'Dapatkan Laporan FS',
    desc: 'NPV, IRR, cashflow, dan analisis sensitivitas otomatis tersedia instan.',
  },
]

export default function WelcomeModal({ userName, onClose }: Props) {
  const firstName = userName?.split(' ')[0] || 'Pengguna'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-navy/85 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-[32px] p-8 sm:p-10 w-full max-w-lg shadow-2xl space-y-8 animate-in fade-in zoom-in-95 duration-500">

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-slate-300 hover:text-navy transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="space-y-2">
          <div className="text-4xl">🎉</div>
          <h2 className="font-serif text-3xl font-black text-navy leading-tight">
            Selamat Datang,<br />
            <span className="text-gold">{firstName}!</span>
          </h2>
          <p className="text-slate-500 font-medium">
            Akun Anda sudah aktif. Ikuti 3 langkah ini untuk
            membuat proyek Feasibility Study pertama Anda.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {STEPS.map((step, i) => {
            const Icon = step.icon
            return (
              <div
                key={i}
                className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100"
              >
                <div className="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-navy" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gold">
                      Langkah {i + 1}
                    </span>
                  </div>
                  <p className="font-black text-navy text-sm">{step.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <Button
            variant="gold"
            className="w-full h-14 rounded-2xl font-black text-base gap-2 shadow-xl shadow-gold/20"
            onClick={onClose}
          >
            Mulai Buat Proyek Pertama <ArrowRight className="h-5 w-5" />
          </Button>
          <button
            onClick={onClose}
            className="w-full text-xs font-bold text-slate-400 hover:text-navy transition-colors py-2"
          >
            Lewati, saya sudah tahu cara pakainya
          </button>
        </div>
      </div>
    </div>
  )
}
