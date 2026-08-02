// ============================================================
// MARCOM — dari foto proyek menjadi materi promosi siap posting.
//
// Alurnya sengaja satu arah dan pendek, karena yang mengerjakannya biasanya
// orang lapangan di sela pekerjaan, bukan desainer di depan komputer:
//
//   pilih foto → (opsional) rapikan AI → pilih format → tulis caption → unduh
//
// Logo dan nomor kontak TIDAK pernah diketik di halaman ini. Keduanya diambil
// dari Profil Perusahaan yang sudah dipakai kop laporan dan PDF, supaya nomor
// yang berubah tidak menyisakan postingan lama yang menyesatkan.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Image as ImageIcon, Sparkles, Loader2, Download, Copy, Check, Trash2,
  Video, Wand2, AlertTriangle, Settings, Share2, RefreshCw,
} from 'lucide-react'
import KontraktorHeader from '@/components/cost/KontraktorHeader'
import { useToast } from '@/hooks/use-toast'
import { useCostStore } from '@/store/costStore'
import { brandingApi, getBrandingCache, type CompanyProfile } from '@/lib/branding'
import { downscaleImage } from '@/lib/imageUtil'
import {
  FORMAT_MARCOM, URUTAN_FORMAT, TEMPLATE_MARCOM, URUTAN_TEMPLATE,
  susunCaption, periksaProfil, namaBerkas,
  durasiVideo, DURASI_PER_FOTO, CTA_BAWAAN, bersihkanHashtag,
  type FormatMarcom, type TemplateMarcom,
} from '@/lib/marcom'
import {
  buatCaption, captionNaskah, rapikanFoto, GAYA_CAPTION, type GayaCaption,
} from '@/lib/marcomAi'
import {
  komposisiGambar, buatVideo, dukunganVideo, unduh, keFile, bagikan,
} from '@/lib/marcomRender'
import { subSah } from '@/lib/posisiKerja'

type Sub = 'gambar' | 'video'
const SUB_SAH: readonly Sub[] = ['gambar', 'video']

interface Foto {
  id: string
  asli: string
  /** Hasil perapian AI bila ada; yang dipakai untuk komposisi. */
  dipakai: string
  rapi: boolean
  sedangRapi: boolean
}

const acakId = () => Math.random().toString(36).slice(2, 10)

