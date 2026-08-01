// ============================================================
// FORM KONSULTASI — halaman PUBLIK, dibuka calon konsumen tanpa login.
//
// Satu tautan yang bisa disebar di bio Instagram, iklan, atau kartu nama.
// Calon konsumen mengisi, datanya masuk ke daftar leads perusahaan, lalu ia
// diantar ke WhatsApp official dengan pesan yang sudah terisi.
//
// URUTANNYA PENTING: DISIMPAN DULU, baru diantar ke WhatsApp. Kalau dibalik,
// calon yang menutup WhatsApp tanpa menekan kirim akan hilang tanpa jejak —
// padahal ia sudah menyerahkan datanya.
//
// Halaman ini memakai anon key saja (lihat leadsApi.ts). Perangkat yang dipakai
// bergantian sering menyimpan JWT orang lain di localStorage, dan mengirimnya
// akan membuat form ini gagal terbuka pada klik pertama.
// ============================================================
import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  Loader2, Send, Camera, X, CheckCircle2, MessageCircle, Building2, ShieldCheck,
} from 'lucide-react'
import { leadsApi, type InfoFormLead } from '@/lib/leadsApi'
import {
  periksaForm, siapkanKiriman, pesanWaLead, JENIS_PROYEK, type IsiFormLead,
} from '@/lib/leads'
import { waKe } from '@/lib/waLink'
import { downscaleImage } from '@/lib/imageUtil'

const MAKS_FOTO = 6

