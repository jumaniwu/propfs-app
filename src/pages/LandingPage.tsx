import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { LegalModal } from '@/components/ui/LegalModal'
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
  MapPin,
  Loader2,
  Send,
  CheckCircle,
  ChevronDown
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'

const ICON_MAP: Record<string, any> = {
  Calculator,
  BarChart,
  TrendingUp,
  FileText,
  Sparkles,
  Users,
  Building2
}

const MASTER_FEATURES = [
  { key: 'fs_projects', label: 'Feasibility Study', suffix: 'proyek' },
  { key: 'cost_control', label: 'Cost Control & RAB' },
  { key: 'upload_rab', label: 'Upload & Parsing RAB Excel (AI)' },
  { key: 'material_schedule', label: 'Material Schedule Otomatis' },
  { key: 'kurva_s', label: 'Kurva S Progres Proyek' },
  { key: 'ai_chat', label: 'AI Chat Realisasi Biaya' },
  { key: 'export_excel', label: 'Ekspor Laporan Excel' },
  { key: 'export_pdf', label: 'Ekspor PDF Branded' },
  { key: 'multi_user', label: 'Multi-user / Tim', suffix: 'user' },
  { key: 'api_access', label: 'Akses API (Integrasi ERP)' },
  { key: 'whitelabel', label: 'White-label Reports' },
  { key: 'priority_support', label: 'Prioritas Support (WA/24jam)' },
  { key: 'onboarding', label: 'Onboarding & Training Tim' },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const { landingContent, user } = useAuthStore()
  const { branding, hero, suitableFor, features, auxiliaryProducts, marketingHighlight, footer } = landingContent

  // Contact form state
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactMsg, setContactMsg] = useState('')
  const [contactSending, setContactSending] = useState(false)
  const [contactSent, setContactSent] = useState(false)

  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null)

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!contactName.trim() || !contactEmail.trim() || !contactMsg.trim()) {
      toast({ title: 'Lengkapi semua field', variant: 'destructive' })
      return
    }
    setContactSending(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: contactName, email: contactEmail, message: contactMsg })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Gagal mengirim pesan.')
      setContactSent(true)
      setContactName('')
      setContactEmail('')
      setContactMsg('')
      toast({ title: '✅ Pesan Terkirim!', description: 'Tim kami akan menghubungi Anda segera.' })
    } catch (err: any) {
      toast({ title: 'Gagal Mengirim', description: err.message, variant: 'destructive' })
    } finally {
      setContactSending(false)
    }
  }

  // Load promo prices from DB
  const [catalogPlans, setCatalogPlans] = useState<any[]>([])
  useEffect(() => {
    async function loadCatalog() {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'plan_catalog')
          .maybeSingle()
        if (data?.value && Array.isArray(data.value) && data.value.length > 0) {
          setCatalogPlans(data.value)
        } else {
          // Fallback to default
          setCatalogPlans([
            { id: 'free', name: 'Free Trial', priceIdr: 0, promoPriceIdr: null, maxProjects: 2, isVisible: true, features: { fs_projects: 2, cost_control: false, upload_rab: false, material_schedule: false, kurva_s: false, ai_chat: false, export_excel: false, export_pdf: false, multi_user: 1, api_access: false, whitelabel: false, priority_support: false, onboarding: false } },
            { id: 'starter', name: 'Starter', priceIdr: 149000, promoPriceIdr: null, maxProjects: 5, isVisible: true, features: { fs_projects: 5, cost_control: true, upload_rab: true, material_schedule: true, kurva_s: true, ai_chat: true, export_excel: true, export_pdf: false, multi_user: 1, api_access: false, whitelabel: false, priority_support: false, onboarding: false } },
            { id: 'pro', name: 'Pro', priceIdr: 399000, promoPriceIdr: null, maxProjects: 50, recommended: true, isVisible: true, features: { fs_projects: 999, cost_control: true, upload_rab: true, material_schedule: true, kurva_s: true, ai_chat: true, export_excel: true, export_pdf: true, multi_user: 3, api_access: false, whitelabel: false, priority_support: true, onboarding: false } },
            { id: 'enterprise', name: 'Enterprise', priceIdr: 999000, promoPriceIdr: null, maxProjects: 999, isVisible: true, features: { fs_projects: 999, cost_control: true, upload_rab: true, material_schedule: true, kurva_s: true, ai_chat: true, export_excel: true, export_pdf: true, multi_user: 999, api_access: true, whitelabel: true, priority_support: true, onboarding: true } }
          ])
        }
      } catch { /* ignore */ }
    }
    loadCatalog()
  }, [])

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
              <span className={`font-serif font-bold text-xl leading-none text-white`}>
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

              {catalogPlans.filter(p => p.isVisible !== false).map(plan => {
                const isPro = plan.recommended
                const hasPromo = plan.promoPriceIdr !== null && plan.promoPriceIdr > 0 && plan.promoPriceIdr < plan.priceIdr
                const currentPrice = hasPromo ? plan.promoPriceIdr! : plan.priceIdr

                // Calculate which features to show
                const availableFeatures = MASTER_FEATURES.filter(f => plan.features[f.key])
                const unavailableFeatures = MASTER_FEATURES.filter(f => !plan.features[f.key])

                return (
                  <div key={plan.id} className={`group relative p-8 rounded-[28px] border transition-all duration-500 flex flex-col h-full
                    ${isPro ? 'bg-gold text-navy border-gold shadow-2xl' : 'bg-white/5 text-white border-white/20 hover:border-gold/30 shadow-sm'}
                  `}>
                    
                    {hasPromo && (
                      <div className="absolute -top-3 right-6 bg-red-500 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg z-20">
                        🔥 HEMAT {Math.round((1 - plan.promoPriceIdr! / plan.priceIdr) * 100)}%
                      </div>
                    )}

                    {isPro && (
                      <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-150 transition-transform duration-700 pointer-events-none">
                        <Sparkles className="h-28 w-28" />
                      </div>
                    )}

                    <div className="mb-8 relative z-10">
                      <div className="flex items-center justify-between mb-2">
                        <p className={`text-[10px] font-black uppercase tracking-widest ${isPro ? 'text-navy/50' : 'text-white/40'}`}>
                          {plan.id}
                        </p>
                        {isPro && (
                          <span className="bg-navy text-gold text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
                            Rekomendasi
                          </span>
                        )}
                      </div>
                      
                      <h3 className="text-2xl font-black mb-1">{plan.name}</h3>
                      
                      <div className="flex flex-col gap-1 mt-4">
                        {hasPromo && (
                          <span className={`text-sm line-through ${isPro ? 'text-navy/50' : 'text-white/40'}`}>
                            Rp {plan.priceIdr.toLocaleString('id-ID')}
                          </span>
                        )}
                        <div className="flex items-end gap-1">
                          <span className={`text-4xl font-black ${isPro ? 'text-navy' : 'text-gold'}`}>
                            Rp {currentPrice.toLocaleString('id-ID')}
                          </span>
                          <span className={`text-sm pb-1 ${isPro ? 'text-navy/50' : 'text-white/40'}`}>/bulan</span>
                        </div>
                      </div>
                    </div>

                    {/* Features List */}
                    <ul className="space-y-3 mb-6 flex-1 relative z-10">
                      {availableFeatures.map(f => {
                        const val = plan.features[f.key]
                        let text = f.label
                        if (typeof val === 'number') {
                          text = `${val === 999 ? 'Tak terbatas' : val} ${f.label}`
                        }
                        return (
                          <li key={f.key} className={`text-sm flex gap-2 font-medium ${isPro ? 'text-navy/80' : 'text-white/70'}`}>
                            ✅ {text}
                          </li>
                        )
                      })}
                    </ul>

                    {/* Unavailable Features */}
                    {unavailableFeatures.length > 0 && (
                      <ul className={`space-y-2 mb-8 border-t pt-4 relative z-10 ${isPro ? 'border-navy/10' : 'border-white/10'}`}>
                        {unavailableFeatures.map(f => (
                          <li key={f.key} className={`text-xs flex gap-2 ${isPro ? 'text-navy/40' : 'text-white/30'}`}>
                            🚫 {f.label}
                          </li>
                        ))}
                      </ul>
                    )}

                    <Button 
                      className={`w-full h-12 text-base font-black mt-auto relative z-10 transition-colors
                        ${isPro ? 'bg-navy text-gold hover:bg-navy/90' : 'bg-white/10 text-white border border-white/30 hover:bg-white hover:text-navy'}
                      `}
                      onClick={() => navigate(plan.priceIdr === 0 ? '/auth' : `/auth?plan=${plan.id}`)}
                    >
                      {plan.priceIdr === 0 ? 'Daftar Gratis' : 'Pilih ' + plan.name}
                    </Button>
                  </div>
                )
              })}

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

        {/* ── FAQ Section ── */}
        {(landingContent.faq?.items?.length ?? 0) > 0 && (
          <section className="py-24 bg-cream/30">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">

              {/* Header */}
              <div className="text-center mb-14">
                <h2 className="font-serif text-3xl sm:text-4xl font-bold text-navy mb-4">
                  {landingContent.faq?.title || 'Pertanyaan yang Sering Ditanyakan'}
                </h2>
                <p className="text-slate-500 text-base">
                  {landingContent.faq?.subtitle || ''}
                </p>
              </div>

              {/* FAQ Accordion Items */}
              <div className="space-y-3">
                {landingContent.faq!.items.map((item, idx) => (
                  <FAQItem key={item.id} item={item} idx={idx} />
                ))}
              </div>

              {/* CTA bawah FAQ */}
              <div className="text-center mt-12">
                <p className="text-slate-500 text-sm mb-4">
                  Masih ada pertanyaan lain?
                </p>
                <a
                  href={`mailto:${landingContent.footer?.email || 'support@propfs.id'}`}
                  className="inline-flex items-center gap-2 text-gold font-semibold hover:underline text-sm"
                >
                  Hubungi tim kami →
                </a>
              </div>
            </div>
          </section>
        )}

        <section id="contact" className="py-24 bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-3 gap-16">
            <div className="lg:col-span-1 space-y-8">
              <h2 className="font-serif text-4xl font-bold">Hubungi Tim Kami</h2>
              <p className="text-muted-foreground leading-relaxed font-medium">Tim konsultan kami siap membantu integrasi PropFS ke dalam proses operasional developer Anda.</p>
              <div className="space-y-4">
                <a href={`mailto:${footer.email}`} className="flex items-center gap-4 text-navy dark:text-gold font-bold hover:opacity-70 transition-opacity">
                  <Mail className="h-5 w-5" /> {footer.email}
                </a>
                <a href={footer.whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 text-navy dark:text-gold font-bold hover:opacity-70 transition-opacity">
                  <Phone className="h-5 w-5" /> {footer.phone}
                </a>
                <div className="flex items-center gap-4 text-navy dark:text-gold font-bold">
                  <MapPin className="h-5 w-5" /> {footer.address}
                </div>
              </div>
            </div>
            <div className="lg:col-span-2">
              {contactSent ? (
                <div className="flex flex-col items-center justify-center h-full py-16 gap-6 text-center">
                  <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle className="h-10 w-10 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-navy mb-2">Pesan Terkirim! 🎉</h3>
                    <p className="text-muted-foreground">Tim kami akan segera menghubungi Anda.</p>
                  </div>
                  <button onClick={() => setContactSent(false)} className="text-sm text-gold font-bold hover:underline">Kirim pesan lain</button>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="grid sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Nama Lengkap</label>
                    <input
                      required
                      value={contactName}
                      onChange={e => setContactName(e.target.value)}
                      className="w-full bg-muted border-none rounded-2xl p-4 focus:ring-2 focus:ring-gold outline-none"
                      placeholder="Masukkan nama..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Email</label>
                    <input
                      required
                      type="email"
                      value={contactEmail}
                      onChange={e => setContactEmail(e.target.value)}
                      className="w-full bg-muted border-none rounded-2xl p-4 focus:ring-2 focus:ring-gold outline-none"
                      placeholder="email@perusahaan.com"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-2">
                    <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Pesan Anda</label>
                    <textarea
                      required
                      rows={4}
                      value={contactMsg}
                      onChange={e => setContactMsg(e.target.value)}
                      className="w-full bg-muted border-none rounded-2xl p-4 focus:ring-2 focus:ring-gold outline-none resize-none"
                      placeholder="Tuliskan pertanyaan atau kebutuhan Anda..."
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="gold"
                    className="sm:col-span-2 h-16 font-bold text-lg shadow-xl shadow-gold/20 gap-3"
                    disabled={contactSending}
                  >
                    {contactSending ? <><Loader2 className="h-5 w-5 animate-spin" /> Mengirim...</> : <><Send className="h-5 w-5" /> Kirim Pesan Sekarang</>}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-navy py-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-8">
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
            <div className="flex flex-col sm:flex-row items-center gap-6 text-sm text-white/50">
              <a href={`mailto:${footer.email}`} className="hover:text-gold transition-colors flex items-center gap-2">
                <Mail className="h-4 w-4" /> {footer.email}
              </a>
              <a href={footer.whatsappUrl} target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors flex items-center gap-2">
                <Phone className="h-4 w-4" /> {footer.phone}
              </a>
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> {footer.address}
              </span>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-white/40 text-sm font-medium">
              {footer.copyrightText.replace('{year}', String(new Date().getFullYear()))}
            </p>
            <div className="flex gap-8 text-xs font-bold uppercase tracking-widest text-white/40">
              <button
                onClick={() => setLegalModal('privacy')}
                className="hover:text-gold transition-colors text-xs font-bold uppercase tracking-widest text-white/40"
              >
                Privacy
              </button>
              <button
                onClick={() => setLegalModal('terms')}
                className="hover:text-gold transition-colors text-xs font-bold uppercase tracking-widest text-white/40"
              >
                Terms
              </button>
            </div>
          </div>
        </div>
      </footer>
      
      <LegalModal
        type={legalModal!}
        isOpen={legalModal !== null}
        onClose={() => setLegalModal(null)}
      />
    </div>
  )
}

function FAQItem({ item, idx }: { item: { question: string; answer: string }; idx: number }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${
      open ? 'border-gold/30 shadow-md' : 'border-slate-100 hover:border-slate-200'
    }`}>
      <button
        className="w-full flex items-center justify-between px-6 py-5 text-left gap-4"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-4">
          <span className="w-7 h-7 rounded-full bg-gold/10 text-gold text-xs font-black flex items-center justify-center flex-shrink-0">
            {idx + 1}
          </span>
          <span className="font-semibold text-navy text-sm sm:text-base leading-snug">
            {item.question}
          </span>
        </div>
        <ChevronDown className={`h-5 w-5 text-gold flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-6 pb-5 pl-[4.25rem]">
          <p className="text-slate-600 text-sm leading-relaxed">{item.answer}</p>
        </div>
      )}
    </div>
  )
}
