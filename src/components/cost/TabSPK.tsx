// ============================================================
// Tab SPK — Kontraktor AI
// Surat Perintah Kerja ala kontrak: pihak pertama (pemberi kerja) &
// pihak kedua (pelaksana/vendor), pasal yang bisa diedit, tanda tangan
// digital dua pihak, kirim link WhatsApp/Email, cetak PDF.
// ============================================================
import { useEffect, useState } from 'react'
import {
  FileSignature, Plus, Trash2, Link2, Loader2, RefreshCw, Send,
  Mail, FileDown, CheckCircle2, Clock, Pencil, PenLine, RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Paperclip, FileText, X } from 'lucide-react'
import { useRef } from 'react'
import NumInput from '@/components/siteplan/NumInput'
import SignaturePad from '@/components/cost/SignaturePad'
import { useCostStore } from '@/store/costStore'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/use-toast'
import {
  spkApi, spkSignLink, waShareLink, nomorSpkOtomatis, pasalTemplate,
  type SpkDoc, type SpkLingkupItem, type SpkTermin, type SpkPasal, type SpkJenis,
} from '@/lib/spkApi'
import { downloadSpkPdf } from '@/lib/spkPdf'

const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

const STATUS_BADGE: Record<SpkDoc['status'], string> = {
  draft: 'bg-slate-100 text-slate-600',
  terkirim: 'bg-amber-100 text-amber-700',
  ditandatangani: 'bg-emerald-100 text-emerald-700',
}

