// ============================================================
// PropFS — Profile Page
// ============================================================

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Building2, Phone, Mail, LogOut, Lock, Eye, EyeOff, Gift, Copy, ShieldCheck, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Header from '@/components/layout/Header'
import PlanBadge from '@/components/subscription/PlanBadge'
import SubscriptionCard from '@/components/subscription/SubscriptionCard'
import { useAuthStore } from '@/store/authStore'
import { useSubscription } from '@/hooks/useSubscription'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { profile, user, subscription, signOut, refreshProfile, isAffiliateEnabled } = useAuthStore()
  const { currentPlan, isSubscriptionEnabled } = useSubscription()

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [company, setCompany]   = useState(profile?.company ?? '')
  const [phone, setPhone]       = useState(profile?.phone ?? '')
  const [saving, setSaving]     = useState(false)

  // Password change state
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPwd, setSavingPwd]             = useState(false)
  const [showNewPwd, setShowNewPwd]           = useState(false)
  const [showConfPwd, setShowConfPwd]         = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, company, phone })
        .eq('id', user!.id)
      if (error) throw error
      await refreshProfile()
      toast({ title: 'Profil berhasil diperbarui', variant: 'success' as any })
    } catch {
      toast({ title: 'Gagal menyimpan profil', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/auth')
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) {
      toast({ title: 'Password terlalu pendek', description: 'Minimal 8 karakter.', variant: 'destructive' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Password tidak cocok', description: 'Konfirmasi password harus sama.', variant: 'destructive' })
      return
    }
    setSavingPwd(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast({ title: '✅ Password berhasil diubah', description: 'Password baru Anda sudah aktif.' })
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      toast({ title: 'Gagal mengubah password', description: err.message, variant: 'destructive' })
    } finally {
      setSavingPwd(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-10 space-y-8">
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali
        </button>

        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Profil Saya</h1>
          <p className="text-muted-foreground text-sm mt-1">Kelola informasi akun Anda.</p>
        </div>

        {/* Avatar + plan */}
        <div className="flex items-center gap-4 p-5 bg-card border border-border rounded-2xl">
          <div className="w-14 h-14 bg-navy dark:bg-gold rounded-2xl flex items-center justify-center shrink-0">
            <span className="font-serif font-bold text-white dark:text-navy text-xl">
              {(profile?.full_name ?? user?.email ?? 'U').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-foreground truncate">{profile?.full_name || '—'}</p>
              <PlanBadge />
            </div>
            <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
          </div>
          {isSubscriptionEnabled && currentPlan !== 'pro' && (
            <Button size="sm" variant="gold" onClick={() => navigate('/pricing')}>Upgrade</Button>
          )}
        </div>

        {/* Admin Panel — khusus superadmin (dashboard backend) */}
        {profile?.role === 'superadmin' && (
          <button
            onClick={() => navigate('/admin')}
            className="w-full flex items-center gap-4 p-5 rounded-2xl bg-navy text-white hover:bg-navy/90 transition-colors text-left group"
          >
            <div className="w-11 h-11 rounded-xl bg-gold/20 text-gold flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold">Dashboard Admin</p>
              <p className="text-xs text-white/60">Kelola user, langganan, invoice, & pengaturan sistem backend.</p>
            </div>
            <ChevronRight className="h-5 w-5 text-white/50 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </button>
        )}

        {/* Edit form */}
        <form onSubmit={handleSave} className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-base">Informasi Pribadi</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="full-name" className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Nama Lengkap
              </Label>
              <Input id="full-name" value={fullName} onChange={e => setFullName(e.target.value)} className="focus-visible:ring-gold" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company" className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Perusahaan
              </Label>
              <Input id="company" value={company} onChange={e => setCompany(e.target.value)} className="focus-visible:ring-gold" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Nomor HP
              </Label>
              <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+62…" className="focus-visible:ring-gold" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Email
              </Label>
              <Input value={user?.email ?? ''} disabled className="opacity-60 cursor-not-allowed" />
            </div>
          </div>

          <Button type="submit" variant="gold" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </form>

        {/* Subscription + Invoice */}
        <SubscriptionCard variant="full" />

        {/* Affiliate Program */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-emerald-600" />
            <h2 className="font-semibold text-base">Program Afiliasi</h2>
          </div>
          
          {isAffiliateEnabled ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Bagikan link ini ke kolega Anda. Dapatkan komisi untuk setiap pengguna yang berlangganan PropFS melalui link Anda.</p>
              
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase">Link Referral Anda</Label>
                <div className="flex gap-2">
                  <Input 
                    readOnly 
                    value={`https://propfs.id/auth?ref=${profile?.referral_code || ''}`} 
                    className="bg-muted font-mono text-sm"
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      navigator.clipboard.writeText(`https://propfs.id/auth?ref=${profile?.referral_code || ''}`);
                      toast({ title: 'Disalin!', description: 'Link referral berhasil disalin ke clipboard.' });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase">Kode Referral</Label>
                <div className="font-mono text-lg font-bold text-navy">{profile?.referral_code || '—'}</div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center space-y-2">
              <div className="w-10 h-10 bg-gold/20 text-gold rounded-full flex items-center justify-center mb-1">
                <Gift className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-navy">Fitur Afiliasi Segera Hadir!</h3>
              <p className="text-xs text-muted-foreground max-w-sm">Dapatkan penghasilan tambahan dengan mereferensikan PropFS ke kolega Anda. Fitur ini akan segera dibuka untuk umum.</p>
            </div>
          )}
        </div>

        {/* Change Password */}
        <form onSubmit={handleChangePassword} className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-navy" />
            <h2 className="font-semibold text-base">Ganti Password</h2>
          </div>
          <p className="text-sm text-muted-foreground">Masukkan password baru untuk akun Anda. Minimal 8 karakter.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Password Baru</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPwd ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min. 8 karakter"
                  className="focus-visible:ring-gold pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Konfirmasi Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfPwd ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi password baru"
                  className={`focus-visible:ring-gold pr-10 ${confirmPassword && confirmPassword !== newPassword ? 'border-red-400' : ''}`}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword && confirmPassword !== newPassword && (
                <p className="text-xs text-red-500">Password tidak cocok</p>
              )}
            </div>
          </div>

          <Button type="submit" variant="gold" disabled={savingPwd || !newPassword}>
            {savingPwd ? 'Menyimpan...' : 'Ubah Password'}
          </Button>
        </form>

        {/* Sign out */}
        <div className="border border-destructive/30 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Keluar dari akun</p>
            <p className="text-xs text-muted-foreground">Sesi Anda akan diakhiri.</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10">
            <LogOut className="h-4 w-4" /> Keluar
          </Button>
        </div>
      </main>
    </div>
  )
}
