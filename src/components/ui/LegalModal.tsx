import { useEffect } from 'react'
import { X, ShieldCheck, FileText } from 'lucide-react'

interface LegalModalProps {
  type: 'privacy' | 'terms'
  isOpen: boolean
  onClose: () => void
}

export function LegalModal({ type, isOpen, onClose }: LegalModalProps) {
  const isPrivacy = type === 'privacy'

  // Tutup modal saat tekan Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // Kunci scroll body saat modal terbuka
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            {isPrivacy
              ? <ShieldCheck className="w-5 h-5 text-navy" />
              : <FileText className="w-5 h-5 text-navy" />
            }
            <div>
              <h2 className="font-serif font-bold text-navy text-lg leading-none">
                {isPrivacy ? 'Kebijakan Privasi' : 'Syarat & Ketentuan'}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Terakhir diperbarui: 27 April 2026
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
            aria-label="Tutup"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Konten — scrollable */}
        <div className="overflow-y-auto flex-1 px-6 py-5 prose prose-sm prose-slate max-w-none">

          {/* Banner info */}
          <div className={`flex items-start gap-3 p-3 rounded-lg mb-6 not-prose ${
            isPrivacy
              ? 'bg-blue-50 border-l-4 border-blue-500'
              : 'bg-amber-50 border-l-4 border-amber-500'
          }`}>
            {isPrivacy
              ? <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              : <FileText className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            }
            <p className={`text-xs leading-relaxed ${isPrivacy ? 'text-blue-800' : 'text-amber-800'}`}>
              {isPrivacy
                ? 'Data Anda aman. Kami tidak menjual informasi pribadi Anda kepada pihak ketiga manapun.'
                : 'Dengan menggunakan PropFS, Anda menyetujui ketentuan berikut ini.'
              }
            </p>
          </div>

          {isPrivacy ? (
            <>
              <h3>1. Pengumpulan Data</h3>
              <p>Kami mengumpulkan informasi yang Anda berikan langsung kepada kami saat Anda mendaftar, membuat proyek, atau menggunakan fitur AI kami (seperti mengunggah file RAB). Ini mencakup informasi profil dan metrik finansial proyek yang diinput.</p>
              <h3>2. Penggunaan Data dan AI</h3>
              <p>Data anggaran dan proyek yang diunggah dapat diproses menggunakan layanan Artificial Intelligence (AI) pihak ketiga (seperti OpenAI/Google Gemini) semata-mata untuk tujuan melakukan ekstraksi data (parsing RAB), automasi jadwal, dan optimisasi harga. Data ini tidak digunakan untuk melatih model AI publik.</p>
              <h3>3. Keamanan Data</h3>
              <p>Kami menggunakan enkripsi dan basis data yang aman (Supabase) untuk melindungi integritas informasi finansial Anda. Namun, tidak ada transmisi internet yang 100% aman.</p>
              <h3>4. Berbagi Informasi</h3>
              <p>Kami tidak menjual, menyewakan, atau memperdagangkan informasi identifikasi pribadi pengguna kepada pihak lain. Kami mungkin membagikan informasi demografis agregat rahasia yang tidak tertaut dengan pengenal pribadi apapun kepada mitra bisnis kami.</p>
            </>
          ) : (
            <>
              <h3>1. Penerimaan Syarat</h3>
              <p>Dengan mengakses platform PropFS, Anda menerima dan setuju untuk terikat oleh Ketentuan Layanan ini. Jika Anda tidak setuju untuk mematuhi Ketentuan ini, Anda disarankan untuk tidak menggunakan layanan kami.</p>
              <h3>2. Penggunaan Layanan dan AI</h3>
              <p>Layanan PropFS mencakup kalkulasi finansial properti dan parsing data dibantu AI. Anda menyadari bahwa hasil perhitungan, optimisasi AI, dan estimasi waktu hanyalah alat bantu prediksi (estimasi). Perusahaan Anda memikul semua risiko terkait keputusan bisnis aktual yang didasarkan pada perhitungan dari PropFS.</p>
              <h3>3. Akun dan Keamanan</h3>
              <p>Anda bertanggung jawab untuk menjaga kerahasiaan kata sandi Anda dan bertanggung jawab penuh atas semua aktivitas yang terjadi di bawah akun Anda.</p>
              <h3>4. Langganan dan Tagihan</h3>
              <p>Beberapa fitur mungkin dibatasi oleh paywall (paket Basic/Pro). Kewajiban pembayaran harus diselesaikan tepat waktu agar Anda tetap bisa mengakses fitur premium tersebut.</p>
              <h3>5. Kewajiban Pengguna</h3>
              <p>Anda tidak boleh menggunakan situs ini atau layanannya untuk mendistribusikan virus, spam, serangan keamanan, atau aktivitas ilegal yang bertentangan dengan hukum Republik Indonesia dan yurisdiksi internasional.</p>
            </>
          )}
        </div>

        {/* Footer modal */}
        <div className="px-6 py-4 border-t border-border flex-shrink-0 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">propfs.id · © 2026</p>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy/90 transition-colors"
          >
            Saya Mengerti, Tutup
          </button>
        </div>
      </div>
    </div>
  )
}
