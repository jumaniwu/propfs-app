import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { 
  ArrowRight, 
  CheckCircle2, 
  ChevronRight,
  Calculator,
  BarChart,
  TrendingUp,
  FileText,
  Sparkles,
  Users,
  Building2,
  Mail,
  Phone,
  MapPin
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'

const ICON_MAP: Record<string, any> = {
  Calculator,
  BarChart,
  TrendingUp,
  FileText,
  Sparkles,
  Users,
  Building2
}

export default function LandingPage() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const { landingContent, user } = useAuthStore()
  const { branding, hero, suitableFor, features, auxiliaryProducts, marketingHighlight } = landingContent

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  function scrollToSection(id: string) {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-gold/30 overflow-x-hidden">
      {/* ── Navbar ── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-navy/95 backdrop-blur-md border-b border-white/10 shadow-lg' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.siteName} className="h-10 w-auto" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gold flex items-center justify-center shadow-lg shadow-gold/20">
                <span className="text-navy font-serif font-bold text-xl">P</span>
              </div>
            )}
            <div className="flex flex-col">
              <span className={`font-serif font-bold text-xl leading-none ${scrolled ? 'text-white' : 'text-navy dark:text-gold'}`}>
                {branding.siteName}
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-gold mt-1">
                {branding.tagline}
              </span>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-10 text-sm font-bold uppercase tracking-widest text-white/70">
            <button onClick={() => scrollToSection('features')} className="hover:text-gold transition-colors">Modul</button>
            <button onClick={() => scrollToSection('pricing')} className="hover:text-gold transition-colors">Harga</button>
            <button onClick={() => scrollToSection('contact')} className="hover:text-gold transition-colors">Kontak</button>
          </nav>

          <div className="flex items-center gap-4">
            {user ? (
              <Button variant="gold" onClick={() => navigate('/home')} className="shadow-xl shadow-gold/20 font-bold px-8">
                Buka Portal Anda
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/auth')} className="hidden sm:flex text-white hover:bg-white/10">
                  Masuk
                </Button>
                <Button variant="gold" onClick={() => navigate('/auth')} className="shadow-xl shadow-gold/20 font-bold px-8">
                  Coba Gratis
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── HERO SECTION (ERP360 style: Navy/Dark Gradient) ── */}
        <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-40 bg-navy overflow-hidden">
          {/* Background Decorative Rings */}
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gold/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gold/5 rounded-full translate-y-1/3 -translate-x-1/4 blur-3xl pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid lg:grid-cols-2 gap-16 items-center text-left">
              <div className="space-y-8">
                <div className="flex flex-wrap gap-2">
                  {(hero.hashtags || []).map(tag => (
                    <span key={tag} className="px-3 py-1 rounded-full bg-white/10 text-gold text-[10px] font-black uppercase tracking-widest">
                      {tag}
                    </span>
                  ))}
                </div>
                <h1 className="font-serif text-4xl md:text-6xl lg:text-7xl font-bold leading-tight text-white">
                  {hero.title.split(' ').map((word, i) => 
                    word.toLowerCase() === 'properti' ? <span key={i} className="text-gold italic block"> {word} </span> : word + ' '
                  )}
                </h1>
                <p className="max-w-xl text-lg md:text-xl text-white/70 leading-relaxed font-medium">
                  {hero.subtitle}
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
                  {user ? (
                    <Button variant="gold" size="lg" className="w-full sm:w-auto h-16 px-10 text-lg font-bold gap-3 shadow-2xl shadow-gold/30 hover:scale-105 transition-transform" onClick={() => navigate('/home')}>
                      Buka Portal <ArrowRight className="h-5 w-5" />
                    </Button>
                  ) : (
                    <Button variant="gold" size="lg" className="w-full sm:w-auto h-16 px-10 text-lg font-bold gap-3 shadow-2xl shadow-gold/30 hover:scale-105 transition-transform" onClick={() => navigate('/auth')}>
                      Mulai Sekarang <ArrowRight className="h-5 w-5" />
                    </Button>
                  )}
                  <Button variant="outline" size="lg" className="w-full sm:w-auto h-16 px-10 border-white/20 text-white bg-transparent hover:bg-white/10 backdrop-blur-sm" onClick={() => scrollToSection('features')}>
                    Lihat Modul
                  </Button>
                </div>
              </div>

              <div className="relative group">
                <div className="absolute inset-0 bg-gold/20 rounded-[40px] blur-2xl group-hover:scale-110 transition-transform duration-700" />
                <div className="relative rounded-[40px] border border-white/10 bg-navy/40 backdrop-blur p-4 shadow-2xl overflow-hidden aspect-[4/3]">
                  {hero.imageUrl ? (
                    <img src={hero.imageUrl} alt="PropFS Dashboard" className="w-full h-full object-cover rounded-[24px]" />
                  ) : (
                    <div className="w-full h-full bg-navy/60 flex items-center justify-center italic text-white/30">Dashboard Preview</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── SUITABLE FOR (ERP360 style: Gold Ribbon) ── */}
        <section className="bg-gold py-6 relative z-20 shadow-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-center gap-6">
            <span className="text-navy font-black tracking-tighter text-xl italic">{suitableFor.label}</span>
            <div className="h-px w-12 bg-navy/20 hidden md:block" />
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
              {(suitableFor?.tags || []).map(tag => (
                <div key={tag} className="flex items-center gap-2 group">
                  <CheckCircle2 className="h-5 w-5 text-navy group-hover:scale-125 transition-transform" />
                  <span className="text-navy font-bold">{tag}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEATURES GRID ── */}
        <section id="features" className="py-32 bg-background relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-20 space-y-4">
              <h2 className="text-gold font-black uppercase tracking-[0.3em] text-xs">MENGAPA PROPFS?</h2>
              <h3 className="font-serif text-4xl md:text-5xl font-bold">Solusi All-in-One Analisa Properti</h3>
              <p className="text-muted-foreground text-lg">Dari studi kelayakan hingga kontrol realisasi di lapangan, semua dalam satu platform terstandarisasi.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {(features || []).map((ft) => {
                const Icon = ICON_MAP[ft.iconName] || Calculator
                return (
                  <div key={ft.id} className="group p-8 rounded-[32px] bg-card border border-border hover:border-gold/50 transition-all hover:shadow-2xl hover:shadow-gold/5 hover:-translate-y-2">
                    <div className="w-16 h-16 rounded-[20px] bg-gold/5 flex items-center justify-center mb-8 group-hover:bg-gold group-hover:rotate-6 transition-all duration-500">
                      <Icon className="h-8 w-8 text-gold group-hover:text-navy transition-colors" />
                    </div>
                    <h3 className="text-xl font-bold mb-4">{ft.title}</h3>
                    <p className="text-muted-foreground leading-relaxed text-sm">
                      {ft.desc}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Auxiliary / Add-on Products (Horizontal Cards) */}
            <div className="mt-16 grid md:grid-cols-2 gap-8">
              {(auxiliaryProducts || []).map(prod => {
                const Icon = ICON_MAP[prod.iconName] || Sparkles
                return (
                  <div key={prod.id} className="flex flex-col sm:flex-row items-center gap-6 p-8 rounded-[32px] bg-navy text-white hover:shadow-2xl hover:shadow-navy/20 transition-all border border-white/5 group">
                    <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center group-hover:bg-gold transition-colors duration-500 shrink-0">
                      <Icon className="h-10 w-10 text-gold group-hover:text-navy transition-colors" />
                    </div>
                    <div>
                      <h4 className="text-2xl font-bold mb-2 text-gold">{prod.title}</h4>
                      <p className="text-white/60 leading-relaxed text-sm">{prod.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── MARKETING HIGHLIGHT ── */}
        <section className="py-24 bg-card border-y border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row items-center gap-20">
              <div className="lg:w-1/2 relative">
                <div className="absolute -inset-4 bg-gold/20 rounded-[40px] blur-3xl opacity-50" />
                <div className="relative rounded-[40px] overflow-hidden shadow-2xl border border-border aspect-[16/10]">
                  <img 
                    src={marketingHighlight.imageUrl} 
                    alt="Marketing" 
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="lg:w-1/2 space-y-8">
                <h2 className="font-serif text-4xl lg:text-6xl font-black leading-tight">
                  {marketingHighlight.title}
                </h2>
                <p className="text-xl text-muted-foreground leading-relaxed">
                  {marketingHighlight.desc}
                </p>
                <Button size="lg" variant="gold" className="h-14 px-8 font-bold gap-2" onClick={() => navigate('/auth')}>
                  Pelajari Lebih Lanjut <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ── PRICING & CONTACT ── */}
        <section id="pricing" className="py-32 bg-navy text-white">
          <div className="max-w-7xl mx-auto px-4">
            <div className="text-center mb-16 space-y-4">
              <p className="text-gold font-black uppercase tracking-[0.3em] text-xs">PAKET BERLANGGANAN</p>
              <h2 className="font-serif text-4xl md:text-5xl font-bold">Pilih Paket yang Sesuai</h2>
              <p className="text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
                Mulai gratis, upgrade kapan saja. Semua paket berbayar sudah mencakup fitur Cost Control & AI.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">

              {/* ── FREE ── */}
              <div className="bg-white/5 border border-white/10 rounded-[28px] p-8 flex flex-col">
                <div className="mb-8">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">GRATIS</p>
                  <h3 className="text-2xl font-black mb-1">Free Trial</h3>
                  <div className="flex items-end gap-1 mt-4">
                    <span className="text-4xl font-black text-gold">Rp 0</span>
                    <span className="text-white/40 text-sm pb-1">/bulan</span>
                  </div>
                  <p className="text-white/40 text-xs mt-2">Untuk coba platform tanpa kartu kredit</p>
                </div>

                {/* Fitur tersedia */}
                <ul className="space-y-3 mb-6 flex-1">
                  {[
                    '✅ 2 proyek Feasibility Study',
                    '✅ Kalkulator NPV, IRR, ROI dasar',
                    '✅ Ekspor ringkasan (teks)',
                    '✅ 1 user saja',
                  ].map(f => <li key={f} className="text-sm text-white/70 flex gap-2">{f}</li>)}
                </ul>

                {/* Fitur TIDAK tersedia */}
                <ul className="space-y-2 mb-8 border-t border-white/10 pt-4">
                  {[
                    '🚫 Cost Control & RAB',
                    '🚫 AI Chat Realisasi Biaya',
                    '🚫 Material Schedule AI',
                    '🚫 Kurva S Otomatis',
                    '🚫 Upload & parsing RAB Excel',
                    '🚫 Ekspor laporan Excel/PDF',
                    '🚫 Multi-user / tim',
                  ].map(f => <li key={f} className="text-xs text-white/30 flex gap-2">{f}</li>)}
                </ul>

                <Button className="w-full bg-white/10 text-white border border-white/30 hover:bg-white hover:text-navy font-bold mt-auto" onClick={() => navigate('/auth')}>
                  Daftar Gratis
                </Button>
              </div>

              {/* ── STARTER ── */}
              <div className="bg-white/5 border border-white/20 rounded-[28px] p-8 flex flex-col">
                <div className="mb-8">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">PEMULA</p>
                  <h3 className="text-2xl font-black mb-1">Starter</h3>
                  <div className="flex items-end gap-1 mt-4">
                    <span className="text-4xl font-black text-gold">Rp 149K</span>
                    <span className="text-white/40 text-sm pb-1">/bulan</span>
                  </div>
                  <p className="text-white/40 text-xs mt-2">Cocok untuk kontraktor kecil & mandiri</p>
                </div>

                <ul className="space-y-3 mb-6 flex-1">
                  {[
                    '✅ 5 proyek Feasibility Study',
                    '✅ Cost Control & RAB (1 proyek)',
                    '✅ Upload RAB Excel (AI parsing)',
                    '✅ Material Schedule otomatis',
                    '✅ Kurva S progress proyek',
                    '✅ Ekspor laporan Excel',
                    '✅ AI Chat Realisasi (50 pesan/bln)',
                    '✅ 1 user',
                  ].map(f => <li key={f} className="text-sm text-white/70 flex gap-2">{f}</li>)}
                </ul>

                <ul className="space-y-2 mb-8 border-t border-white/10 pt-4">
                  {[
                    '🚫 Multi-user / tim',
                    '🚫 Ekspor PDF branded',
                    '🚫 Prioritas support',
                  ].map(f => <li key={f} className="text-xs text-white/30 flex gap-2">{f}</li>)}
                </ul>

                <Button className="w-full bg-white/10 text-white border border-white/30 hover:bg-white hover:text-navy font-bold mt-auto" onClick={() => navigate('/auth?plan=starter')}>
                  Pilih Starter
                </Button>
              </div>

              {/* ── PRO (Recommended) ── */}
              <div className="bg-gold rounded-[28px] p-8 flex flex-col text-navy relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-150 transition-transform duration-700 pointer-events-none">
                  <Sparkles className="h-28 w-28" />
                </div>
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-navy/50">POPULER</p>
                    <span className="bg-navy text-gold text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">Rekomendasi</span>
                  </div>
                  <h3 className="text-2xl font-black mb-1">Pro</h3>
                  <div className="flex items-end gap-1 mt-4">
                    <span className="text-4xl font-black">Rp 399K</span>
                    <span className="text-navy/50 text-sm pb-1">/bulan</span>
                  </div>
                  <p className="text-navy/60 text-xs mt-2">Untuk kontraktor & developer aktif</p>
                </div>

                <ul className="space-y-3 mb-6 flex-1">
                  {[
                    '✅ Proyek Feasibility Study tak terbatas',
                    '✅ Cost Control & RAB tak terbatas',
                    '✅ AI Chat Realisasi tanpa batas',
                    '✅ Upload RAB + validasi AI otomatis',
                    '✅ Material Schedule + Kurva S',
                    '✅ Laporan Excel & PDF branded',
                    '✅ Realisasi Biaya (Material + Upah)',
                    '✅ Up to 3 user / tim',
                    '✅ Prioritas support via WA',
                  ].map(f => <li key={f} className="text-sm text-navy/80 flex gap-2 font-medium">{f}</li>)}
                </ul>

                <ul className="space-y-2 mb-8 border-t border-navy/10 pt-4">
                  {[
                    '🚫 White-label / custom branding',
                    '🚫 API akses langsung',
                  ].map(f => <li key={f} className="text-xs text-navy/40 flex gap-2">{f}</li>)}
                </ul>

                <Button className="w-full bg-navy text-gold hover:bg-navy/90 h-12 text-base font-black mt-auto" onClick={() => navigate('/auth?plan=pro')}>
                  Berlangganan Sekarang
                </Button>
              </div>

              {/* ── ENTERPRISE ── */}
              <div className="bg-white/5 border border-gold/20 rounded-[28px] p-8 flex flex-col">
                <div className="mb-8">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gold/60 mb-2">KORPORAT</p>
                  <h3 className="text-2xl font-black mb-1">Enterprise</h3>
                  <div className="flex items-end gap-1 mt-4">
                    <span className="text-4xl font-black text-gold">Rp 999K</span>
                    <span className="text-white/40 text-sm pb-1">/bulan</span>
                  </div>
                  <p className="text-white/40 text-xs mt-2">Untuk developer besar & management proyek</p>
                </div>

                <ul className="space-y-3 mb-6 flex-1">
                  {[
                    '✅ Semua fitur Pro',
                    '✅ AI penggunaan prioritas (no limit)',
                    '✅ User tak terbatas',
                    '✅ White-label PDF branded perusahaan',
                    '✅ Akses API langsung (integrasi ERP)',
                    '✅ Dashboard admin & log audit',
                    '✅ Onboarding & training tim',
                    '✅ Dedicated support 24 jam',
                    '✅ SLA uptime 99.9%',
                  ].map(f => <li key={f} className="text-sm text-white/70 flex gap-2">{f}</li>)}
                </ul>

                <div className="mb-8 border-t border-white/10 pt-4">
                  <p className="text-xs text-white/40">Harga dapat disesuaikan dengan kebutuhan organisasi</p>
                </div>

                <Button className="w-full bg-gold text-navy hover:bg-gold/90 h-12 text-base font-black mt-auto" onClick={() => window.location.href = 'mailto:hello@propfs.id'}>
                  Hubungi Sales
                </Button>
              </div>

            </div>

            {/* Comparison note */}
            <div className="text-center space-y-1 mt-10">
              <p className="text-white/40 text-xs">
                ✳️ Semua harga di atas <strong className="text-white/60">belum termasuk PPN</strong> sesuai peraturan perpajakan yang berlaku.
              </p>
              <p className="text-white/30 text-xs">
                🎁 Hemat <strong className="text-white/50">10%</strong> untuk paket 3 bulan &amp;{' '}
                <strong className="text-white/50">20%</strong> untuk paket 12 bulan — tersedia di halaman berlangganan.
              </p>
              <p className="text-white/30 text-xs">
                Pembayaran via QRIS, Transfer Bank BCA/Mandiri/BNI, GoPay, OVO, Kartu Kredit.
              </p>
            </div>
          </div>
        </section>


        <section id="contact" className="py-24 bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-3 gap-16">
            <div className="lg:col-span-1 space-y-8">
              <h2 className="font-serif text-4xl font-bold">Hubungi Tim Kami</h2>
              <p className="text-muted-foreground leading-relaxed font-medium">Tim konsultan kami siap membantu integrasi PropFS ke dalam proses operasional developer Anda.</p>
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-navy dark:text-gold font-bold">
                  <Mail className="h-5 w-5" /> hello@propfs.id
                </div>
                <div className="flex items-center gap-4 text-navy dark:text-gold font-bold">
                  <Phone className="h-5 w-5" /> +62 811 0000 000
                </div>
                <div className="flex items-center gap-4 text-navy dark:text-gold font-bold">
                  <MapPin className="h-5 w-5" /> Batam Centre, Kepulauan Riau
                </div>
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Nama Lengkap</label>
                  <input className="w-full bg-muted border-none rounded-2xl p-4 focus:ring-2 focus:ring-gold" placeholder="Masukkan nama..." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Email</label>
                  <input className="w-full bg-muted border-none rounded-2xl p-4 focus:ring-2 focus:ring-gold" placeholder="email@perusahaan.com" />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Pesan Anda</label>
                  <textarea rows={4} className="w-full bg-muted border-none rounded-2xl p-4 focus:ring-2 focus:ring-gold" placeholder="Tuliskan pertanyaan atau kebutuhan Anda..." />
                </div>
                <Button variant="gold" className="sm:col-span-2 h-16 font-bold text-lg shadow-xl shadow-gold/20">Kirim Pesan Sekarang</Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-navy py-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3">
             {branding.logoUrl ? (
                <img src={branding.logoUrl} alt={branding.siteName} className="h-8 w-auto" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gold flex items-center justify-center">
                  <span className="text-navy font-serif font-bold text-lg">P</span>
                </div>
              )}
              <span className="text-white font-serif font-bold text-lg">{branding.siteName}</span>
          </div>
          <p className="text-white/40 text-sm font-medium">© {new Date().getFullYear()} PT. Mettaland Batam Sukses. All rights reserved.</p>
          <div className="flex gap-8 text-xs font-bold uppercase tracking-widest text-white/40">
            <Link to="/legal/privacy" className="hover:text-gold transition-colors">Privacy</Link>
            <Link to="/legal/terms" className="hover:text-gold transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
