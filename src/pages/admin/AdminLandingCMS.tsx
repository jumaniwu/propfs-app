import { useState, useEffect, useRef } from 'react'
import { Save, Image as ImageIcon, Layout, List, Plus, Trash2, Upload, Loader2, Smartphone, Monitor, Palette, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useAuthStore, DEFAULT_LANDING_CONTENT } from '@/store/authStore'
import { toast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'

export default function AdminLandingCMS() {
  const { landingContent, updateLandingContent } = useAuthStore()
  const [cmsData, setCmsData] = useState(landingContent)
  const [uploading, setUploading] = useState<'logo' | 'favicon' | 'hero' | null>(null)
  
  // Create refs outside of array
  const logoRef = useRef<HTMLInputElement>(null)
  const faviconRef = useRef<HTMLInputElement>(null)
  const heroRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setCmsData(landingContent)
  }, [landingContent])

  async function handleSave() {
     try {
       await updateLandingContent(cmsData)
       toast({ title: 'Konten Website Berhasil Disimpan', description: 'Perubahan akan langsung tampil di halaman depan.' })
     } catch (err: any) {
       toast({ title: 'Gagal Menyimpan', description: err.message, variant: 'destructive' })
     }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, target: 'logo' | 'favicon' | 'hero') {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Bukan Gambar', description: 'Silakan pilih file gambar.', variant: 'destructive' })
      return
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File Terlalu Besar', description: 'Maksimal ukuran gambar 2MB. Silakan kompres gambar terlebih dahulu.', variant: 'destructive' })
      e.target.value = ''
      return
    }

    setUploading(target)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${target}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `${target}/${fileName}`

      // Attempt Supabase Upload First
      const { error: uploadError } = await supabase.storage
        .from('landing-assets')
        .upload(filePath, file, { upsert: true })

      let resultUrl = ''

      if (!uploadError) {
        const { data } = supabase.storage.from('landing-assets').getPublicUrl(filePath)
        resultUrl = data.publicUrl
        toast({ title: '✅ Berhasil Upload', description: 'Gambar tersimpan di Cloud Storage Supabase.' })
      } else {
        // FALLBACK: Compress then convert to Base64
        resultUrl = await compressAndEncodeImage(file, target === 'hero' ? 0.7 : 0.9)
        if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
          toast({ title: '💾 Tersimpan Lokal', description: 'Bucket Cloud belum dibuat. Gambar disimpan sebagai data inline. Buat bucket "landing-assets" di Supabase untuk performa lebih baik.' })
        } else {
          toast({ title: '💾 Tersimpan Lokal', description: `Cloud: ${uploadError.message}. Gambar disimpan sebagai inline data.` })
        }
      }

      // Update local state and then auto-save to DB
      const updatedCmsData = await new Promise<typeof cmsData>((resolve) => {
        setCmsData(prev => {
          const next = { ...prev }
          if (target === 'hero') next.hero = { ...next.hero, imageUrl: resultUrl }
          else if (target === 'logo') next.branding = { ...next.branding, logoUrl: resultUrl }
          else if (target === 'favicon') next.branding = { ...next.branding, faviconUrl: resultUrl }
          resolve(next)
          return next
        })
      })

      // Auto-save to Supabase DB so changes persist immediately
      try {
        await updateLandingContent(updatedCmsData)
        toast({ title: '✅ Disimpan ke Database', description: 'Perubahan akan langsung tampil di halaman depan.' })
      } catch (saveErr: any) {
        toast({ title: '⚠️ Upload OK, Simpan Gagal', description: `Gambar berhasil diproses tapi gagal disimpan: ${saveErr.message}. Klik SIMPAN PERUBAHAN secara manual.`, variant: 'destructive' })
      }

    } catch (err: any) {
      toast({ title: 'Gagal Memproses Gambar', description: err.message, variant: 'destructive' })
    } finally {
      setUploading(null)
      // Reset input value so same file can be uploaded again if needed
      e.target.value = ''
    }
  }

  // Compress image and return as base64 data URL
  function compressAndEncodeImage(file: File, quality = 0.8): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const reader = new FileReader()
      reader.onload = (ev) => {
        img.onload = () => {
          const canvas = document.createElement('canvas')
          // Max dimension 800px for logos/favicons, 1200px for hero
          const maxDim = quality > 0.8 ? 800 : 1200
          let { width, height } = img
          if (width > maxDim || height > maxDim) {
            if (width > height) { height = Math.round(height * maxDim / width); width = maxDim }
            else { width = Math.round(width * maxDim / height); height = maxDim }
          }
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', quality))
        }
        img.onerror = reject
        img.src = ev.target?.result as string
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  return (
    <div className="space-y-6 sm:space-y-10 pb-20">
      {/* Header Sticky - Optimized for Mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 bg-slate-50/90 backdrop-blur-xl pt-4 pb-6 z-10 border-b border-navy/5">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl sm:text-3xl font-black text-navy tracking-tight">Editor Visual Web</h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium italic">Klik simpan untuk menerapkan ke propfs.id</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Button variant="outline" className="gap-2 h-14 px-6 text-sm font-bold border-red-200 text-red-600 hover:bg-red-50" onClick={() => setCmsData(DEFAULT_LANDING_CONTENT)}>
            <RefreshCw className="h-4 w-4" /> RESET KE DEFAULT
          </Button>
          <Button variant="gold" className="w-full sm:w-auto gap-3 h-14 px-8 text-lg font-black shadow-2xl shadow-gold/20 active:scale-95 transition-all" onClick={handleSave}>
            <Save className="h-5 w-5" /> SIMPAN PERUBAHAN
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-10 max-w-5xl">
        
        {/* Identitas Website - Full Width on Mobile */}
        <section className="bg-white border border-slate-100 rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 shadow-sm space-y-8">
          <div className="flex items-center gap-4 border-b border-slate-50 pb-6">
            <div className="w-12 h-12 bg-navy/5 text-navy rounded-2xl flex items-center justify-center">
               <Palette className="h-6 w-6" />
            </div>
            <div>
               <h3 className="text-xl font-black text-navy">Branding & Logo</h3>
               <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Identitas Dasar Situs</p>
            </div>
          </div>

          <div className="grid gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nama Situs / Judul Navbar</Label>
              <input className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 font-bold text-navy focus:ring-4 focus:ring-gold/10 transition-all" value={cmsData.branding.siteName} onChange={e => setCmsData({...cmsData, branding: {...cmsData.branding, siteName: e.target.value}})} />
            </div>
            
            <div className="grid sm:grid-cols-2 gap-6">
               <div className="space-y-2">
                 <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Tagline (Samping Logo)</Label>
                 <input className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 font-bold text-navy focus:ring-4 focus:ring-gold/10 transition-all" value={cmsData.branding.tagline} onChange={e => setCmsData({...cmsData, branding: {...cmsData.branding, tagline: e.target.value}})} />
               </div>
                <div className="space-y-4">
                  <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Logo Website (.png/.svg)</Label>
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    {cmsData.branding.logoUrl && (
                      <div className="w-16 h-16 bg-navy rounded-xl p-2 flex items-center justify-center border border-slate-200">
                        <img src={cmsData.branding.logoUrl} className="max-w-full max-h-full object-contain" alt="Logo Preview" />
                      </div>
                    )}
                    <div className="flex-1 w-full flex gap-2">
                       <input type="file" ref={logoRef} className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'logo')} />
                       <Button variant="outline" className="h-14 w-full bg-slate-50 border-none font-bold text-navy hover:bg-slate-100 flex items-center justify-between px-5 rounded-2xl" onClick={() => logoRef.current?.click()} disabled={uploading === 'logo'}>
                          {uploading === 'logo' ? <span className="flex gap-2 items-center"><Loader2 className="h-4 w-4 animate-spin"/> Uploading...</span> : <span className="truncate">{cmsData.branding.logoUrl ? 'Ganti Logo' : 'Pilih File Logo'}</span>}
                          <Upload className="h-4 w-4 ml-2 text-slate-400" />
                       </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Favicon (.ico/.png)</Label>
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    {cmsData.branding.faviconUrl && (
                      <div className="w-10 h-10 bg-white rounded-lg p-1 flex items-center justify-center border border-slate-200">
                        <img src={cmsData.branding.faviconUrl} className="w-full h-full object-contain" alt="Favicon Preview" />
                      </div>
                    )}
                    <div className="flex-1 w-full flex gap-2">
                       <input type="file" ref={faviconRef} className="hidden" accept="image/x-icon,image/png" onChange={(e) => handleFileUpload(e, 'favicon')} />
                       <Button variant="outline" className="h-14 w-full bg-slate-50 border-none font-bold text-navy hover:bg-slate-100 flex items-center justify-between px-5 rounded-2xl" onClick={() => faviconRef.current?.click()} disabled={uploading === 'favicon'}>
                          {uploading === 'favicon' ? <span className="flex gap-2 items-center"><Loader2 className="h-4 w-4 animate-spin"/> Uploading...</span> : <span className="truncate">{cmsData.branding.faviconUrl ? 'Ganti Favicon' : 'Pilih File Favicon'}</span>}
                          <Upload className="h-4 w-4 ml-2 text-slate-400" />
                       </Button>
                    </div>
                  </div>
                </div>
            </div>
          </div>
        </section>

        {/* Hero Section - Visual Editor */}
        <section className="bg-white border border-slate-100 rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 shadow-sm space-y-8">
          <div className="flex items-center gap-4 border-b border-slate-50 pb-6">
            <div className="w-12 h-12 bg-gold/10 text-gold rounded-2xl flex items-center justify-center">
               <ImageIcon className="h-6 w-6" />
            </div>
            <div>
               <h3 className="text-xl font-black text-navy">Banner Utama (Hero)</h3>
               <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Visual Utama Landing Page</p>
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Headline Utama (Emas Italic Otomatis)</Label>
              <textarea className="w-full min-h-[120px] bg-slate-50 border-none rounded-[28px] p-6 font-serif text-xl sm:text-2xl font-bold text-navy focus:ring-4 focus:ring-gold/10 transition-all" value={cmsData.hero.title} onChange={e => setCmsData({...cmsData, hero: {...cmsData.hero, title: e.target.value}})} />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Paragraf Deskripsi</Label>
              <textarea className="w-full min-h-[100px] bg-slate-50 border-none rounded-2xl p-6 text-sm font-medium text-slate-600 focus:ring-4 focus:ring-gold/10 transition-all" value={cmsData.hero.subtitle} onChange={e => setCmsData({...cmsData, hero: {...cmsData.hero, subtitle: e.target.value}})} />
            </div>

            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Gambar Banner (Preview Proyek)</Label>
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                 <div className="flex-1 w-full bg-slate-50 p-4 rounded-2xl border-2 border-dashed border-slate-200 text-center sm:text-left">
                    <p className="text-[10px] text-slate-400 mb-2 font-bold uppercase tracking-widest">File Path Aktif</p>
                    <code className="text-[10px] block truncate text-navy font-mono">{cmsData.hero.imageUrl || 'No image uploaded'}</code>
                 </div>
                 <input type="file" ref={heroRef} className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'hero')} />
                 <Button className="w-full sm:w-auto h-14 px-8 bg-navy text-white rounded-2xl font-bold flex gap-3 shadow-xl" onClick={() => heroRef.current?.click()} disabled={uploading === 'hero'}>
                    {uploading === 'hero' ? <Loader2 className="animate-spin h-5 w-5" /> : <Upload className="h-5 w-5" />}
                    UPLOAD FOTO BARU
                 </Button>
              </div>

              {cmsData.hero.imageUrl && (
                 <div className="relative group rounded-[32px] overflow-hidden border-4 border-slate-50 shadow-2xl">
                    <img src={cmsData.hero.imageUrl} className="w-full aspect-video object-cover" alt="Hero Preview" />
                    <div className="absolute inset-0 bg-navy/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                       <span className="text-white font-black text-lg tracking-widest">LIVE PREVIEW</span>
                    </div>
                 </div>
              )}
            </div>
          </div>
        </section>

        {/* Fitur & Modul - Grid of Cards */}
        <section className="space-y-6">
          <div className="flex items-center justify-between px-4 sm:px-0">
            <h3 className="text-xl font-black text-navy flex items-center gap-3">
              <List className="text-gold" /> Daftar Modul Utama
            </h3>
            <Button size="sm" variant="outline" className="rounded-xl border-navy hover:bg-navy hover:text-white transition-all font-bold" onClick={() => setCmsData({...cmsData, features: [...cmsData.features, {id: Math.random().toString(), title: 'Fitur Baru', desc: 'Deskripsi...', iconName: 'BarChart'}]})}>
              <Plus className="h-4 w-4 mr-1" /> TAMBAH BLOK
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {cmsData.features.map((ft, idx) => (
              <div key={ft.id} className="bg-white border border-slate-100 p-6 sm:p-8 rounded-[32px] relative group hover:shadow-2xl transition-all shadow-sm">
                <button className="absolute top-6 right-6 text-red-300 hover:text-red-500 transition-colors p-2" onClick={() => setCmsData({...cmsData, features: cmsData.features.filter((_, i) => i !== idx)})}>
                  <Trash2 className="h-5 w-5" />
                </button>
                <div className="space-y-4">
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center font-black text-xs">ICON</div>
                  <input className="w-full text-lg font-black text-navy bg-transparent border-b border-slate-100 focus:border-gold outline-none pb-1" value={ft.title} onChange={e => {
                    const fts = [...cmsData.features]; fts[idx].title = e.target.value; setCmsData({...cmsData, features: fts})
                  }} />
                  <textarea className="w-full text-xs font-medium text-slate-400 bg-transparent border-none p-0 focus:ring-0 resize-none min-h-[60px]" value={ft.desc} onChange={e => {
                    const fts = [...cmsData.features]; fts[idx].desc = e.target.value; setCmsData({...cmsData, features: fts})
                  }} />
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* Footer Settings */}
      <section className="bg-white border border-slate-100 rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 shadow-sm space-y-8 max-w-5xl mt-10">
        <div className="flex items-center gap-4 border-b border-slate-50 pb-6">
          <div className="w-12 h-12 bg-navy/5 text-navy rounded-2xl flex items-center justify-center">
             <Layout className="h-6 w-6" />
          </div>
          <div>
             <h3 className="text-xl font-black text-navy">Footer & Kontak</h3>
             <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Informasi di Bagian Bawah Web</p>
          </div>
        </div>

        <div className="grid gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Teks Copyright (gunakan {`{year}`} untuk tahun otomatis)</Label>
            <input className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 font-bold text-navy focus:ring-4 focus:ring-gold/10 transition-all" value={cmsData.footer?.copyrightText || ''} onChange={e => setCmsData({...cmsData, footer: {...(cmsData.footer || DEFAULT_LANDING_CONTENT.footer), copyrightText: e.target.value}})} />
          </div>
          
          <div className="grid sm:grid-cols-2 gap-6">
             <div className="space-y-2">
               <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Email Kontak</Label>
               <input className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 font-bold text-navy focus:ring-4 focus:ring-gold/10 transition-all" value={cmsData.footer?.email || ''} onChange={e => setCmsData({...cmsData, footer: {...(cmsData.footer || DEFAULT_LANDING_CONTENT.footer), email: e.target.value}})} />
             </div>
             <div className="space-y-2">
               <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Telepon</Label>
               <input className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 font-bold text-navy focus:ring-4 focus:ring-gold/10 transition-all" value={cmsData.footer?.phone || ''} onChange={e => setCmsData({...cmsData, footer: {...(cmsData.footer || DEFAULT_LANDING_CONTENT.footer), phone: e.target.value}})} />
             </div>
             <div className="space-y-2">
               <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Alamat Lengkap</Label>
               <input className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 font-bold text-navy focus:ring-4 focus:ring-gold/10 transition-all" value={cmsData.footer?.address || ''} onChange={e => setCmsData({...cmsData, footer: {...(cmsData.footer || DEFAULT_LANDING_CONTENT.footer), address: e.target.value}})} />
             </div>
             <div className="space-y-2">
               <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Link WhatsApp (https://wa.me/...)</Label>
               <input className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 font-bold text-navy focus:ring-4 focus:ring-gold/10 transition-all" value={cmsData.footer?.whatsappUrl || ''} onChange={e => setCmsData({...cmsData, footer: {...(cmsData.footer || DEFAULT_LANDING_CONTENT.footer), whatsappUrl: e.target.value}})} />
             </div>
          </div>
        </div>
      </section>

    </div>
  )
}
