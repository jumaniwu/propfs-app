import { useState, useEffect } from 'react'
import { Save, Image as ImageIcon, Layout, List, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/hooks/use-toast'

export default function AdminLandingCMS() {
  const { landingContent, updateLandingContent } = useAuthStore()
  const [cmsData, setCmsData] = useState(landingContent)

  useEffect(() => {
    setCmsData(landingContent)
  }, [landingContent])

  async function handleSave() {
     try {
       await updateLandingContent(cmsData)
       toast({ title: 'Konten Website Berhasil Disimpan', description: 'Perubahan akan langsung tampil di halaman depan.' })
     } catch {
       toast({ title: 'Gagal Menyimpan', variant: 'destructive' })
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
            <div className="grid md:grid-cols-2 gap-5">
               <div className="space-y-1.5 flex flex-col">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Kumpulan Tag (Pisahkan ,)</label>
                  <input className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 focus:bg-white focus:ring-1 focus:ring-gold transition-colors text-sm" value={cmsData.hero.hashtags.join(', ')} onChange={e => setCmsData({...cmsData, hero: {...cmsData.hero, hashtags: e.target.value.split(',').map(s => s.trim())}})} />
               </div>
               <div className="space-y-1.5 flex flex-col">
                 <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Gambar Ornamen (URL)</label>
                 <input className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 focus:bg-white focus:ring-1 focus:ring-gold transition-colors font-mono text-sm" value={cmsData.hero.imageUrl} onChange={e => setCmsData({...cmsData, hero: {...cmsData.hero, imageUrl: e.target.value}})} />
               </div>
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