export default function MarcomPage() {
  const { toast } = useToast()
  const { projectInfo, savedProjects } = useCostStore()

  const [params, setParams] = useSearchParams()
  const [sub, setSub] = useState<Sub>(() => subSah(params.get('sub'), SUB_SAH, 'gambar'))
  useEffect(() => {
    if (params.get('sub') === sub) return
    const q = new URLSearchParams(params)
    q.set('sub', sub)
    setParams(q, { replace: true })
  }, [sub]) // eslint-disable-line react-hooks/exhaustive-deps

  const [profil, setProfil] = useState<CompanyProfile>(() => getBrandingCache())
  useEffect(() => {
    void brandingApi().load().then(setProfil).catch(() => { /* cache sudah dipakai */ })
  }, [])

  const [foto, setFoto] = useState<Foto[]>([])
  const [format, setFormat] = useState<FormatMarcom>('feed')
  const [template, setTemplate] = useState<TemplateMarcom>('sorot')
  const [tagline, setTagline] = useState('')
  const [lingkup, setLingkup] = useState('')
  const [gaya, setGaya] = useState<GayaCaption>('progres')
  const [catatan, setCatatan] = useState('')
  const [caption, setCaption] = useState('')
  const [hashtag, setHashtag] = useState('')
  const [cta, setCta] = useState(CTA_BAWAAN)
  const [sumberCaption, setSumberCaption] = useState<'ai' | 'naskah' | null>(null)
  const [menulis, setMenulis] = useState(false)

  const [pratinjau, setPratinjau] = useState('')
  const [menyusun, setMenyusun] = useState(false)
  const [merekam, setMerekam] = useState(false)
  const [majuVideo, setMajuVideo] = useState(0)
  const [tersalin, setTersalin] = useState(false)
  const berkasRef = useRef<HTMLInputElement>(null)

  const namaProyek = projectInfo?.projectName || savedProjects[0]?.info.projectName || ''
  const lokasi = projectInfo?.location || savedProjects[0]?.info.location || ''
  const jenis = projectInfo?.type || ''

  const cekProfil = useMemo(() => periksaProfil(profil), [profil])
  const dukungan = useMemo(() => dukunganVideo(), [])

  const konteks = useMemo(() => ({
    gaya, namaProyek, lokasi, jenis, catatan, profil,
    fotoDataUrl: foto[0]?.dipakai ?? null,
  }), [gaya, namaProyek, lokasi, jenis, catatan, profil, foto])

  const captionPenuh = useMemo(
    () => susunCaption({ teks: caption, cta, hashtag, profil }),
    [caption, cta, hashtag, profil],
  )

  // ── Foto ──────────────────────────────────────────────────────────────────
  async function tambahFoto(files: FileList | null) {
    if (!files?.length) return
    const baru: Foto[] = []
    for (const f of Array.from(files).slice(0, 10)) {
      if (!f.type.startsWith('image/')) continue
      try {
        // Dikecilkan dulu: foto HP 12 MP dikirim utuh ke AI hanya memperlambat
        // tanpa menambah kualitas hasil akhir yang cuma 1080 px.
        const kecil = await downscaleImage(f, 1600, 0.85)
        baru.push({ id: acakId(), asli: kecil, dipakai: kecil, rapi: false, sedangRapi: false })
      } catch {
        toast({ title: `Gagal membaca ${f.name}`, variant: 'destructive' })
      }
    }
    if (baru.length) setFoto(f => [...f, ...baru].slice(0, 10))
    if (berkasRef.current) berkasRef.current.value = ''
  }

  async function rapikan(id: string) {
    const target = foto.find(f => f.id === id)
    if (!target) return
    setFoto(f => f.map(x => x.id === id ? { ...x, sedangRapi: true } : x))
    const hasil = await rapikanFoto(target.asli)
    setFoto(f => f.map(x => x.id === id
      ? { ...x, dipakai: hasil.dataUrl, rapi: hasil.sumber === 'ai', sedangRapi: false }
      : x))
    if (hasil.sumber !== 'ai') {
      toast({ title: 'Foto dipakai apa adanya', description: hasil.alasan, variant: 'destructive' })
    }
  }

  function kembalikanAsli(id: string) {
    setFoto(f => f.map(x => x.id === id ? { ...x, dipakai: x.asli, rapi: false } : x))
  }

  // ── Caption ───────────────────────────────────────────────────────────────
  async function tulisCaption() {
    setMenulis(true)
    try {
      const h = await buatCaption(konteks)
      setCaption(h.teks)
      setHashtag(h.hashtag.join(' '))
      setSumberCaption(h.sumber)
      if (h.sumber === 'naskah') {
        toast({
          title: 'Caption dari naskah bawaan',
          description: 'AI tidak tersedia saat ini. Silakan sunting sesuai kebutuhan.',
        })
      }
    } finally { setMenulis(false) }
  }

  // Isi caption sekali di awal supaya kolomnya tidak menyambut dengan halaman
  // kosong — orang lebih mudah menyunting daripada memulai dari nol.
  useEffect(() => {
    if (caption) return
    const n = captionNaskah({ gaya, namaProyek, lokasi, jenis, catatan, profil })
    setCaption(n.teks)
    setHashtag(n.hashtag.join(' '))
    setSumberCaption('naskah')
  }, [gaya]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Komposisi ─────────────────────────────────────────────────────────────
  const susun = useCallback(async () => {
    if (!foto.length) { setPratinjau(''); return }
    setMenyusun(true)
    try {
      const url = await komposisiGambar({
        fotoDataUrl: foto[0].dipakai,
        format,
        template,
        profil,
        judul: namaProyek,
        keterangan: lokasi || GAYA_CAPTION[gaya].label,
        lingkup,
        tagline,
      })
      setPratinjau(url)
    } catch (e) {
      toast({ title: 'Gagal menyusun gambar', description: (e as Error).message, variant: 'destructive' })
    } finally { setMenyusun(false) }
  }, [foto, format, template, profil, namaProyek, lokasi, gaya, lingkup, tagline]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void susun() }, [susun])

  function unduhGambar() {
    if (!pratinjau) return
    unduh(pratinjau, namaBerkas(namaProyek || 'promosi', format, 'png'))
  }

  async function bagikanGambar() {
    if (!pratinjau) return
    const nama = namaBerkas(namaProyek || 'promosi', format, 'png')
    const berhasil = await bagikan([await keFile(pratinjau, nama)], captionPenuh)
    if (!berhasil) unduhGambar()
  }

  async function rekamVideo() {
    setMerekam(true)
    setMajuVideo(0)
    try {
      const hasil = await buatVideo({
        fotoDataUrls: foto.map(f => f.dipakai),
        format,
        template,
        profil,
        judul: namaProyek,
        keterangan: lokasi || GAYA_CAPTION[gaya].label,
        lingkup,
        tagline,
        onProgress: setMajuVideo,
      })
      unduh(hasil.blob, namaBerkas(namaProyek || 'promosi', format, hasil.ext))
      toast({
        title: `Video ${hasil.ext.toUpperCase()} tersimpan`,
        description: hasil.mp4
          ? 'Siap diunggah ke Instagram, TikTok, & WhatsApp.'
          : 'Peramban ini menghasilkan WebM — bisa diunggah dari komputer, tetapi aplikasi IG/TikTok di HP umumnya menolaknya.',
      })
    } catch (e) {
      toast({ title: 'Video gagal dibuat', description: (e as Error).message, variant: 'destructive' })
    } finally { setMerekam(false) }
  }

  async function salinCaption() {
    try {
      await navigator.clipboard.writeText(captionPenuh)
      setTersalin(true)
      setTimeout(() => setTersalin(false), 2000)
    } catch {
      toast({ title: 'Tidak bisa menyalin otomatis', description: 'Silakan blok teksnya lalu salin manual.' })
    }
  }

  const detikVideo = Math.round(durasiVideo(foto.length, DURASI_PER_FOTO) / 1000)

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      <KontraktorHeader judul="Marcom" subjudul="Foto proyek jadi materi promosi" kembaliKe="/kontraktor" />

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">

        {/* ── Profil belum lengkap: sebut apa yang kurang & di mana mengisinya ── */}
        {!cekProfil.siap && (
          <div data-marcom="profil-kurang" className="rounded-2xl bg-amber-50 border border-amber-300 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="min-w-0 text-xs">
              <p className="font-bold text-navy">Profil perusahaan belum lengkap</p>
              <p className="text-amber-900/80 leading-relaxed mt-0.5">
                Belum diisi: <b>{cekProfil.kurang.join(', ')}</b>. Logo dan nomor kontak di materi
                promosi diambil dari sana, bukan diketik di sini — supaya nomor yang berubah tidak
                menyisakan postingan lama yang salah.
              </p>
              <a href="/cost-control?tab=settings"
                className="inline-flex items-center gap-1.5 mt-2 font-bold text-navy hover:underline">
                <Settings className="w-3.5 h-3.5" /> Isi di Pengaturan → Profil Perusahaan
              </a>
            </div>
          </div>
        )}

        {/* ── Sub-tab ── */}
        <div className="flex gap-2">
          {([['gambar', 'Gambar', ImageIcon], ['video', 'Video', Video]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setSub(key)}
              className={`flex-1 h-11 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                sub === key ? 'bg-navy text-white' : 'bg-white text-muted-foreground border border-border'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* ── 1. Foto ── */}
        <section className="rounded-2xl bg-white border border-border p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-navy">1. Foto proyek</h2>
            <span className="text-[11px] text-muted-foreground">{foto.length}/10</span>
          </div>

          <input ref={berkasRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => void tambahFoto(e.target.files)} />
          <button onClick={() => berkasRef.current?.click()}
            className="w-full h-12 rounded-xl border-2 border-dashed border-border text-xs font-bold text-muted-foreground hover:border-gold hover:text-navy transition flex items-center justify-center gap-2">
            <ImageIcon className="w-4 h-4" /> Pilih foto dari galeri
          </button>

          {foto.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {foto.map((f, i) => (
                <div key={f.id} className="relative rounded-xl overflow-hidden border border-border aspect-square">
                  <img src={f.dipakai} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                  {i === 0 && (
                    <span className="absolute top-1 left-1 text-[8px] font-black uppercase bg-gold text-navy px-1.5 py-0.5 rounded-full">
                      Utama
                    </span>
                  )}
                  {f.rapi && (
                    <span className="absolute top-1 right-1 text-[8px] font-black uppercase bg-violet-600 text-white px-1.5 py-0.5 rounded-full">
                      AI
                    </span>
                  )}
                  <div className="absolute bottom-0 inset-x-0 flex">
                    <button onClick={() => f.rapi ? kembalikanAsli(f.id) : void rapikan(f.id)}
                      disabled={f.sedangRapi}
                      title={f.rapi ? 'Kembalikan foto asli' : 'Rapikan pencahayaan & warna dengan AI'}
                      className="flex-1 h-7 bg-navy/80 text-white text-[9px] font-bold flex items-center justify-center gap-1 disabled:opacity-60">
                      {f.sedangRapi
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : f.rapi ? <RefreshCw className="w-3 h-3" /> : <Wand2 className="w-3 h-3" />}
                      {f.sedangRapi ? '…' : f.rapi ? 'Asli' : 'Rapikan'}
                    </button>
                    <button onClick={() => setFoto(x => x.filter(y => y.id !== f.id))}
                      className="w-8 h-7 bg-red-600/85 text-white flex items-center justify-center">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {foto.length > 0 && (
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              AI hanya memperbaiki pencahayaan &amp; warna. Bangunannya tidak diubah — foto proyek
              yang &quot;dipercantik&quot; sampai berbeda dari kenyataan akan ditagih pemiliknya nanti.
            </p>
          )}
        </section>

        {/* ── 2. Tampilan ── */}
        <section className="rounded-2xl bg-white border border-border p-4 space-y-3">
          <h2 className="text-sm font-bold text-navy">2. Tampilan</h2>

          <div className="grid grid-cols-2 gap-2">
            {URUTAN_TEMPLATE.map(tm => (
              <button key={tm} onClick={() => setTemplate(tm)}
                data-template={tm}
                className={`rounded-xl border p-2.5 text-left transition ${
                  template === tm ? 'border-gold bg-gold-lt' : 'border-border bg-white hover:border-gold/40'}`}>
                <p className="text-[11px] font-black text-navy">{TEMPLATE_MARCOM[tm].label}</p>
                <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{TEMPLATE_MARCOM[tm].untuk}</p>
              </button>
            ))}
          </div>

          <input value={lingkup} onChange={e => setLingkup(e.target.value)}
            aria-label="Lingkup pekerjaan"
            placeholder="Lingkup pekerjaan — mis. Civil, Arsitektur & MEP"
            className="w-full h-10 rounded-xl border border-border px-3 text-xs" />
          <input value={tagline} onChange={e => setTagline(e.target.value)}
            aria-label="Semboyan di bawah logo"
            placeholder="Semboyan di bawah logo — mis. Build Smart, Live Better"
            className="w-full h-10 rounded-xl border border-border px-3 text-xs" />

          <div className="grid grid-cols-3 gap-2">
            {URUTAN_FORMAT.map(f => (
              <button key={f} onClick={() => setFormat(f)}
                className={`rounded-xl border p-2.5 text-left transition ${
                  format === f ? 'border-gold bg-gold-lt' : 'border-border bg-white hover:border-gold/40'}`}>
                <p className="text-[11px] font-black text-navy">{FORMAT_MARCOM[f].label}</p>
                <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{FORMAT_MARCOM[f].untuk}</p>
              </button>
            ))}
          </div>
        </section>

        {/* ── 3. Pratinjau ── */}
        <section className="rounded-2xl bg-white border border-border p-4 space-y-3">
          <h2 className="text-sm font-bold text-navy">3. Hasil</h2>
          {!foto.length ? (
            <p className="py-10 text-center text-xs text-muted-foreground italic">
              Pilih foto dulu untuk melihat hasilnya.
            </p>
          ) : (
            <>
              <div className="relative rounded-xl overflow-hidden bg-navy/5 flex items-center justify-center min-h-[180px]">
                {menyusun && (
                  <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
                    <Loader2 className="w-6 h-6 animate-spin text-navy" />
                  </div>
                )}
                {pratinjau && (
                  <img data-marcom="pratinjau" src={pratinjau} alt="Pratinjau materi promosi"
                    className="max-h-[420px] w-auto max-w-full object-contain" />
                )}
              </div>

              {sub === 'gambar' ? (
                <div className="flex gap-2">
                  <button onClick={unduhGambar} disabled={!pratinjau}
                    className="flex-1 h-11 rounded-xl bg-navy text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                    <Download className="w-4 h-4" /> Unduh Gambar
                  </button>
                  <button onClick={() => void bagikanGambar()} disabled={!pratinjau}
                    title="Bagikan ke aplikasi lain"
                    className="w-12 h-11 rounded-xl bg-gold text-navy flex items-center justify-center disabled:opacity-50">
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {foto.length} foto → video <b>{detikVideo} detik</b>. Perekaman berjalan sewaktu-nyata,
                    jadi memakan waktu yang sama — jangan tutup halaman ini.
                  </p>
                  {!dukungan.mp4 && (
                    <p data-marcom="catatan-video" className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-relaxed">
                      {dukungan.catatan}
                    </p>
                  )}
                  <button onClick={() => void rekamVideo()} disabled={merekam || !dukungan.bisa || !foto.length}
                    className="w-full h-11 rounded-xl bg-navy text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                    {merekam ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                    {merekam ? `Merekam… ${majuVideo}%` : `Buat Video (${detikVideo} dtk)`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── 4. Caption ── */}
        <section className="rounded-2xl bg-white border border-border p-4 space-y-3">
          <h2 className="text-sm font-bold text-navy">4. Caption</h2>

          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(GAYA_CAPTION) as GayaCaption[]).map(g => (
              <button key={g} onClick={() => setGaya(g)}
                className={`h-9 rounded-lg text-[11px] font-bold transition ${
                  gaya === g ? 'bg-navy text-white' : 'bg-slate-100 text-muted-foreground'}`}>
                {GAYA_CAPTION[g].label}
              </button>
            ))}
          </div>

          <input value={catatan} onChange={e => setCatatan(e.target.value)}
            placeholder="Catatan untuk AI — mis. pengecoran lantai 2 selesai"
            className="w-full h-11 rounded-xl border border-border px-3 text-xs" />

          <button onClick={() => void tulisCaption()} disabled={menulis}
            className="w-full h-11 rounded-xl bg-gold text-navy text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50">
            {menulis ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {menulis ? 'Menulis…' : 'Tulis Caption dengan AI'}
          </button>

          <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={5}
            aria-label="Isi caption"
            className="w-full rounded-xl border border-border p-3 text-xs leading-relaxed" />

          <input value={hashtag} onChange={e => setHashtag(e.target.value)}
            aria-label="Hashtag"
            placeholder="Hashtag, pisahkan dengan spasi"
            className="w-full h-10 rounded-xl border border-border px-3 text-xs" />
          <input value={cta} onChange={e => setCta(e.target.value)}
            aria-label="Ajakan bertindak"
            className="w-full h-10 rounded-xl border border-border px-3 text-xs" />

          {sumberCaption && (
            <p className="text-[10px] text-muted-foreground">
              {sumberCaption === 'ai' ? 'Ditulis AI dari foto & data proyek.' : 'Dari naskah bawaan — silakan disunting.'}
              {' '}Hashtag terbaca: {bersihkanHashtag(hashtag).length}.
            </p>
          )}

          <div className="rounded-xl bg-slate-50 border border-border p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Caption siap tempel
            </p>
            <pre data-marcom="caption" className="text-[11px] text-navy whitespace-pre-wrap font-sans leading-relaxed">
              {captionPenuh || '—'}
            </pre>
          </div>

          <button onClick={() => void salinCaption()} disabled={!captionPenuh}
            className="w-full h-11 rounded-xl border border-navy text-navy text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {tersalin ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            {tersalin ? 'Tersalin' : 'Salin Caption'}
          </button>
        </section>
      </div>
    </div>
  )
}
