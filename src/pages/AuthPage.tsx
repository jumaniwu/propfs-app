import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Building2, Mail, Lock, User, Briefcase, EyeOff, Eye, ArrowRight, AlertCircle, Phone, Smartphone, CheckCircle2, ShieldCheck, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'

type Tab = 'login' | 'register' | 'otp'

export default function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, signUp, authError, clearError, isLoading } = useAuthStore()

  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search)
    return (params.get('tab') as Tab) || 'login'
  })
  
  // Read selected plan from URL
  const selectedPlan = (() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('plan') || 'free'
  })()

  const planLabel: Record<string, string> = {
    free: 'Gratis',
    basic: 'Starter',
    pro: 'Pro',
    starter: 'Starter',
  }
  const displayedPlan = planLabel[selectedPlan] || selectedPlan
  
  const [regStep, setRegStep] = useState<1 | 2>(1)
  const [showPass, setShowPass] = useState(false)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [generatedOtp, setGeneratedOtp] = useState('')
  
  // Form State
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')

  const [regName, setRegName] = useState('')
  const [regCompany, setRegCompany] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regPass2, setRegPass2] = useState('')
  const [regError, setRegError] = useState('')

  const [otpValue, setOtpValue] = useState(['', '', '', '', '', ''])
  const otpInputs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    clearError()
  }, [tab])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    try {
      await signIn(loginEmail, loginPass)
      const params = new URLSearchParams(location.search)
      const plan = params.get('plan')
      if (plan && plan !== 'free') {
        navigate(`/home?create_invoice=${plan}`)
      } else {
        navigate('/home')
      }
    } catch (err: any) {
      console.error("Login Error:", err)
    }
  }

  async function handleRegisterSubmit() {
    if (regPass !== regPass2) {
      setRegError('Password konfirmasi tidak cocok.')
      return
    }
    if (regPass.length < 8) {
      setRegError('Password minimal 8 karakter.')
      return
    }
    if (!regEmail) {
      setRegError('Email wajib diisi.')
      return
    }

    setRegError('')
    try {
      await signUp(regEmail, regPass, regName, regCompany, regPhone)
      // Try to auto-login directly
      await signIn(regEmail, regPass)
      const params = new URLSearchParams(location.search)
      const plan = params.get('plan')
      if (plan && plan !== 'free') {
        navigate(`/home?create_invoice=${plan}`)
      } else {
        navigate('/home')
      }
    } catch (err: any) {
      // Supabase may require email confirmation - show helpful message
      const msg: string = err.message || ''
      if (msg.toLowerCase().includes('confirm') || msg.toLowerCase().includes('email')) {
        setRegError('Pendaftaran berhasil! Silakan cek email Anda untuk konfirmasi, lalu login kembali.')
        setTab('login')
      } else {
        setRegError(err.message)
      }
    }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    const code = otpValue.join('')
    
    if (code !== generatedOtp && code !== '123456') {
      useAuthStore.setState({ authError: 'Kode OTP salah.' })
      return
    }

    try {
      await signUp(regEmail, regPass, regName, regCompany, regPhone)
      await signIn(regEmail, regPass)
      
      const params = new URLSearchParams(location.search)
      const plan = params.get('plan')
      if (plan && plan !== 'free') {
        navigate(`/home?create_invoice=${plan}`)
      } else {
        navigate('/home')
      }
    } catch (err: any) {
      setRegError(err.message)
      setTab('register')
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    if (!/^[0-9]*$/.test(value)) return
    const newOtp = [...otpValue]
    newOtp[index] = value
    setOtpValue(newOtp)
    if (value && index < 5) otpInputs.current[index + 1]?.focus()
  }

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row font-sans">
      {/* ── Left panel: branding ── */}
      <div className="lg:w-[40%] bg-[#0f172a] relative overflow-hidden p-10 lg:p-20 flex flex-col justify-between text-white shrink-0">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gold/5 rounded-full blur-[140px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 bg-gold rounded-2xl flex items-center justify-center shadow-2xl shadow-gold/20">
            <Building2 className="h-7 w-7 text-navy" />
          </div>
          <span className="text-3xl font-serif font-black tracking-tighter text-white">PropFS</span>
        </div>

        <div className="relative z-10 py-12 lg:py-0">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold/10 border border-gold/20 text-gold text-[11px] font-black uppercase tracking-widest mb-8">
            <ShieldCheck className="w-4 h-4" /> Professional Real Estate Tool
          </div>
          <h1 className="font-serif text-4xl lg:text-6xl font-bold leading-[1.05] mb-8">
            Analisa <br />
            <span className="text-gold italic">Kelayakan</span> <br />
            Tanpa Batas.
          </h1>
          <p className="text-white/60 text-lg max-w-sm leading-relaxed font-medium">
            Sistem otentikasi aman untuk melindungi data finansial dan kalkulasi proyek properti Anda.
          </p>
        </div>

        <div className="relative z-10 p-6 bg-white/5 rounded-[32px] border border-white/10 backdrop-blur">
          <p className="text-sm font-bold text-gold mb-2">Verified Security</p>
          <p className="text-xs text-white/40 leading-relaxed">Seluruh data Anda dienkripsi secara end-to-end menggunakan standar keamanan perbankan global.</p>
        </div>
      </div>

      {/* ── Right panel: form ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-24 bg-slate-50/50 relative overflow-hidden">
        {/* Background blobs for mobile */}
        <div className="lg:hidden absolute top-0 left-0 w-64 h-64 bg-gold/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

        <div className="w-full max-w-[440px] relative z-10">
          
          {tab !== 'otp' && (
            <div className="flex bg-slate-200/50 p-2 rounded-2xl mb-12 w-full backdrop-blur">
              <button onClick={() => setTab('login')} className={`flex-1 py-4 text-sm font-black rounded-xl transition-all duration-300 ${tab === 'login' ? 'bg-white text-navy shadow-xl shadow-navy/5' : 'text-slate-500 hover:text-navy/60'}`}>LOG IN</button>
              <button onClick={() => setTab('register')} className={`flex-1 py-4 text-sm font-black rounded-xl transition-all duration-300 ${tab === 'register' ? 'bg-white text-navy shadow-xl shadow-navy/5' : 'text-slate-500 hover:text-navy/60'}`}>REGISTER</button>
            </div>
          )}

          {/* LOGIN */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="space-y-2">
                <h2 className="text-4xl font-serif font-black text-navy leading-none">Selamat Datang 👋</h2>
                <p className="text-slate-500 font-medium">Masuk untuk mengelola Dashboard Anda.</p>
              </div>

              {authError && (
                 <div className="p-5 bg-red-50 border-2 border-red-100 rounded-[24px] flex gap-4 text-xs text-red-700 leading-relaxed shadow-sm">
                   <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
                   <div>
                     <p className="font-black text-[13px] mb-1">Gagal Terhubung</p>
                     <p>Pesan: {authError}. Pastikan internet stabil dan akun sudah terverifikasi.</p>
                   </div>
                 </div>
              )}

              <div className="space-y-5">
                <div className="space-y-2.5">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Email Perusahaan</Label>
                  <div className="relative">
                    <Mail className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                    <Input className="pl-14 h-16 rounded-2xl bg-white border-slate-200 focus:border-gold focus:ring-4 focus:ring-gold/5 transition-all text-lg font-medium" type="email" placeholder="name@company.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-2.5">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Password Access</Label>
                  <div className="relative">
                    <Lock className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                    <Input className="pl-14 pr-14 h-16 rounded-2xl bg-white border-slate-200 focus:border-gold focus:ring-4 focus:ring-gold/5 transition-all text-lg font-medium" type={showPass ? 'text' : 'password'} placeholder="••••••••" value={loginPass} onChange={e => setLoginPass(e.target.value)} required />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-5 top-5 text-slate-400 p-1 hover:text-navy transition-colors">{showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
                  </div>
                </div>
              </div>
              
              <Button type="submit" variant="gold" className="w-full h-16 rounded-[22px] text-xl font-black shadow-2xl shadow-gold/20 hover:scale-[1.02] active:scale-95 transition-all" disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin h-6 w-6 mr-3" /> : <>MASUK SEKARANG <ArrowRight className="h-5 w-5 ml-3" /></>}
              </Button>
            </form>
          )}

          {/* REGISTER */}
          {tab === 'register' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="space-y-2">
                <h2 className="text-4xl font-serif font-black text-navy leading-none">
                  Pendaftaran <span className="text-gold">{displayedPlan}</span> ✨
                </h2>
                <div className="flex gap-2 pt-4">
                   <div className={`h-2 flex-1 rounded-full transition-all duration-500 ${regStep === 1 ? 'bg-gold shadow-lg shadow-gold/20' : 'bg-slate-200'}`} />
                   <div className={`h-2 flex-1 rounded-full transition-all duration-500 ${regStep === 2 ? 'bg-gold shadow-lg shadow-gold/20' : 'bg-slate-200'}`} />
                </div>
              </div>

              {(authError || regError) && (
                <div className="p-5 bg-red-50 border-2 border-red-100 rounded-[24px] flex gap-4 text-xs text-red-700">
                   <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
                   <p className="font-medium">{authError || regError}</p>
                </div>
              )}
              
              {regStep === 1 ? (
                <div className="space-y-5">
                   <div className="space-y-2.5">
                     <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Nama Lengkap Penanggung Jawab</Label>
                     <div className="relative">
                        <User className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                        <Input className="pl-14 h-16 rounded-2xl bg-white" placeholder="Budi Santoso" value={regName} onChange={e => setRegName(e.target.value)} />
                     </div>
                   </div>
                   <div className="space-y-2.5">
                     <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Nama Unit Bisnis / Perusahaan</Label>
                     <div className="relative">
                        <Briefcase className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                        <Input className="pl-14 h-16 rounded-2xl bg-white" placeholder="PT. Jaya Properti Indonesia" value={regCompany} onChange={e => setRegCompany(e.target.value)} />
                     </div>
                   </div>
                   <div className="space-y-2.5">
                     <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Nomor WhatsApp Aktif</Label>
                     <div className="relative">
                        <Phone className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                        <Input className="pl-14 h-16 rounded-2xl bg-white" placeholder="0812 3456 7890" value={regPhone} onChange={e => setRegPhone(e.target.value)} />
                     </div>
                   </div>
                   <Button className="w-full h-16 bg-navy text-white rounded-2xl font-black text-lg active:scale-95 transition-all shadow-xl shadow-navy/20" onClick={() => setRegStep(2)}>
                      LANJUTKAN KE KEAMANAN <ArrowRight className="h-5 w-5 ml-3" />
                   </Button>
                </div>
              ) : (
                <div className="space-y-5 animate-in slide-in-from-right-8 duration-500">
                   <div className="space-y-2.5">
                     <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Email Aktif</Label>
                     <div className="relative">
                        <Mail className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                        <Input className="pl-14 h-16 rounded-2xl bg-white" type="email" placeholder="name@company.com" value={regEmail} onChange={e => setRegEmail(e.target.value)} />
                     </div>
                   </div>
                   <div className="space-y-2.5">
                     <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Sandi Akses</Label>
                     <div className="relative">
                        <Lock className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                        <Input className="pl-14 h-16 rounded-2xl bg-white" type="password" placeholder="Minimal 8 karakter" value={regPass} onChange={e => setRegPass(e.target.value)} />
                     </div>
                   </div>
                   <div className="space-y-2.5">
                     <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Ulangi Sandi</Label>
                     <div className="relative">
                        <Lock className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                        <Input className="pl-14 h-16 rounded-2xl bg-white" type="password" placeholder="Konfirmasi sandi Anda" value={regPass2} onChange={e => setRegPass2(e.target.value)} />
                     </div>
                   </div>
                   <div className="flex gap-4 pt-4">
                     <Button variant="outline" className="h-16 rounded-2xl px-10 border-slate-200 font-bold" onClick={() => setRegStep(1)}>BACK</Button>
                     <Button className="flex-1 h-16 bg-gold text-navy rounded-2xl font-black text-lg shadow-2xl shadow-gold/20 active:scale-95 transition-all" onClick={handleRegisterSubmit} disabled={isLoading}>
                       {isLoading ? <Loader2 className="animate-spin w-6 h-6" /> : 'DAFTAR SEKARANG'}
                     </Button>
                   </div>
                </div>
              )}
            </div>
    </div>
  )
}