export default function TabSPK() {
  const { toast } = useToast()
  const { projectInfo } = useCostStore()
  const { profile } = useAuthStore()
  const [docs, setDocs] = useState<SpkDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [jenis, setJenis] = useState<SpkJenis>('vendor')
  const [editDoc, setEditDoc] = useState<SpkDoc | null>(null)
  const [signPemberi, setSignPemberi] = useState<SpkDoc | null>(null)

  const load = () => {
    setLoading(true)
    setError('')
    spkApi().listSpk()
      .then(setDocs)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pesanWa = (spk: SpkDoc) => {
    const link = spkSignLink(spk.sign_token)
    const jenisDoc = (spk.pihak_kedua_peran || '').toLowerCase() === 'konsumen'
      ? 'Surat Perjanjian / Pemesanan' : 'Surat Perintah Kerja'
    return `Selamat siang Bapak/Ibu *${spk.vendor_name}*.\n\nKami menerbitkan ${jenisDoc}:\n📄 ${spk.nomor}${spk.project_name ? `\n🏗️ ${spk.project_name}` : ''}\n💰 Nilai: ${fmt(spk.nilai_kontrak)}\n\nMohon baca & tanda tangani secara digital lewat link berikut (buka dari HP, tanda tangan pakai jari):\n👉 ${link}\n\nTerima kasih.`
  }

  async function tandaiTerkirim(spk: SpkDoc) {
    if (spk.status === 'draft') {
      try { await spkApi().updateSpkStatus(spk.id, 'terkirim'); load() } catch { /* abaikan */ }
    }
  }

  const kirimWa = (spk: SpkDoc) => {
    const target = spk.vendor_wa
      ? waShareLink(spk.vendor_wa, pesanWa(spk))
      : `https://wa.me/?text=${encodeURIComponent(pesanWa(spk))}`
    window.open(target, '_blank')
    void tandaiTerkirim(spk)
  }

  async function kirimEmail(spk: SpkDoc) {
    try {
      await spkApi().sendSpkEmail(spk, spkSignLink(spk.sign_token))
      toast({ title: '✅ Email terkirim!', description: `Link tanda tangan dikirim ke ${spk.vendor_email}.` })
      void tandaiTerkirim(spk)
    } catch (e) {
      const subject = `SPK ${spk.nomor} — mohon tanda tangan digital`
      window.open(`mailto:${spk.vendor_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(pesanWa(spk))}`)
      toast({
        title: 'Email otomatis gagal — dibuka lewat aplikasi email',
        description: e instanceof Error ? e.message : String(e),
      })
      void tandaiTerkirim(spk)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl md:text-2xl font-serif font-bold text-navy flex items-center gap-2">
          <FileSignature className="w-6 h-6" /> SPK — Surat Perintah Kerja
        </h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat Ulang
          </Button>
          <Button size="sm" className="gap-1.5 bg-navy hover:bg-navy/90 font-bold"
            onClick={() => { setEditDoc(null); setJenis('vendor'); setOpen(true) }}>
            <Plus className="w-4 h-4" /> SPK Vendor
          </Button>
          <Button size="sm" className="gap-1.5 bg-gold hover:bg-gold/90 text-navy font-bold"
            onClick={() => { setEditDoc(null); setJenis('konsumen'); setOpen(true) }}>
            <Plus className="w-4 h-4" /> Kontrak Konsumen
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground max-w-2xl">
        <b>SPK Vendor</b> = perintah kerja ke pelaksana/pemborong. <b>Kontrak Konsumen</b> = perjanjian
        pemesanan/jual-beli ke pembeli/pemilik (wajib lampirkan RAB / Surat Penawaran Harga).
        Anda tanda tangan selaku Pihak Pertama → kirim link → pihak kedua tanda tangan digital dari HP.
      </p>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
          {error} — pastikan migrasi SQL <code>migration_kontraktor_spk_opname.sql</code> &
          <code>migration_spk_pemberi_pasal.sql</code> sudah dijalankan di Supabase.
        </p>
      )}

      {loading ? (
        <div className="py-12 flex justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : docs.length === 0 && !error ? (
        <div className="py-12 text-center bg-white rounded-3xl border border-border">
          <FileSignature className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm text-muted-foreground">Belum ada SPK. Klik "Buat SPK" untuk menunjuk vendor pertama.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {docs.map(spk => {
            const vendorSigned = spk.status === 'ditandatangani' && !!spk.signed_name
            const pemberiSigned = !!spk.pemberi_signed_at
            return (
              <div key={spk.id} className="bg-white rounded-2xl border border-border p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-navy text-sm truncate">{spk.nomor}</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${
                        (spk.pihak_kedua_peran || '').toLowerCase() === 'konsumen' ? 'bg-gold-lt text-navy' : 'bg-navy/10 text-navy'}`}>
                        {(spk.pihak_kedua_peran || '').toLowerCase() === 'konsumen' ? 'Konsumen' : 'Vendor'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">👷 {spk.vendor_name}{spk.project_name && <> · 🏗️ {spk.project_name}</>}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 flex items-center gap-1 ${STATUS_BADGE[spk.status]}`}>
                    {spk.status === 'ditandatangani' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {spk.status}
                  </span>
                </div>
                <p className="text-base font-black text-navy">{fmt(spk.nilai_kontrak)}</p>

                {/* status dua tanda tangan */}
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className={`rounded-lg px-2 py-1 ${pemberiSigned ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}>
                    {pemberiSigned ? '✅' : '○'} Pemberi Kerja
                    {pemberiSigned && <div className="truncate font-semibold">{spk.pemberi_signed_name}</div>}
                  </div>
                  <div className={`rounded-lg px-2 py-1 ${vendorSigned ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}>
                    {vendorSigned ? '✅' : '○'} Pelaksana
                    {vendorSigned && <div className="truncate font-semibold">{spk.signed_name}</div>}
                  </div>
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  {!pemberiSigned && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 border-gold text-navy"
                      onClick={() => setSignPemberi(spk)}>
                      <PenLine className="w-3 h-3" /> TTD Pemberi Kerja
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => kirimWa(spk)}>
                    <Send className="w-3 h-3" /> WhatsApp
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                    disabled={!spk.vendor_email} onClick={() => kirimEmail(spk)}>
                    <Mail className="w-3 h-3" /> Email
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                    onClick={() => {
                      navigator.clipboard?.writeText(spkSignLink(spk.sign_token))
                      toast({ title: 'Link tanda tangan disalin!' })
                      void tandaiTerkirim(spk)
                    }}>
                    <Link2 className="w-3 h-3" /> Salin Link
                  </Button>
                  {!vendorSigned && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                      onClick={() => {
                        setEditDoc(spk)
                        setJenis((spk.pihak_kedua_peran || '').toLowerCase() === 'konsumen' ? 'konsumen' : 'vendor')
                        setOpen(true)
                      }}>
                      <Pencil className="w-3 h-3" /> Edit
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => downloadSpkPdf(spk)}>
                    <FileDown className="w-3 h-3" /> PDF
                  </Button>
                  <button
                    onClick={async () => {
                      if (window.confirm(`Hapus SPK ${spk.nomor}?`)) { await spkApi().deleteSpk(spk.id); load() }
                    }}
                    className="h-7 px-2 text-muted-foreground hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <SpkFormDialog
        open={open}
        jenis={jenis}
        onClose={() => { setOpen(false); setEditDoc(null) }}
        onSaved={() => { setOpen(false); setEditDoc(null); load() }}
        defaultProject={projectInfo?.projectName ?? ''}
        defaultPemberi={profile?.company || profile?.full_name || ''}
        count={docs.length}
        editDoc={editDoc}
      />

      <SignPemberiDialog
        spk={signPemberi}
        defaultName={profile?.full_name || profile?.company || ''}
        onClose={() => setSignPemberi(null)}
        onSigned={() => { setSignPemberi(null); load() }}
      />
    </div>
  )
}

// ── Dialog Buat / Edit SPK ──────────────────────────────────────────────────
function SpkFormDialog({ open, jenis, onClose, onSaved, defaultProject, defaultPemberi, count, editDoc }: {
  open: boolean
  jenis: SpkJenis
  onClose: () => void
  onSaved: () => void
  defaultProject: string
  defaultPemberi: string
  count: number
  editDoc: SpkDoc | null
}) {
  const { toast } = useToast()
  const isEdit = !!editDoc
  const isKonsumen = jenis === 'konsumen'
  const [vendor, setVendor] = useState('')
  const [wa, setWa] = useState('')
  const [email, setEmail] = useState('')
  const [proyek, setProyek] = useState(defaultProject)
  const [pemberiNama, setPemberiNama] = useState(defaultPemberi)
  const [pemberiJabatan, setPemberiJabatan] = useState('Direktur')
  const [tglMulai, setTglMulai] = useState(() => new Date().toISOString().slice(0, 10))
  const [durasi, setDurasi] = useState(30)
  const [denda, setDenda] = useState(1)
  const [catatan, setCatatan] = useState('')
  const [lingkup, setLingkup] = useState<SpkLingkupItem[]>([{ uraian: '', volume: 1, satuan: 'ls', harga: 0 }])
  const [termin, setTermin] = useState<SpkTermin[]>([
    { nama: 'DP / Uang Muka', pct: 30 }, { nama: 'Progres 50%', pct: 40 }, { nama: 'Pelunasan (BAST)', pct: 30 },
  ])
  const [pasal, setPasal] = useState<SpkPasal[]>([])
  const [pasalTouched, setPasalTouched] = useState(false)
  const [lampiranNama, setLampiranNama] = useState<string | null>(null)
  const [lampiranData, setLampiranData] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const lampiranRef = useRef<HTMLInputElement>(null)

  // isi ulang form saat dibuka (mode buat) atau saat edit doc berubah
  useEffect(() => {
    if (!open) return
    if (editDoc) {
      setVendor(editDoc.vendor_name); setWa(editDoc.vendor_wa); setEmail(editDoc.vendor_email)
      setProyek(editDoc.project_name); setPemberiNama(editDoc.pemberi_nama ?? defaultPemberi)
      setPemberiJabatan(editDoc.pemberi_jabatan || 'Direktur')
      setTglMulai(editDoc.tgl_mulai ?? new Date().toISOString().slice(0, 10))
      setDurasi(editDoc.durasi_hari || 30); setDenda(editDoc.denda_permil ?? 1)
      setCatatan(editDoc.catatan ?? '')
      setLingkup(editDoc.lingkup.length ? editDoc.lingkup : [{ uraian: '', volume: 1, satuan: 'ls', harga: 0 }])
      setTermin(editDoc.termin.length ? editDoc.termin : [{ nama: 'Termin 1', pct: 100 }])
      setPasal(editDoc.pasal?.length ? editDoc.pasal : [])
      setPasalTouched(!!editDoc.pasal?.length)
      setLampiranNama(editDoc.lampiran_nama ?? null)
      setLampiranData(editDoc.lampiran_data ?? null)
    } else {
      setVendor(''); setWa(''); setEmail(''); setProyek(defaultProject)
      setPemberiNama(defaultPemberi); setPemberiJabatan('Direktur')
      setTglMulai(new Date().toISOString().slice(0, 10)); setDurasi(30); setDenda(1); setCatatan('')
      setLingkup([{ uraian: '', volume: 1, satuan: 'ls', harga: 0 }])
      setTermin([{ nama: 'DP / Uang Muka', pct: 30 }, { nama: 'Progres 50%', pct: 40 }, { nama: 'Pelunasan (BAST)', pct: 30 }])
      setPasal([]); setPasalTouched(false)
      setLampiranNama(null); setLampiranData(null)
    }
  }, [open, editDoc, defaultProject, defaultPemberi])

  async function pickLampiran(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 4 * 1024 * 1024) {
      toast({ title: 'Lampiran terlalu besar (maks 4MB)', description: 'Kompres PDF/gambar lalu unggah lagi.', variant: 'destructive' })
      return
    }
    const reader = new FileReader()
    reader.onload = () => { setLampiranData(String(reader.result)); setLampiranNama(f.name) }
    reader.readAsDataURL(f)
  }

  const setL = (i: number, patch: Partial<SpkLingkupItem>) =>
    setLingkup(prev => prev.map((it, j) => j === i ? { ...it, ...patch } : it))
  const setT = (i: number, patch: Partial<SpkTermin>) =>
    setTermin(prev => prev.map((it, j) => j === i ? { ...it, ...patch } : it))
  const setP = (i: number, patch: Partial<SpkPasal>) =>
    setPasal(prev => prev.map((it, j) => j === i ? { ...it, ...patch } : it))

  const nilai = lingkup.reduce((s, l) => s + l.volume * l.harga, 0)
  const totalPct = termin.reduce((s, t) => s + t.pct, 0)
  const validLingkup = lingkup.filter(l => l.uraian.trim() && l.harga > 0)

  const buatPasalStandar = () => {
    setPasal(pasalTemplate({ pemberi: pemberiNama, vendor, proyek, nilai, termin, durasi, denda, tglMulai }, jenis))
    setPasalTouched(true)
  }

  /** Validasi field wajib — kembalikan pesan pertama yang kosong. */
  function validasi(): string | null {
    if (!pemberiNama.trim()) return 'Nama Pemberi Kerja / Penjual (Pihak Pertama) wajib diisi.'
    if (!vendor.trim()) return `Nama ${isKonsumen ? 'Konsumen/Pemilik' : 'Pelaksana/Vendor'} (Pihak Kedua) wajib diisi.`
    if (validLingkup.length === 0) return `Isi minimal 1 baris ${isKonsumen ? 'Rincian & Harga' : 'Rincian Pekerjaan'} (uraian & harga).`
    if (totalPct !== 100) return `Total ${isKonsumen ? 'jadwal pembayaran' : 'termin pembayaran'} harus 100% (sekarang ${totalPct}%).`
    if (isKonsumen && !lampiranData) return 'Kontrak konsumen wajib melampirkan RAB / Surat Penawaran Harga.'
    return null
  }

  async function handleSave() {
    const err = validasi()
    if (err) { toast({ title: 'Harap dilengkapi', description: err, variant: 'destructive' }); return }
    setSaving(true)
    // pasal: jika belum pernah disentuh, isi dgn template standar otomatis
    const finalPasal = pasalTouched && pasal.length
      ? pasal.filter(p => p.judul.trim() || p.isi.trim())
      : pasalTemplate({ pemberi: pemberiNama, vendor, proyek, nilai, termin, durasi, denda, tglMulai }, jenis)
    const payload = {
      project_name: proyek.trim(),
      vendor_name: vendor.trim(),
      vendor_email: email.trim(),
      vendor_wa: wa.trim(),
      lingkup: validLingkup,
      nilai_kontrak: validLingkup.reduce((s, l) => s + l.volume * l.harga, 0),
      termin,
      tgl_mulai: tglMulai,
      durasi_hari: durasi,
      denda_permil: denda,
      catatan: catatan.trim(),
      pemberi_nama: pemberiNama.trim(),
      pemberi_jabatan: pemberiJabatan.trim(),
      pasal: finalPasal,
      pihak_kedua_peran: isKonsumen ? 'Konsumen' : 'Pelaksana',
      lampiran_nama: lampiranNama,
      lampiran_data: lampiranData,
    }
    try {
      if (isEdit && editDoc) {
        await spkApi().updateSpk(editDoc.id, payload)
        toast({ title: `✅ ${editDoc.nomor} diperbarui!` })
      } else {
        const doc = await spkApi().createSpk({ nomor: nomorSpkOtomatis(count), ...payload })
        toast({ title: `✅ ${doc.nomor} dibuat!`, description: `Tanda tangani sebagai Pihak Pertama lalu kirim ke ${isKonsumen ? 'konsumen' : 'vendor'}.` })
      }
      onSaved()
    } catch (e) {
      toast({ title: isEdit ? 'Gagal menyimpan' : 'Gagal membuat SPK', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Edit ${editDoc?.nomor}` : isKonsumen ? 'Buat Kontrak Konsumen' : 'Buat SPK Vendor'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Ubah isi dokumen. Perubahan hanya bisa dilakukan sebelum pihak kedua menandatangani.'
              : isKonsumen
                ? <>Perjanjian pemesanan/jual-beli ke pembeli — <b>wajib lampirkan RAB / Surat Penawaran Harga</b>. Nomor: <b>{nomorSpkOtomatis(count)}</b></>
                : <>Perintah kerja ke pelaksana/vendor. Nomor otomatis: <b>{nomorSpkOtomatis(count)}</b></>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Para pihak */}
          <div className="rounded-xl border border-border p-3 space-y-3">
            <p className="text-xs font-bold text-navy uppercase tracking-wide">Para Pihak</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Pemberi Kerja / Pihak Pertama <span className="text-red-600">*</span></Label>
                <Input value={pemberiNama} onChange={e => setPemberiNama(e.target.value)} placeholder="mis. PT Jaya Makmur / Nama Anda" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Jabatan Pemberi Kerja</Label>
                <Input value={pemberiJabatan} onChange={e => setPemberiJabatan(e.target.value)} placeholder="mis. Direktur / Owner" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  {isKonsumen ? 'Konsumen / Pemilik' : 'Pelaksana / Vendor'} — Pihak Kedua <span className="text-red-600">*</span>
                </Label>
                <Input value={vendor} onChange={e => setVendor(e.target.value)}
                  placeholder={isKonsumen ? 'mis. Bapak Budi (pembeli)' : 'mis. CV Karya Mandiri'} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Proyek</Label>
                <Input value={proyek} onChange={e => setProyek(e.target.value)} placeholder="Nama proyek" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">No. WhatsApp {isKonsumen ? 'Konsumen' : 'Vendor'}</Label>
                <Input value={wa} onChange={e => setWa(e.target.value)} placeholder="08xxxxxxxxxx" inputMode="tel" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email {isKonsumen ? 'Konsumen' : 'Vendor'}</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@contoh.com" type="email" />
              </div>
            </div>

            {/* Lampiran RAB / Surat Penawaran Harga */}
            <div className={`space-y-1.5 ${isKonsumen ? 'rounded-lg bg-gold-lt/30 border border-gold/40 p-2.5' : ''}`}>
              <Label className="text-xs">
                Lampiran RAB / Surat Penawaran Harga (PDF/gambar, maks 4MB)
                {isKonsumen && <span className="text-red-600"> *</span>}
              </Label>
              {lampiranNama ? (
                <div className="flex items-center gap-2 bg-slate-50 border border-border rounded-lg px-3 py-2 text-xs">
                  <FileText className="w-4 h-4 text-navy shrink-0" />
                  <span className="truncate flex-1 font-medium">{lampiranNama}</span>
                  <button onClick={() => { setLampiranNama(null); setLampiranData(null) }}
                    className="text-muted-foreground hover:text-red-600 shrink-0"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs border-dashed"
                  onClick={() => lampiranRef.current?.click()}>
                  <Paperclip className="w-3.5 h-3.5" /> Lampirkan RAB / Penawaran
                </Button>
              )}
              <input ref={lampiranRef} type="file" accept=".pdf,image/*" hidden onChange={pickLampiran} />
            </div>
          </div>

          {/* Lingkup / rincian */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wide">
              {isKonsumen ? 'Rincian & Harga (Unit/Spesifikasi)' : 'Rincian Pekerjaan'} <span className="text-red-600">*</span>
            </Label>
            {lingkup.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_64px_64px_110px_32px] gap-2 items-center">
                <Input value={l.uraian} onChange={e => setL(i, { uraian: e.target.value })}
                  placeholder={`Uraian pekerjaan ${i + 1}`} className="text-sm" />
                <NumInput value={l.volume} onValue={n => setL(i, { volume: n })} min={0} placeholder="vol" />
                <Input value={l.satuan} onChange={e => setL(i, { satuan: e.target.value })} placeholder="sat" className="text-sm" />
                <NumInput value={l.harga} onValue={n => setL(i, { harga: n })} min={0} placeholder="harga (Rp)" />
                <button onClick={() => setLingkup(prev => prev.filter((_, j) => j !== i))}
                  disabled={lingkup.length <= 1}
                  className="text-muted-foreground hover:text-red-600 disabled:opacity-30">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                onClick={() => setLingkup(prev => [...prev, { uraian: '', volume: 1, satuan: 'ls', harga: 0 }])}>
                <Plus className="w-3.5 h-3.5" /> Tambah Baris
              </Button>
              <p className="text-sm font-black text-navy">Nilai: {fmt(nilai)}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tanggal Mulai</Label>
              <Input type="date" value={tglMulai} onChange={e => setTglMulai(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Durasi (hari)</Label>
              <NumInput value={durasi} onValue={setDurasi} min={1} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Denda (permil/hari)</Label>
              <NumInput value={denda} onValue={setDenda} min={0} step={0.5} />
            </div>
          </div>

          {/* Termin */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-wide">{isKonsumen ? 'Jadwal Pembayaran' : 'Termin Pembayaran'}</Label>
              <span className={`text-[11px] font-bold ${totalPct === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                Total: {totalPct}% {totalPct !== 100 && '(harus 100%)'}
              </span>
            </div>
            {termin.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_32px] gap-2 items-center">
                <Input value={t.nama} onChange={e => setT(i, { nama: e.target.value })} className="text-sm" />
                <NumInput value={t.pct} onValue={n => setT(i, { pct: n })} min={0} max={100} placeholder="%" />
                <button onClick={() => setTermin(prev => prev.filter((_, j) => j !== i))}
                  disabled={termin.length <= 1}
                  className="text-muted-foreground hover:text-red-600 disabled:opacity-30">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1.5 text-xs"
              onClick={() => setTermin(prev => [...prev, { nama: `Termin ${prev.length + 1}`, pct: 0 }])}>
              <Plus className="w-3.5 h-3.5" /> Tambah Termin
            </Button>
          </div>

          {/* Pasal — isi dokumen yang bisa diedit */}
          <div className="rounded-xl border border-gold/40 bg-gold-lt/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-xs font-bold text-navy uppercase tracking-wide">Isi Dokumen (Pasal)</p>
                <p className="text-[11px] text-muted-foreground">Bisa diedit sesuai kebutuhan. Kosongkan untuk pakai template standar otomatis.</p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={buatPasalStandar}>
                <RotateCcw className="w-3.5 h-3.5" /> Muat Template Standar
              </Button>
            </div>
            {pasal.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic py-2">
                Belum ada pasal — template kontrak standar (9 pasal) akan dipakai otomatis saat disimpan.
                Klik "Muat Template Standar" untuk menampilkan & mengeditnya.
              </p>
            ) : (
              <div className="space-y-2">
                {pasal.map((p, i) => (
                  <div key={i} className="rounded-lg bg-white border border-border p-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Input value={p.judul} onChange={e => { setP(i, { judul: e.target.value }); setPasalTouched(true) }}
                        className="text-xs font-bold h-8" placeholder={`PASAL ${i + 1} — JUDUL`} />
                      <button onClick={() => { setPasal(prev => prev.filter((_, j) => j !== i)); setPasalTouched(true) }}
                        className="text-muted-foreground hover:text-red-600 shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <textarea value={p.isi} onChange={e => { setP(i, { isi: e.target.value }); setPasalTouched(true) }}
                      rows={3}
                      className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                ))}
                <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                  onClick={() => { setPasal(prev => [...prev, { judul: `PASAL ${prev.length + 1} — `, isi: '' }]); setPasalTouched(true) }}>
                  <Plus className="w-3.5 h-3.5" /> Tambah Pasal
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Catatan Tambahan</Label>
            <Input value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="mis. material disediakan pemberi kerja" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button className="bg-navy hover:bg-navy/90 font-bold gap-2"
            disabled={saving}
            onClick={handleSave}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileSignature className="w-4 h-4" /> {isEdit ? 'Simpan Perubahan' : 'Buat SPK'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Dialog Tanda Tangan Pemberi Kerja ───────────────────────────────────────
function SignPemberiDialog({ spk, defaultName, onClose, onSigned }: {
  spk: SpkDoc | null
  defaultName: string
  onClose: () => void
  onSigned: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (spk) { setName(spk.pemberi_signed_name || defaultName); setSignature(null) } }, [spk, defaultName])

  async function handleSign() {
    if (!spk || !signature || name.trim().length < 2) return
    setSaving(true)
    try {
      await spkApi().signSpkAsPemberi(spk.id, signature, name.trim())
      toast({ title: '✅ Ditandatangani sebagai Pemberi Kerja!' })
      onSigned()
    } catch (e) {
      toast({ title: 'Gagal tanda tangan', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!spk} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tanda Tangan Pemberi Kerja</DialogTitle>
          <DialogDescription>
            {spk?.nomor} — Anda menandatangani sebagai Pihak Pertama (Pemberi Kerja).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nama Penandatangan</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nama lengkap" />
          </div>
          <SignaturePad onChange={setSignature} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button className="bg-navy hover:bg-navy/90 font-bold gap-2"
            disabled={saving || !signature || name.trim().length < 2} onClick={handleSign}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><PenLine className="w-4 h-4" /> Tandatangani</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
