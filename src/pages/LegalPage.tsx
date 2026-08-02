import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, FileText, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { useRutaMasuk } from '@/hooks/useRutaMasuk'

export default function LegalPage() {
  const { type } = useParams()
  const navigate = useNavigate()
  const beranda = useRutaMasuk()
  const { user } = useAuthStore()

  const isPrivacy = type === 'privacy'

  // FIX UTAMA: navigate(-1) kembali ke halaman sebelumnya apapun itu
  // Fallback: jika tidak ada history, ke beranda (login) atau / (belum login)
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate(user ? beranda : '/')
    }
  }

  return (
    <div className="min-h-screen bg-muted/20 pb-20">

      {/* Topbar */}
      <div className="bg-white border-b border-border py-4 px-6 fixed top-0 w-full z-10">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Button variant="ghost" size="sm" className="gap-2" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4" /> Kembali
          </Button>
          <div className="font-serif font-bold text-lg text-navy">PropFS Legal</div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-navy pt-24 pb-10 px-6">
        <div className="max-w-3xl mx-auto text-center">
          {isPrivacy
            ? <ShieldCheck className="w-12 h-12 text-gold mb-4 mx-auto" />
            : <FileText className="w-12 h-12 text-gold mb-4 mx-auto" />
          }
          <h1 className="text-3xl font-serif font-bold text-white mb-2">
            {isPrivacy ? 'Kebijakan Privasi' : 'Syarat & Ketentuan'}
          </h1>
          <p className="text-gold/70 text-sm italic mb-6">
            Terakhir diperbarui: 27 April 2026
          </p>

          {/* Tab switcher */}
          <div className="inline-flex bg-white/10 rounded-full p-1 gap-1">
            <button
              onClick={() => navigate('/legal/terms')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                !isPrivacy
                  ? 'bg-gold text-navy font-bold'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Syarat & Ketentuan
            </button>
            <button
              onClick={() => navigate('/legal/privacy')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                isPrivacy
                  ? 'bg-gold text-navy font-bold'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Kebijakan Privasi
            </button>
          </div>
        </div>
      </div>

      {/* Konten */}
      <main className="max-w-3xl mx-auto px-6 pt-8">

        {/* Banner */}
        <div className={`flex items-start gap-3 p-4 mb-6 border-l-4 ${
          isPrivacy
            ? 'bg-blue-50 border-blue-500'
            : 'bg-amber-50 border-amber-500'
        }`}>
          <p className={`text-sm leading-relaxed ${isPrivacy ? 'text-blue-800' : 'text-amber-800'}`}>
            {isPrivacy
              ? '🔒 Data Anda aman. Kami tidak menjual informasi pribadi Anda kepada pihak ketiga manapun.'
              : '📋 Dengan menggunakan PropFS, Anda menyetujui ketentuan berikut ini.'
            }
          </p>
        </div>

        {/* Section konten — sama persis dengan konten di LegalModal */}
        <div className="space-y-0">
          {(isPrivacy ? (
            // Section Kebijakan Privasi
            [
              { num: '1', title: 'Pengumpulan Data', body: 'Kami mengumpulkan informasi yang Anda berikan langsung kepada kami saat Anda mendaftar, membuat proyek, atau menggunakan fitur AI kami (seperti mengunggah file RAB). Ini mencakup informasi profil dan metrik finansial proyek yang diinput.' },
              { num: '2', title: 'Penggunaan Data dan AI', body: 'Data anggaran dan proyek yang diunggah dapat diproses menggunakan layanan Artificial Intelligence (AI) pihak ketiga (seperti OpenAI/Google Gemini) semata-mata untuk tujuan melakukan ekstraksi data (parsing RAB), automasi jadwal, dan optimisasi harga. Data ini tidak digunakan untuk melatih model AI publik.' },
              { num: '3', title: 'Keamanan Data', body: 'Kami menggunakan enkripsi dan basis data yang aman (Supabase) untuk melindungi integritas informasi finansial Anda. Namun, tidak ada transmisi internet yang 100% aman.' },
              { num: '4', title: 'Berbagi Informasi', body: 'Kami tidak menjual, menyewakan, atau memperdagangkan informasi identifikasi pribadi pengguna kepada pihak lain. Kami mungkin membagikan informasi demografis agregat rahasia yang tidak tertaut dengan pengenal pribadi apapun kepada mitra bisnis kami.' },
            ]
          ) : (
            // Section Syarat & Ketentuan
            [
              { num: '1', title: 'Penerimaan Syarat', body: 'Dengan mengakses platform PropFS, Anda menerima dan setuju untuk terikat oleh Ketentuan Layanan ini. Jika Anda tidak setuju untuk mematuhi Ketentuan ini, Anda disarankan untuk tidak menggunakan layanan kami.' },
              { num: '2', title: 'Penggunaan Layanan dan AI', body: 'Layanan PropFS mencakup kalkulasi finansial properti dan parsing data dibantu AI. Anda menyadari bahwa hasil perhitungan, optimisasi AI, dan estimasi waktu hanyalah alat bantu prediksi (estimasi). Perusahaan Anda memikul semua risiko terkait keputusan bisnis aktual yang didasarkan pada perhitungan dari PropFS.' },
              { num: '3', title: 'Akun dan Keamanan', body: 'Anda bertanggung jawab untuk menjaga kerahasiaan kata sandi Anda dan bertanggung jawab penuh atas semua aktivitas yang terjadi di bawah akun Anda.' },
              { num: '4', title: 'Langganan dan Tagihan', body: 'Beberapa fitur mungkin dibatasi oleh paywall (paket Basic/Pro). Kewajiban pembayaran harus diselesaikan tepat waktu agar Anda tetap bisa mengakses fitur premium tersebut.' },
              { num: '5', title: 'Kewajiban Pengguna', body: 'Anda tidak boleh menggunakan situs ini atau layanannya untuk mendistribusikan virus, spam, serangan keamanan, atau aktivitas ilegal yang bertentangan dengan hukum Republik Indonesia dan yurisdiksi internasional.' },
            ]
          )).map((section, i, arr) => (
            <div
              key={section.num}
              className={`bg-white px-8 py-6 ${i === 0 ? 'rounded-t-2xl' : ''} ${i === arr.length - 1 ? 'rounded-b-2xl' : ''} border border-border ${i > 0 ? 'border-t-0' : ''}`}
            >
              <div className="flex items-start gap-4">
                <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-amber-700">{section.num}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-navy text-base mb-2">{section.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{section.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="text-xs text-muted-foreground">© 2026 PropFS. Semua hak dilindungi.</p>
          <p className="text-xs text-muted-foreground">Pertanyaan? support@propfs.id</p>
        </div>
      </main>
    </div>
  )
}
