// ============================================================
// PropFS — Profile Page
// ============================================================

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Building2, Phone, Mail, LogOut } from 'lucide-react'
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
  const { profile, user, subscription, signOut, refreshProfile } = useAuthStore()
  const { currentPlan, isSubscriptionEnabled } = useSubscription()

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [company, setCompany]   = useState(profile?.company ?? '')
  const [phone, setPhone]       = useState(profile?.phone ?? '')
  const [saving, setSaving]     = useState(false)

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
