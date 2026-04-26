import { useState, useEffect, useRef } from 'react'
import { Save, Image as ImageIcon, Layout, List, Plus, Trash2, Upload, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'

export default function AdminLandingCMS() {
  const { landingContent, updateLandingContent } = useAuthStore()
  const [cmsData, setCmsData] = useState(landingContent)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // 1. Validasi File
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Bukan Gambar', description: 'Silakan pilih file gambar (JPG, PNG, WEBP).', variant: 'destructive' })
      return
    }

    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `hero_${Math.random()}.${fileExt}`
      const filePath = `hero/${fileName}`

      // 2. Upload ke Supabase Storage (Bucket: landing-assets)
      const { error: uploadError } = await supabase.storage
        .from('landing-assets')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // 3. Dapatkan Public URL
      const { data } = supabase.storage
        .from('landing-assets')
        .getPublicUrl(filePath)

      // 4. Update State
      setCmsData({
        ...cmsData,
        hero: {
          ...cmsData.hero,
          imageUrl: data.publicUrl
        }
      })

      toast({ title: 'Berhasil Upload', description: 'Gambar baru telah diunggah.' })
    } catch (err: any) {
      console.error(err)
      toast({ title: 'Gagal Upload', description: 'Pastikan bucket "landing-assets" sudah dibuat dan publik.', variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 bg-slate-50/80 backdrop-blur-md pt-2 pb-4 z-10 border-b border-border/50">
        <div>
          <h2 className="font-serif text-2xl font-bold text-navy">Editor Konten Website</h2>
          <p className="text-sm text-muted-foreground mt-1">Sesuaikan banner, fitur, dan informasi di Website Perkenalan (Landing Page) tanpa koding.</p>
        </div>
        <Button variant="gold" className="gap-2 shadow-lg shadow-gold/20 h-11 px-8 font-bold" onClick={handleSave}>
          <Save className="h-4 w-4" /> Simpan Perubahan Web
        </Button>
      </div>

      <div className="space-y-10 max-w-5xl">
        {/* Identitas Website */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-2">
            <h3 className="font-bold text-lg flex items-center gap-2 text-navy"><ImageIcon className="h-5 w-5 text-gold" /> Identitas & Logo</h3>
            <p className="text-xs text-muted-foreground leading-relaxed pr-6">Ubah logo dan identitas dasar situs yang muncul di pojok kiri atas dan footer Website.</p>
          </div>
          <div className="lg:col-span-2 bg-card border border-border shadow-sm rounded-2xl p-6 md:p-8 space-y-5">
            <div className="space-y-1.5 flex flex-col">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Kop / Nama Situs</label>
              <input className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 focus:bg-white focus:ring-1 focus:ring-gold transition-colors" value={cmsData.branding.siteName} onChange={e => setCmsData({...cmsData, branding: {...cmsData.branding, siteName: e.target.value}})} />
            </div>
            <div className="space-y-1.5 flex flex-col">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Tagline Pendek (Samping Logo)</label>
              <input className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 focus:bg-white focus:ring-1 focus:ring-gold transition-colors" value={cmsData.branding.tagline} onChange={e => setCmsData({...cmsData, branding: {...cmsData.branding, tagline: e.target.value}})} />
            </div>
            <div className="space-y-1.5 flex flex-col">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Link Gambar Logo (URL HTTPS)</label>
              <input className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 focus:bg-white focus:ring-1 focus:ring-gold transition-colors font-mono text-sm" value={cmsData.branding.logoUrl} placeholder="https://domain.com/logo.png" onChange={e => setCmsData({...cmsData, branding: {...cmsData.branding, logoUrl: e.target.value}})} />
            </div>
          </div>
        </div>

        <hr className="border-border/60" />

        {/* Banner / Hero Section */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-2">
            <h3 className="font-bold text-lg flex items-center gap-2 text-navy"><Layout className="h-5 w-5 text-gold" /> Banner Splash</h3>
            <p className="text-xs text-muted-foreground leading-relaxed pr-6">Mengatur kalimat pembuka utama (Headline) yang langsung dilihat pengunjung saat pertama kali klik halaman web.</p>
          </div>
          <div className="lg:col-span-2 bg-card border border-border shadow-sm rounded-2xl p-6 md:p-8 space-y-5">
            <div className="space-y-1.5 flex flex-col">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Judul Headline Raksasa</label>
              <textarea className="w-full bg-muted/50 border border-border/50 rounded-xl p-4 min-h-[100px] focus:bg-white focus:ring-1 focus:ring-gold transition-colors text-lg font-serif" value={cmsData.hero.title} onChange={e => setCmsData({...cmsData, hero: {...cmsData.hero, title: e.target.value}})} />
            </div>
            <div className="space-y-1.5 flex flex-col">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Paragraf Sub-headline (Deskripsi)</label>
              <textarea className="w-full bg-muted/50 border border-border/50 rounded-xl p-4 min-h-[80px] focus:bg-white focus:ring-1 focus:ring-gold transition-colors text-sm" value={cmsData.hero.subtitle} onChange={e => setCmsData({...cmsData, hero: {...cmsData.hero, subtitle: e.target.value}})} />
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1.5 flex flex-col">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Hero Image (Dashboard Preview)</label>
                <div className="flex gap-4 items-start">
                   <div className="flex-1 space-y-2">
                      <input className="w-full h-11 bg-muted/50 border border-border/50 rounded-xl px-4 focus:bg-white focus:ring-1 focus:ring-gold transition-colors font-mono text-[10px]" value={cmsData.hero.imageUrl} readOnly />
                      <p className="text-[9px] text-muted-foreground italic ml-1">*Upload file menggunakan tombol di samping.</p>
                   </div>
                   <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                   <Button variant="outline" className="h-11 px-5 gap-2 border-dashed border-2 hover:border-gold hover:text-gold" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Upload Foto
                   </Button>
                </div>
              </div>

              {cmsData.hero.imageUrl && (
                 <div className="relative aspect-video rounded-2xl overflow-hidden border border-border bg-slate-100 group">
                    <img src={cmsData.hero.imageUrl} className="w-full h-full object-cover" alt="Preview Hero" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                       <span className="text-white text-xs font-bold">Image Preview</span>
                    </div>
                 </div>
              )}
            </div>

            <div className="space-y-1.5 flex flex-col">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Kumpulan Tag (Pisahkan ,)</label>
                <input className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 focus:bg-white focus:ring-1 focus:ring-gold transition-colors text-sm" value={cmsData.hero.hashtags.join(', ')} onChange={e => setCmsData({...cmsData, hero: {...cmsData.hero, hashtags: e.target.value.split(',').map(s => s.trim())}})} />
            </div>
          </div>
        </div>

        <hr className="border-border/60" />

        {/* Suitable For Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-2">
            <h3 className="font-bold text-lg flex items-center gap-2 text-navy"><List className="h-5 w-5 text-gold" /> Aksen "Cocok Untuk"</h3>
            <p className="text-xs text-muted-foreground leading-relaxed pr-6">Pita target audiens (Ribbon emas horizontally scrollable) yang berada di bawah section banner.</p>
          </div>
          <div className="lg:col-span-2 bg-card border border-border shadow-sm rounded-2xl p-6 md:p-8 space-y-5">
            <div className="grid md:grid-cols-2 gap-5">
               <div className="space-y-1.5 flex flex-col">
                 <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Label Awalan (Italic Emas)</label>
                 <input className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 focus:bg-white focus:ring-1 focus:ring-gold transition-colors" value={cmsData.suitableFor.label} onChange={e => setCmsData({...cmsData, suitableFor: {...cmsData.suitableFor, label: e.target.value}})} />
               </div>
               <div className="space-y-1.5 flex flex-col">
                 <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Deretan Peran (Pisahkan ,)</label>
                 <input className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 focus:bg-white focus:ring-1 focus:ring-gold transition-colors text-sm" value={cmsData.suitableFor.tags.join(', ')} onChange={e => setCmsData({...cmsData, suitableFor: {...cmsData.suitableFor, tags: e.target.value.split(',').map(s => s.trim())}})} />
               </div>
            </div>
          </div>
        </div>

        <hr className="border-border/60" />

        {/* Fitur Utama Editor */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
               <h3 className="font-bold text-lg flex items-center gap-2 text-navy"><List className="h-5 w-5 text-gold" /> Konfigurasi Modul & Penawaran Fitur</h3>
               <p className="text-xs text-muted-foreground">Kartu-kartu kotak penjelasan yang menjabarkan kapabilitas sistem CMS Anda kepada publik.</p>
            </div>
            <Button size="sm" variant="outline" className="gap-1 border-navy/20 hover:bg-navy hover:text-white" onClick={() => setCmsData({...cmsData, features: [...cmsData.features, {id: Math.random().toString(), title: 'Judul Fitur Baru', desc: 'Deskripsi pendek tentang modul ini...', iconName: 'BarChart'}]})}>
              <Plus className="h-4 w-4" /> Tambah Blok Fitur
            </Button>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            {cmsData.features.map((ft, idx) => (
              <div key={ft.id} className="p-6 bg-card border-2 border-border/60 rounded-2xl relative group hover:border-gold/30 transition-colors shadow-sm cursor-text">
                <button className="absolute top-4 right-4 text-destructive/40 hover:text-destructive hover:bg-destructive/10 p-2 rounded-lg transition-all" onClick={() => setCmsData({...cmsData, features: cmsData.features.filter((_, i) => i !== idx)})}>
                  <Trash2 className="h-4 w-4" />
                </button>
                <div className="flex gap-4 w-full">
                  <div className="w-12 h-12 bg-navy/5 text-navy rounded-xl flex items-center justify-center font-bold text-xs shrink-0 self-start">Ikon</div>
                  <div className="space-y-2 flex-1 pr-6">
                    <input className="w-full font-bold bg-transparent border-b border-border/50 pb-1 mb-1 focus:border-gold focus:outline-none transition-colors" value={ft.title} placeholder="Judul Modul" onChange={e => {
                      const fts = [...cmsData.features]; fts[idx].title = e.target.value; setCmsData({...cmsData, features: fts})
                    }} />
                    <textarea className="w-full text-sm text-muted-foreground bg-transparent border-none p-0 focus:ring-0 resize-none min-h-[60px]" placeholder="Penjelasan singkat modul ini untuk prospek..." value={ft.desc} onChange={e => {
                      const fts = [...cmsData.features]; fts[idx].desc = e.target.value; setCmsData({...cmsData, features: fts})
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
