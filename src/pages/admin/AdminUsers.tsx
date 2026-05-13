import { useState, useEffect } from 'react'
import { Users, ShieldAlert, CheckCircle2, Calendar, CreditCard, RefreshCw, Plus, Key, UserX, UserCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase, type AppFeature } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'

const AVAILABLE_FEATURES: { key: AppFeature; label: string; desc: string }[] = [
  { key: 'fs_module', label: 'Feasibility Study (FS)', desc: 'Modul utama analisa kelayakan proyek properti.' },
  { key: 'cost_control', label: 'Cost Control & RAB', desc: 'Modul pelacakan anggaran dan Kurva S.' },
  { key: 'ai_solver', label: 'AI Target Profit Solver', desc: 'Fitur optimasi harga otomatis berbasis AI.' },
  { key: 'pdf_export', label: 'PDF Report Export', desc: 'Kemampuan ekspor hasil analisa ke PDF.' },
  { key: 'scurve', label: 'Kurva S Visualization', desc: 'Visualisasi grafik progres pembangunan.' },
  { key: 'dashboard_admin', label: 'Admin Dashboard', desc: 'Akses ke panel admin ini.' },
]

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState<any | null>(null)
  
  // Subscription Form State
  const [subPlan, setSubPlan] = useState('free')
  const [subStart, setSubStart] = useState('')
  const [subEnd, setSubEnd] = useState('')
  const [localFeatures, setLocalFeatures] = useState<Record<string, boolean>>({})
  const [isUpdatingSub, setIsUpdatingSub] = useState(false)
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [isSuspending, setIsSuspending] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  const [loading, setLoading] = useState(true)

  async function loadUsers() {
    setLoading(true)
    try {
      // Fetch profiles WITH their subscriptions
      const { data, error } = await supabase
        .from('profiles')
        .select('*, subscriptions(*)')
        .order('created_at', { ascending: false })
      
      if (error) {
        console.warn("Error fetching profiles (possibly RLS block). Querying profiles locally or ignoring:", error)
        // Fallback: If query fails due to RLS, try just fetching profiles without subscriptions
        const { data: fallbackData } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
        if (fallbackData) setUsers(fallbackData)
      } else if (data) {
        setUsers(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  function handleOpenUser(u: any) {
    setSelectedUser(u)
    
    // Find active or most recent subscription
    const subs = u.subscriptions || []
    const activeSub = subs.find((s: any) => s.status === 'active') || subs[0]
    
    if (activeSub) {
      setSubPlan(activeSub.plan_id)
      setSubStart(activeSub.started_at ? new Date(activeSub.started_at).toISOString().split('T')[0] : '')
      setSubEnd(activeSub.expired_at ? new Date(activeSub.expired_at).toISOString().split('T')[0] : '')
    } else {
      setSubPlan('free')
      setSubStart(new Date().toISOString().split('T')[0])
      const nextMonth = new Date()
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      setSubEnd(nextMonth.toISOString().split('T')[0])
    }
    
    setLocalFeatures(u.custom_features || {})
  }

  async function handleSaveAll() {
    if (!selectedUser) return
    setIsUpdatingSub(true)
    try {
      // 1. Save Features
      const { error: featuresError } = await supabase
        .from('profiles')
        .update({ custom_features: localFeatures })
        .eq('id', selectedUser.id)
        
      if (featuresError) throw featuresError

      // 2. Save Subscription
      const activeSub = (selectedUser.subscriptions || []).find((s: any) => s.status === 'active')
      const payload = {
         user_id: selectedUser.id,
         plan_id: subPlan,
         status: 'active',
         started_at: subStart ? new Date(subStart).toISOString() : null,
         expired_at: subEnd ? new Date(subEnd).toISOString() : null
      }
      
      let res;
      if (activeSub) {
        res = await supabase.from('subscriptions').update(payload).eq('id', activeSub.id).select().single()
      } else {
        res = await supabase.from('subscriptions').insert(payload).select().single()
      }
      
      // If RLS blocks subscription update, we throw a specific error
      if (res.error) throw new Error(`Gagal menyimpan langganan: ${res.error.message}`)
      
      toast({ title: 'Perubahan berhasil disimpan' })
      setSelectedUser(null)
      loadUsers() 
    } catch (err: any) {
      toast({ title: 'Gagal menyimpan', description: err.message, variant: 'destructive' })
    } finally {
      setIsUpdatingSub(false)
    }
  }

  async function handleResetPassword() {
    if (!selectedUser || !selectedUser.email) {
      toast({ title: 'Gagal', description: 'Pengguna ini tidak memiliki data email.', variant: 'destructive' })
      return
    }
    setIsSendingReset(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(selectedUser.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      toast({ title: 'Berhasil', description: `Link reset password telah dikirim ke ${selectedUser.email}` })
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setIsSendingReset(false)
    }
  }

  async function extendUserTrial(userId: string, additionalDays: number) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('trial_expires_at')
      .eq('id', userId)
      .single()

    const currentExpiry = profile?.trial_expires_at 
      ? new Date(profile.trial_expires_at)
      : new Date()
    
    const newExpiry = new Date(currentExpiry)
    newExpiry.setDate(newExpiry.getDate() + additionalDays)

    await supabase
      .from('profiles')
      .update({
        trial_expires_at: newExpiry.toISOString(),
        trial_status: 'trial_active',
        is_trial_extended: true,
      })
      .eq('id', userId)

    toast({ 
      title: `✅ Trial diperpanjang ${additionalDays} hari`,
      description: `Berlaku hingga ${newExpiry.toLocaleDateString('id-ID')}`
    })
    
    await loadUsers()
  }

  async function setFreeForever(userId: string) {
    await supabase
      .from('profiles')
      .update({
        trial_status: 'free_forever',
        trial_expires_at: null,
      })
      .eq('id', userId)
    
    toast({ title: '✅ User diset Free Forever' })
    await loadUsers()
  }

  async function handleSuspendUser(u: any) {
    const isActive = u.is_active !== false
    const action = isActive ? 'nonaktifkan' : 'aktifkan'
    if (!window.confirm(`Apakah Anda yakin ingin ${action} user "${u.full_name || u.email}"?`)) return
    setIsSuspending(u.id)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !isActive })
        .eq('id', u.id)
      if (error) throw error
      toast({ title: isActive ? '🔒 User dinonaktifkan' : '✅ User diaktifkan', description: u.full_name || u.email })
      await loadUsers()
    } catch (err: any) {
      toast({ title: 'Gagal', description: err.message, variant: 'destructive' })
    } finally {
      setIsSuspending(null)
    }
  }

  async function handleDeleteUser(u: any) {
    if (!window.confirm(`⚠️ PERHATIAN: Hapus user "${u.full_name || u.email}" secara PERMANEN? Semua data proyek dan profil akan hilang. Tindakan ini TIDAK dapat dibatalkan.`)) return
    setIsDeleting(u.id)
    try {
      // Delete subscriptions first
      await supabase.from('subscriptions').delete().eq('user_id', u.id)
      // Delete projects
      await supabase.from('projects').delete().eq('user_id', u.id)
      // Delete profile
      const { error } = await supabase.from('profiles').delete().eq('id', u.id)
      if (error) throw error
      toast({ title: '🗑️ User dihapus', description: 'Semua data profil dan proyek telah dihapus.' })
      setSelectedUser(null)
      await loadUsers()
    } catch (err: any) {
      toast({ title: 'Gagal Menghapus', description: err.message, variant: 'destructive' })
    } finally {
      setIsDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
           <h1 className="text-2xl font-serif font-bold text-navy">Manajemen Perusahaan & Pengguna</h1>
           <p className="text-sm text-muted-foreground mt-1">Daftar pengguna dan atur durasi langganan (expired contract).</p>
        </div>
      </div>

      <div className="bg-card border border-border shadow-sm rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
           <div className="relative flex-1 max-w-sm">
              <Users className="h-5 w-5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input className="pl-10 h-10 w-full bg-muted border-none rounded-xl text-sm focus:ring-2 focus:ring-gold focus:outline-none" placeholder="Cari perusahaan atau nama..." />
           </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left border-b border-border">
                <th className="px-4 py-3 font-medium">Perusahaan & Pendaftar</th>
                <th className="px-4 py-3 font-medium">Kontak</th>
                <th className="px-4 py-3 font-medium">Status Trial</th>
                <th className="px-4 py-3 font-medium">Status Langganan</th>
                <th className="px-4 py-3 font-medium text-center">Role</th>
                <th className="px-4 py-3 font-medium text-center">Aktif</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map(u => {
                const subs = u.subscriptions || []
                const active = subs.find((s:any) => s.status === 'active')
                
                const isActive = u.is_active !== false
                return (
                  <tr key={u.id} className={`hover:bg-muted/20 transition-colors ${!isActive ? 'opacity-50 bg-red-50/30' : ''}`}>
                    <td className="px-4 py-4">
                      <div className="font-bold text-navy">{u.company || '-'}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{u.full_name || 'Tanpa Nama'} • {u.email || 'Email tidak tersedia'}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-xs">{u.phone || '-'}</div>
                    </td>
                    <td className="px-4 py-4">
                      {u.trial_status === 'free_forever' ? (
                        <div className="font-bold text-blue-600 text-[10px] uppercase tracking-wider">Free Forever</div>
                      ) : u.trial_status === 'trial_expired' ? (
                        <div className="font-bold text-red-600 text-[10px] uppercase tracking-wider">Expired</div>
                      ) : (
                        <div>
                          <div className="font-bold text-amber-600 text-[10px] uppercase tracking-wider">Active Trial</div>
                          {u.trial_expires_at && <div className="text-xs text-muted-foreground mt-0.5">Exp: {new Date(u.trial_expires_at).toLocaleDateString('id-ID')}</div>}
                        </div>
                      )}
                      <div className="flex gap-2 mt-2">
                        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => extendUserTrial(u.id, 7)}>+7 Hari</Button>
                        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => setFreeForever(u.id)}>Bebaskan</Button>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {active ? (
                        <div>
                          <div className="font-bold text-emerald-600 uppercase text-[10px] tracking-wider">Plan {active.plan_id}</div>
                          {active.expired_at && <div className="text-xs text-muted-foreground mt-0.5">Exp: {new Date(active.expired_at).toLocaleDateString('id-ID')}</div>}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground italic">Tidak ada (Paket Free)</div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide inline-flex items-center gap-1 ${u.role === 'superadmin' ? 'bg-gold/20 text-yellow-800' : 'bg-slate-100 text-slate-600'}`}>
                        {u.role === 'superadmin' && <ShieldAlert className="h-3 w-3" />}
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {isActive ? '✅ Aktif' : '🔒 Suspend'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => handleOpenUser(u)} className="hover:bg-navy hover:text-white border-navy/20 h-8 text-xs">
                          Edit
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={isSuspending === u.id}
                          onClick={() => handleSuspendUser(u)}
                          className={`h-8 text-xs ${isActive ? 'border-orange-300 text-orange-600 hover:bg-orange-50' : 'border-emerald-300 text-emerald-600 hover:bg-emerald-50'}`}
                        >
                          {isSuspending === u.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : isActive ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={isDeleting === u.id || u.role === 'superadmin'}
                          onClick={() => handleDeleteUser(u)}
                          className="h-8 text-xs border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-30"
                          title={u.role === 'superadmin' ? 'Tidak bisa hapus superadmin' : 'Hapus User'}
                        >
                          {isDeleting === u.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {loading ? (
                <tr>
                   <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground italic">Memuat pengguna dari database...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                   <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground italic">Tidak ada data pelanggan, atau akses dibatasi RLS.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Access Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl overflow-hidden max-w-2xl w-full flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200">
            
            <div className="p-6 sm:p-8 border-b border-border bg-slate-50 relative">
               <h3 className="text-2xl font-serif font-bold text-navy mb-1">{selectedUser.company || selectedUser.full_name}</h3>
               <p className="text-sm text-muted-foreground flex items-center gap-4">
                 <span>ID: <span className="font-mono text-xs">{selectedUser.id.substring(0,8)}</span></span>
                 {selectedUser.email && <span>{selectedUser.email}</span>}
                 <span>{selectedUser.phone}</span>
               </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-10 custom-scrollbar">
              
              {/* SECTION: Langganan */}
              <div className="space-y-4">
                 <div className="flex items-center gap-2 mb-2">
                   <CreditCard className="h-5 w-5 text-gold" />
                   <h4 className="font-bold text-navy text-lg">Kontrol Langganan (Expired Contract)</h4>
                 </div>
                 
                 <div className="grid sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                       <Label className="text-xs uppercase font-bold text-slate-500">Paket Properti</Label>
                       <Select value={subPlan} onValueChange={setSubPlan}>
                         <SelectTrigger className="h-12 bg-white">
                           <SelectValue />
                         </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="free">Paket Free (Gratis)</SelectItem>
                           <SelectItem value="basic">Paket Starter (Basic)</SelectItem>
                           <SelectItem value="pro">Paket Pro (Full)</SelectItem>
                         </SelectContent>
                       </Select>
                    </div>
                    <div className="space-y-1.5">
                       <Label className="text-xs uppercase font-bold text-slate-500">Tgl. Aktif (Start)</Label>
                       <Input type="date" className="h-12 bg-white" value={subStart} onChange={e => setSubStart(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                       <Label className="text-xs uppercase font-bold text-slate-500">Tgl. Kedaluwarsa (Exp)</Label>
                       <Input type="date" className="h-12 bg-white" value={subEnd} onChange={e => setSubEnd(e.target.value)} />
                    </div>
                 </div>
              </div>


               {/* SECTION: Keamanan Akun */}
               <div className="space-y-4">
                 <div className="flex items-center gap-2 mb-2">
                   <Key className="h-5 w-5 text-red-500" />
                   <h4 className="font-bold text-navy text-lg">Keamanan Akun</h4>
                 </div>
                 <p className="text-xs text-muted-foreground -mt-3 mb-4">Kirimkan tautan reset password aman langsung ke email pengguna. Pengguna dapat mengubah passwordnya sendiri melalui tautan tersebut.</p>
                 <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 font-bold" onClick={handleResetPassword} disabled={isSendingReset || !selectedUser.email}>
                   {isSendingReset ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                   Kirim Link Reset Password
                 </Button>
                 {!selectedUser.email && <p className="text-xs text-red-500 mt-2">Tidak dapat mengirim link: Data email kosong.</p>}
               </div>

              {/* SECTION: Bypass Feature Flags */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                   <ShieldAlert className="h-5 w-5 text-slate-400" />
                   <h4 className="font-bold text-navy text-lg">Individu Feature Bypass</h4>
                 </div>
                <p className="text-xs text-muted-foreground -mt-3 mb-4">Aktifkan fitur khusus untuk perusahaan ini yang mengabaikan setting paket umum berlangganan mereka secara manual.</p>
                
                <div className="grid sm:grid-cols-2 gap-3">
                  {AVAILABLE_FEATURES.map(f => (
                    <label key={f.key} className="flex items-start gap-4 p-3 rounded-xl border border-border border-b-2 hover:border-gold cursor-pointer transition-all bg-card">
                      <div className="pt-0.5">
                         <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${localFeatures[f.key] ? 'border-gold bg-gold' : 'border-muted-foreground/30'}`}>
                            {localFeatures[f.key] && <CheckCircle2 className="h-3.5 w-3.5 text-navy" />}
                         </div>
                         <input 
                           type="checkbox" 
                           className="hidden"
                           checked={!!localFeatures[f.key]}
                           onChange={(e) => setLocalFeatures(prev => ({ ...prev, [f.key]: e.target.checked }))}
                         />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-navy">{f.label}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

            </div>
            
            <div className="p-6 border-t border-border bg-slate-50 flex flex-col sm:flex-row gap-3 sm:justify-end mt-auto">
               <Button variant="outline" className="h-12 font-bold sm:px-8 hover:bg-slate-200 order-2 sm:order-1" onClick={() => setSelectedUser(null)}>
                 Batal
               </Button>
               <Button variant="gold" className="h-12 font-bold sm:px-8 order-1 sm:order-2" onClick={handleSaveAll} disabled={isUpdatingSub}>
                 {isUpdatingSub ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                 Simpan Perubahan
               </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SaveIcon() {
   return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
}
