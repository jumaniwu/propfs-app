// ============================================================
// PropFS — Reset Password Page
// Menangani redirect dari link email Supabase
// URL format: /reset-password#access_token=xxx&type=recovery
// ============================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Lock, Eye, EyeOff, CheckCircle2, 
  AlertCircle, Loader2, ArrowRight 
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type PageState = 
  | 'loading'      // sedang proses token dari URL
  | 'form'         // form input password baru
  | 'success'      // password berhasil diganti
  | 'invalid'      // token expired atau tidak valid
  | 'error'        // error lainnya

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  
  const [pageState, setPageState] = useState<PageState>('loading')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Validasi kekuatan password
  const passwordStrength = {
    length: newPassword.length >= 8,
    hasNumber: /\\d/.test(newPassword),
    hasUpper: /[A-Z]/.test(newPassword),
  }
  const isPasswordStrong = Object.values(passwordStrength).every(Boolean)
  const passwordsMatch = newPassword === confirmPassword && newPassword !== ''

  useEffect(() => {
    // Supabase mengirim token via URL hash fragment:
    // /reset-password#access_token=xxx&refresh_token=xxx&type=recovery
    async function handleTokenFromURL() {
      try {
        // Supabase JS otomatis parse hash fragment
        // Kita tunggu session terbentuk
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Session error:', error)
          setPageState('invalid')
          return
        }

        if (session) {
          // Session valid — tampilkan form
          setPageState('form')
          return
        }

        // Jika session belum ada, listen ke auth state change
        // Supabase akan emit event saat token dari hash diproses
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
              setPageState('form')
            } else if (event === 'SIGNED_IN' && session) {
              setPageState('form')
            }
          }
        )

        // Safety timeout — jika 5 detik tidak ada event, 
        // anggap token invalid/expired
        const timeout = setTimeout(() => {
          setPageState('invalid')
        }, 5000)

        return () => {
          subscription.unsubscribe()
          clearTimeout(timeout)
        }

      } catch (err) {
        console.error('Token handling error:', err)
        setPageState('invalid')
      }
    }

    handleTokenFromURL()
  }, [])

  async function handleSubmit() {
    if (!isPasswordStrong) {
      setErrorMsg('Password belum memenuhi syarat keamanan.')
      return
    }
    if (!passwordsMatch) {
      setErrorMsg('Konfirmasi password tidak cocok.')
      return
    }

    setIsSubmitting(true)
    setErrorMsg('')

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) throw error

      setPageState('success')

      // Auto redirect ke login setelah 3 detik
      setTimeout(() => {
        navigate('/auth', { replace: true })
      }, 3000)

    } catch (err: any) {
      console.error('Update password error:', err)
      setErrorMsg(
        err.message?.includes('same password')
          ? 'Password baru tidak boleh sama dengan password lama.'
          : err.message || 'Gagal mengubah password. Silakan coba lagi.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── LOADING STATE ────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-navy flex items-center 
                      justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-gold 
                          border-t-transparent rounded-full 
                          animate-spin mx-auto" />
          <p className="text-white/60 font-medium">
            Memverifikasi link reset password...
          </p>
        </div>
      </div>
    )
  }

  // ── INVALID / EXPIRED TOKEN ──────────────────────────────
  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen bg-navy flex items-center 
                      justify-center p-4">
        <div className="bg-white rounded-[32px] p-8 sm:p-10 
                        w-full max-w-md text-center space-y-6 
                        shadow-2xl">
          <div className="w-16 h-16 bg-red-100 rounded-2xl 
                          flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-serif font-black text-navy">
              Link Tidak Valid
            </h2>
            <p className="text-slate-500 leading-relaxed text-sm">
              Link reset password ini sudah kadaluarsa atau 
              tidak valid. Link hanya berlaku selama <strong>1 jam</strong> 
              setelah dikirim.
            </p>
          </div>
          <div className="space-y-3">
            <Button
              variant="gold"
              className="w-full h-12 rounded-2xl font-black"
              onClick={() => navigate('/auth')}
            >
              Minta Link Baru
            </Button>
            <button
              onClick={() => navigate('/auth')}
              className="text-xs font-bold text-slate-400 
                         hover:text-navy transition-colors"
            >
              Kembali ke Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── SUCCESS STATE ────────────────────────────────────────
  if (pageState === 'success') {
    return (
      <div className="min-h-screen bg-navy flex items-center 
                      justify-center p-4">
        <div className="bg-white rounded-[32px] p-8 sm:p-10 
                        w-full max-w-md text-center space-y-6 
                        shadow-2xl">
          <div className="w-16 h-16 bg-green-100 rounded-2xl 
                          flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-serif font-black text-navy">
              Password Berhasil Diubah!
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Password baru Anda sudah aktif. 
              Anda akan diarahkan ke halaman login 
              dalam beberapa detik...
            </p>
          </div>
          <Button
            variant="gold"
            className="w-full h-12 rounded-2xl font-black gap-2"
            onClick={() => navigate('/auth', { replace: true })}
          >
            Masuk Sekarang <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // ── FORM STATE ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-navy flex items-center 
                    justify-center p-4">
      
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-96 h-96 
                      bg-gold/5 rounded-full blur-3xl 
                      pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 
                      bg-gold/5 rounded-full blur-3xl 
                      pointer-events-none" />

      <div className="bg-white rounded-[32px] p-8 sm:p-10 
                      w-full max-w-md shadow-2xl space-y-8 
                      relative z-10">
        
        {/* Header */}
        <div className="space-y-2">
          <div className="w-12 h-12 bg-navy rounded-2xl 
                          flex items-center justify-center mb-4">
            <Lock className="h-6 w-6 text-gold" />
          </div>
          <h2 className="text-3xl font-serif font-black text-navy 
                         leading-tight">
            Buat Password Baru
          </h2>
          <p className="text-slate-500 text-sm font-medium">
            Pastikan password baru Anda kuat dan 
            mudah diingat.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-5">
          
          {/* Password Baru */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase 
                              tracking-[0.2em] text-slate-400 ml-1">
              Password Baru
            </Label>
            <div className="relative">
              <Lock className="absolute left-5 top-5 h-5 w-5 
                               text-slate-400" />
              <Input
                className="pl-14 pr-14 h-16 rounded-2xl bg-slate-50 
                           border-slate-200 focus:border-gold 
                           focus:ring-4 focus:ring-gold/5 
                           text-lg font-medium transition-all"
                type={showPass ? 'text' : 'password'}
                placeholder="Min. 8 karakter"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-5 top-5 text-slate-400 
                           hover:text-navy transition-colors p-1"
              >
                {showPass 
                  ? <EyeOff className="h-5 w-5" /> 
                  : <Eye className="h-5 w-5" />
                }
              </button>
            </div>

            {/* Password strength indicators */}
            {newPassword.length > 0 && (
              <div className="space-y-1.5 px-1 pt-1">
                {[
                  { ok: passwordStrength.length, 
                    label: 'Minimal 8 karakter' },
                  { ok: passwordStrength.hasNumber, 
                    label: 'Mengandung angka' },
                  { ok: passwordStrength.hasUpper, 
                    label: 'Mengandung huruf kapital' },
                ].map(rule => (
                  <div key={rule.label} 
                       className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full 
                                    flex items-center justify-center
                                    transition-colors
                                    ${rule.ok 
                                      ? 'bg-green-500' 
                                      : 'bg-slate-200'
                                    }`}>
                      {rule.ok && (
                        <CheckCircle2 className="h-3 w-3 
                                                  text-white" />
                      )}
                    </div>
                    <span className={`text-xs font-medium 
                                      transition-colors
                                      ${rule.ok 
                                        ? 'text-green-600' 
                                        : 'text-slate-400'
                                      }`}>
                      {rule.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Konfirmasi Password */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase 
                              tracking-[0.2em] text-slate-400 ml-1">
              Konfirmasi Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-5 top-5 h-5 w-5 
                               text-slate-400" />
              <Input
                className={`pl-14 pr-14 h-16 rounded-2xl bg-slate-50 
                           text-lg font-medium transition-all
                           ${confirmPassword.length > 0
                             ? passwordsMatch
                               ? 'border-green-400 focus:border-green-400 focus:ring-green-100'
                               : 'border-red-300 focus:border-red-300 focus:ring-red-100'
                             : 'border-slate-200 focus:border-gold focus:ring-gold/5'
                           }`}
                type={showConfirm ? 'text' : 'password'}
                placeholder="Ulangi password baru"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-5 top-5 text-slate-400 
                           hover:text-navy transition-colors p-1"
              >
                {showConfirm 
                  ? <EyeOff className="h-5 w-5" /> 
                  : <Eye className="h-5 w-5" />
                }
              </button>
            </div>
            {confirmPassword.length > 0 && (
              <p className={`text-xs font-medium px-1 
                            ${passwordsMatch 
                              ? 'text-green-600' 
                              : 'text-red-500'
                            }`}>
                {passwordsMatch 
                  ? '✓ Password cocok' 
                  : '✗ Password tidak cocok'
                }
              </p>
            )}
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-100 
                            rounded-2xl flex gap-3 items-start">
              <AlertCircle className="h-5 w-5 text-red-500 
                                      shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 font-medium">
                {errorMsg}
              </p>
            </div>
          )}

          {/* Submit Button */}
          <Button
            variant="gold"
            className="w-full h-16 rounded-2xl text-lg font-black 
                       shadow-xl shadow-gold/20 gap-2
                       hover:scale-[1.02] active:scale-95 
                       transition-all disabled:opacity-50 
                       disabled:cursor-not-allowed 
                       disabled:hover:scale-100"
            onClick={handleSubmit}
            disabled={
              isSubmitting || 
              !isPasswordStrong || 
              !passwordsMatch
            }
          >
            {isSubmitting 
              ? <><Loader2 className="animate-spin h-5 w-5" /> 
                  Menyimpan...</>
              : <>Simpan Password Baru 
                  <ArrowRight className="h-5 w-5" /></>
            }
          </Button>
        </div>
      </div>
    </div>
  )
}
