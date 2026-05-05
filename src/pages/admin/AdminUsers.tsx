import { useState, useEffect } from 'react'
import { Users, ShieldAlert, CheckCircle2, Calendar, CreditCard, RefreshCw, Plus, Key } from 'lucide-react'
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
  const [isUpdatingSub, setIsUpdatingSub] = useState(false)
  const [isSendingReset, setIsSendingReset] = useState(false)

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
  }

  async function updateUserFlag(userId: string, key: AppFeature, val: boolean) {
    const user = users.find(u => u.id === userId)
    if (!user) return

    const nextFeatures = { ...(user.custom_features || {}), [key]: val }
    
    const { error } = await supabase
      .from('profiles')
      .update({ custom_features: nextFeatures })
      .eq('id', userId)
    
    if (!error) {
      setUsers(users.map(u => u.id === userId ? { ...u, custom_features: nextFeatures } : u))
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, custom_features: nextFeatures })
      }
      toast({ title: `Akses fitur pengguna diperbarui` })
    }
  }

  async function handleSaveSubscription() {
    if (!selectedUser) return
    setIsUpdatingSub(true)
    try {
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
        // Update existing active subscription
        res = await supabase.from('subscriptions').update(payload).eq('id', activeSub.id).select().single()
      } else {
        // Insert new subscription
        res = await supabase.from('subscriptions').insert(payload).select().single()
      }
      
      if (res.error) throw res.error
      toast({ title: 'Langganan berhasil diperbarui' })
      loadUsers() // Refresh all data to sync
    } catch (err: any) {
      toast({ title: 'Error menyimpan langganan', description: err.message, variant: 'destructive' })
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
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
                <th className="px-4 py-3 font-medium">Status Langganan</th>
                <th className="px-4 py-3 font-medium text-center">Role</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map(u => {
                const subs = u.subscriptions || []
                const active = subs.find((s:any) => s.status === 'active')
                
                return (
                  <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-4">
                      <div className="font-bold text-navy">{u.company || '-'}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{u.full_name || 'Tanpa Nama'} • {u.email || 'Email tidak tersedia'}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-xs">{u.phone || '-'}</div>
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
                    <td className="px-4 py-4 text-right">
                      <Button variant="outline" size="sm" onClick={() => handleOpenUser(u)} className="hover:bg-navy hover:text-white border-navy/20">Edit Akses & Paket</Button>
                    </td>
                  </tr>
                )
              })}
              {loading ? (
                <tr>
                   <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground italic">Memuat pengguna dari database...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                   <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground italic">Tidak ada data pelanggan, atau akses dibatasi RLS.</td>
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
                 
                 <Button variant="gold" className="font-bold gap-2 mt-2" onClick={handleSaveSubscription} disabled={isUpdatingSub}>
                   {isUpdatingSub ? <RefreshCw className="h-4 w-4 animate-spin" /> : <SaveIcon />} 
                   Simpan Durasi Langganan
                 </Button>
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
                         <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${selectedUser.custom_features?.[f.key] ? 'border-gold bg-gold' : 'border-muted-foreground/30'}`}>
                            {selectedUser.custom_features?.[f.key] && <CheckCircle2 className="h-3.5 w-3.5 text-navy" />}
                         </div>
                         <input 
                           type="checkbox" 
                           className="hidden"
                           checked={!!(selectedUser.custom_features && selectedUser.custom_features[f.key])}
                           onChange={(e) => updateUserFlag(selectedUser.id, f.key, e.target.checked)}
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
            
            <div className="p-6 border-t border-border bg-slate-50 flex gap-3 justify-end mt-auto">
               <Button variant="outline" className="h-12 font-bold px-8 hover:bg-slate-200" onClick={() => setSelectedUser(null)}>
                 Tutup Halaman
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
