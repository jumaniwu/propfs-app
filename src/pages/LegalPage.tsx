import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function LegalPage() {
  const { type } = useParams()
  
  const isPrivacy = type === 'privacy'
  const title = isPrivacy ? 'Kebijakan Privasi' : 'Syarat & Ketentuan'
  const icon = isPrivacy ? <ShieldCheck className="w-12 h-12 text-navy mb-4 mx-auto" /> : <FileText className="w-12 h-12 text-navy mb-4 mx-auto" />

  return (
    <div className="min-h-screen bg-muted/20 pb-20">
      <div className="bg-white border-b border-border py-4 px-6 fixed top-0 w-full z-10">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Kembali
            </Button>
          </Link>
          <div className="font-serif font-bold text-lg text-navy">PropFS Legal</div>
        </div>
      </div>
      
      <main className="max-w-3xl mx-auto px-6 pt-32">
        <div className="text-center mb-10">
          {icon}
          <h1 className="text-3xl font-serif font-bold text-navy">{title}</h1>
          <p className="text-muted-foreground mt-2">Terakhir diperbarui: 27 April 2026</p>
        </div>

        <div className="bg-white border border-border rounded-2xl p-8 md:p-12 shadow-sm prose prose-sm md:prose-base prose-slate max-w-none">
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
      </main>
    </div>
  )
}