export default function LeadFormPage() {
  const { token = '' } = useParams()
  const [params] = useSearchParams()
  const [info, setInfo] = useState<InfoFormLead | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [galatMuat, setGalatMuat] = useState('')
  const [isi, setIsi] = useState<IsiFormLead>({ foto: [] })
  const [galat, setGalat] = useState<Record<string, string>>({})
  const [mengirim, setMengirim] = useState(false)
  const [selesai, setSelesai] = useState<{ wa: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let batal = false
    leadsApi().formInfo(token)
      .then(hasil => {
        if (batal) return
        if (!hasil) setGalatMuat('Tautan ini tidak dikenali atau sudah tidak berlaku.')
        else setInfo(hasil)
      })
      .catch(e => { if (!batal) setGalatMuat(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!batal) setMemuat(false) })
    return () => { batal = true }
  }, [token])

  const perusahaan = info?.nama_perusahaan || 'Kontraktor'
  const ubah = (k: keyof IsiFormLead, v: string) => {
    setIsi(s => ({ ...s, [k]: v }))
    // Galat dihapus begitu kolomnya disentuh: membiarkan pesan merah menempel
    // padahal orangnya sedang memperbaiki hanya membuatnya ragu.
    setGalat(g => (g[k] ? { ...g, [k]: '' } : g))
  }

  async function pilihFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const berkas = Array.from(e.target.files ?? [])
    for (const f of berkas) {
      if ((isi.foto?.length ?? 0) >= MAKS_FOTO) break
      try {
        const kecil = await downscaleImage(f)
        setIsi(s => ({ ...s, foto: [...(s.foto ?? []), kecil].slice(0, MAKS_FOTO) }))
      } catch { /* satu foto gagal dibaca tidak boleh membatalkan sisanya */ }
    }
    e.target.value = ''
  }

  async function kirim() {
    const periksa = periksaForm(isi, MAKS_FOTO)
    setGalat(periksa.galat)
    if (!periksa.sah) {
      // Digulirkan ke kolom pertama yang salah — di layar HP kolom yang
      // bermasalah sering berada jauh di luar layar.
      document.querySelector('[data-galat="1"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setMengirim(true)
    try {
      const kiriman = siapkanKiriman({ ...isi, sumber: params.get('dari') ?? '' }, MAKS_FOTO)
      const hasil = await leadsApi().kirim(token, kiriman)
      if (!hasil.ok) {
        setGalat({ _: 'Data gagal disimpan. Coba lagi, atau hubungi kami langsung.' })
        return
      }
      setSelesai({ wa: hasil.wa_official })
    } catch (e) {
      setGalat({ _: e instanceof Error ? e.message : String(e) })
    } finally { setMengirim(false) }
  }

  if (memuat) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gold animate-spin" />
      </div>
    )
  }

  if (galatMuat) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center space-y-3 shadow-2xl">
          <Building2 className="w-12 h-12 mx-auto text-muted-foreground opacity-40" />
          <h1 className="font-serif text-lg font-bold text-navy">Tautan tidak berlaku</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{galatMuat}</p>
        </div>
      </div>
    )
  }

  // ── Selesai: datanya SUDAH tersimpan, WhatsApp tinggal pelengkap ──────────
  if (selesai) {
    const pesan = pesanWaLead(isi, perusahaan)
    const tautanWa = selesai.wa ? waKe(selesai.wa, pesan) : ''
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-7 space-y-4 shadow-2xl text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <div>
            <h1 className="font-serif text-xl font-bold text-navy">Terima kasih, {isi.nama}!</h1>
            <p className="text-sm text-muted-foreground leading-relaxed mt-1">
              Data Anda sudah kami terima. Tim {perusahaan} akan menghubungi Anda.
            </p>
          </div>

          {tautanWa ? (
            <>
              <a href={tautanWa} target="_blank" rel="noopener noreferrer"
                className="w-full h-12 rounded-xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors">
                <MessageCircle className="w-4 h-4" /> Lanjut Chat WhatsApp
              </a>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Pesannya sudah kami siapkan berisi ringkasan yang baru Anda isi —
                Anda tinggal menekan kirim. Kalaupun tidak, data Anda tetap tersimpan.
              </p>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Nomor WhatsApp belum dipasang, tetapi data Anda sudah tersimpan dan
              akan ditindaklanjuti.
            </p>
          )}
        </div>
      </div>
    )
  }

  const kolom = (
    kunci: keyof IsiFormLead, label: string,
    opsi: { wajib?: boolean; tipe?: string; baris?: number; bantu?: string; pilihan?: string[] } = {},
  ) => {
    const salah = galat[kunci as string]
    return (
      <div className="space-y-1" data-galat={salah ? '1' : undefined}>
        <label className="text-xs font-bold text-navy">
          {label}{opsi.wajib && <span className="text-rose-600"> *</span>}
        </label>
        {opsi.pilihan ? (
          <select value={String(isi[kunci] ?? '')} onChange={e => ubah(kunci, e.target.value)}
            aria-label={label}
            className={`w-full h-11 rounded-xl border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gold ${
              salah ? 'border-rose-400' : 'border-border'}`}>
            <option value="">Pilih…</option>
            {opsi.pilihan.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : opsi.baris ? (
          <textarea value={String(isi[kunci] ?? '')} onChange={e => ubah(kunci, e.target.value)}
            rows={opsi.baris} aria-label={label}
            className={`w-full rounded-xl border px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gold ${
              salah ? 'border-rose-400' : 'border-border'}`} />
        ) : (
          <input type={opsi.tipe ?? 'text'} value={String(isi[kunci] ?? '')}
            onChange={e => ubah(kunci, e.target.value)} aria-label={label}
            inputMode={opsi.tipe === 'tel' ? 'tel' : undefined}
            className={`w-full h-11 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gold ${
              salah ? 'border-rose-400' : 'border-border'}`} />
        )}
        {salah
          ? <p className="text-[11px] text-rose-600">{salah}</p>
          : opsi.bantu && <p className="text-[11px] text-muted-foreground">{opsi.bantu}</p>}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100/70">
      <div className="bg-gradient-to-b from-navy to-navy/95 text-white pb-16">
        <div className="max-w-lg mx-auto px-4 pt-7 text-center space-y-2">
          {info?.logo_url
            ? <img src={info.logo_url} alt={perusahaan} className="h-12 mx-auto object-contain" />
            : <Building2 className="w-9 h-9 mx-auto text-gold" />}
          <h1 className="font-serif text-xl font-bold">{perusahaan}</h1>
          <p className="text-white/70 text-sm leading-relaxed">
            Isi form singkat ini, dan tim kami akan menghubungi Anda untuk konsultasi
            renovasi — gratis, tanpa kewajiban apa pun.
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-12 pb-10 space-y-4">
        <div className="rounded-2xl bg-white border border-border p-5 space-y-4">
          <h2 className="font-bold text-navy text-sm">Data Anda</h2>
          {kolom('nama', 'Nama lengkap', { wajib: true })}
          {kolom('no_hp', 'Nomor HP / WhatsApp', { wajib: true, tipe: 'tel', bantu: 'Contoh: 0812-3456-7890' })}
          {kolom('email', 'Email', { tipe: 'email', bantu: 'Opsional — untuk mengirim penawaran tertulis.' })}
        </div>

        <div className="rounded-2xl bg-white border border-border p-5 space-y-4">
          <h2 className="font-bold text-navy text-sm">Proyek yang ingin dikerjakan</h2>
          {kolom('jenis', 'Jenis pekerjaan', { pilihan: JENIS_PROYEK })}
          {kolom('lokasi', 'Lokasi', { bantu: 'Kota atau kecamatan sudah cukup.' })}
          {kolom('luas', 'Perkiraan luas', { bantu: 'Boleh perkiraan, mis. "sekitar 100 m²".' })}
          {kolom('kondisi', 'Kondisi bangunan saat ini', {
            baris: 3,
            bantu: 'Mis. atap bocor, dinding retak, atau masih tanah kosong.',
          })}
          {kolom('anggaran', 'Perkiraan anggaran', { bantu: 'Opsional. Boleh rentang, mis. "150–200 juta".' })}
          {kolom('target_mulai', 'Rencana mulai', { bantu: 'Mis. "bulan depan" atau "setelah lebaran".' })}
          {kolom('catatan', 'Catatan tambahan', { baris: 2 })}
        </div>

        {/* Foto opsional — tapi paling menolong: satu foto atap bocor lebih
            jelas daripada tiga paragraf keterangan. */}
        <div className="rounded-2xl bg-white border border-border p-5 space-y-3">
          <div>
            <h2 className="font-bold text-navy text-sm">Foto kondisi saat ini</h2>
            <p className="text-[11px] text-muted-foreground">
              Opsional, maksimal {MAKS_FOTO} foto — tapi sangat menolong kami
              memperkirakan pekerjaannya.
            </p>
          </div>
          {(isi.foto?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              {isi.foto!.map((f, i) => (
                <div key={i} className="relative">
                  <img src={f} alt={`Foto ${i + 1}`} className="w-20 h-20 object-cover rounded-xl border border-border" />
                  <button onClick={() => setIsi(s => ({ ...s, foto: s.foto!.filter((_, j) => j !== i) }))}
                    aria-label={`Buang foto ${i + 1}`}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-navy text-white flex items-center justify-center">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={pilihFoto} className="hidden" />
          <button onClick={() => fileRef.current?.click()}
            disabled={(isi.foto?.length ?? 0) >= MAKS_FOTO}
            className="w-full h-11 rounded-xl border-2 border-dashed border-navy/25 text-navy text-xs font-bold flex items-center justify-center gap-2 hover:border-navy/50 disabled:opacity-40">
            <Camera className="w-4 h-4" />
            {(isi.foto?.length ?? 0) >= MAKS_FOTO ? `Sudah ${MAKS_FOTO} foto` : 'Tambah Foto'}
          </button>
          {galat.foto && <p className="text-[11px] text-rose-600">{galat.foto}</p>}
        </div>

        {galat._ && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl p-3">{galat._}</p>
        )}

        <button onClick={() => void kirim()} disabled={mengirim}
          className="w-full h-12 rounded-xl bg-navy text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-navy/90 disabled:opacity-50">
          {mengirim ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Kirim & Lanjut ke WhatsApp
        </button>

        <p className="text-[11px] text-muted-foreground text-center leading-relaxed flex items-start gap-1.5 justify-center">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Data Anda hanya dipakai {perusahaan} untuk menindaklanjuti permintaan ini.</span>
        </p>
      </div>
    </div>
  )
}
