// ============================================================
// CHAT AI — satu pintu untuk menyuruh AI mengerjakan data lintas modul.
//
// Sebelumnya chat ini hanya ada di dalam tab Realisasi Biaya: pemakainya harus
// membuka workspace proyek, memilih tab, baru bisa mengirim foto nota. Padahal
// yang dikirim dari lapangan tidak selalu soal biaya — bisa uang masuk, bisa
// bukti transfer ke vendor, bisa barang yang baru datang.
//
// Di sini chat itu menjadi MENU SENDIRI yang bisa dibuka dari mana saja, dan
// tetap memakai mesin yang persis sama: AI membaca, `susunRencana` menyusun
// daftar periksa lintas modul, `catatRencana` yang menulisnya setelah manusia
// menyetujui. Tidak ada jalur penulisan kedua yang bisa menyimpang sendiri.
//
// Proyek dipilih dari header. Chat AI perlu tahu proyeknya karena biaya, RAB,
// dan pemasukan semuanya melekat pada satu proyek — dan menebak proyek yang
// salah jauh lebih merepotkan daripada memilihnya sekali.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, Send, Paperclip, Loader2, X, FileText, ImageIcon,
  Building2, Trash2, Info,
} from 'lucide-react'
import KontraktorHeader from '@/components/cost/KontraktorHeader'
import PanelRencana from '@/components/cost/PanelRencana'
import { useCostStore } from '@/store/costStore'
import { useAkuntanStore } from '@/store/akuntanStore'
import { useToast } from '@/hooks/use-toast'
import {
  chatRealisasiWithGemini,
  type ChatMessage, type RealisasiEntry, type PemasukanUsul,
} from '@/lib/ai-realisasi'
import { susunRencana, type Rencana } from '@/lib/rencanaCatat'
import { catatRencana, ringkasHasil, GagalSebagian } from '@/lib/catatRencana'
import { procurementApi } from '@/lib/procurementApi'
import { penerimaanApi } from '@/lib/penerimaanApi'
import { totalDibayar, nomorDo, type DeliveryOrder, type PoPayment } from '@/lib/penerimaan'
import type { PurchaseOrder } from '@/lib/procurement'
import { getDriveWebhook, uploadToDrive } from '@/lib/fieldReports'
import { kecilkanFoto, ukuranTampil } from '@/lib/kompresFoto'
import { dataUriBerkas } from '@/lib/berkasLampiran'
import { saringEntriBaru } from '@/lib/duplikatBiaya'
import TeksChat from '@/components/cost/TeksChat'
import { adaTabel } from '@/lib/markdownChat'

const SAPAAN: ChatMessage = {
  id: 'salam',
  role: 'assistant',
  text: 'Kirim foto nota, bukti transfer, atau ketik saja apa yang terjadi di lapangan. '
    + 'Saya baca, saya susun, lalu saya tunjukkan modul mana saja yang akan terisi — '
    + 'Anda yang menyetujui sebelum apa pun tersimpan.',
}

/** Contoh yang bisa langsung diketuk — lebih cepat daripada menerangkan aturannya. */
const CONTOH = [
  'Beli 20 sak semen Rp58.000 di Toko Maju',
  'Terima termin 2 dari owner Rp250 juta',
  'Transfer ke Toko Maju Rp5 juta untuk nota A123',
  'Bayar upah 4 tukang 3 hari @Rp150.000',
]

const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

// `Teks` yang dulu di sini hanya menebalkan `**…**` dan mencetak sisanya
// sebagai paragraf datar — tabel rekap dari model keluar sebagai deretan pipa.
// Penggambarnya kini satu untuk semua chat; lihat markdownChat.ts.

export default function ChatAiPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const {
    savedProjects, loadProjects, loadProject, projectInfo, activePlan,
    realisasiEntries, addRealisasiEntries, updateRealisasiEntry, deleteRealisasiEntry,
  } = useCostStore()
  const addPemasukan = useAkuntanStore(s => s.addPemasukan)

  const [pesan, setPesan] = useState<ChatMessage[]>([SAPAAN])
  const [teks, setTeks] = useState('')
  const [lampiran, setLampiran] = useState<Array<{
    name: string; mimeType: string; base64Data: string; preview?: string; ukuran?: string
  }>>([])
  const [sibuk, setSibuk] = useState(false)
  /**
   * Detik yang sudah berjalan sejak pesan dikirim.
   *
   * "AI sedang membaca…" tanpa angka tidak membedakan proses yang berjalan
   * lambat dari yang sudah mati — dan pemakainya hanya bisa menunggu tanpa
   * tahu sampai kapan. Angka yang bergerak sudah cukup: ia membuktikan
   * prosesnya hidup, dan membuat "lambat" bisa dilaporkan sebagai fakta.
   */
  const [detik, setDetik] = useState(0)
  useEffect(() => {
    if (!sibuk) { setDetik(0); return }
    const jam = setInterval(() => setDetik(d => d + 1), 1000)
    return () => clearInterval(jam)
  }, [sibuk])
  const [rencana, setRencana] = useState<Rencana | null>(null)
  const [pilihPo, setPilihPo] = useState(0)
  const [pilihBayar, setPilihBayar] = useState<number[]>([])
  const [menyimpan, setMenyimpan] = useState(false)
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [dos, setDos] = useState<DeliveryOrder[]>([])
  const [bayar, setBayar] = useState<PoPayment[]>([])

  const akhirRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadProjects() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { akhirRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [pesan, sibuk, rencana])

  // Proyek terakhir diperbarui dipakai bila belum ada yang terbuka — pemakainya
  // hampir selalu sedang mengurus proyek itu.
  const urut = useMemo(
    () => [...savedProjects].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
    [savedProjects],
  )
  useEffect(() => {
    if (!projectInfo && urut.length > 0) loadProject(urut[0].info.id)
  }, [projectInfo, urut]) // eslint-disable-line react-hooks/exhaustive-deps

  // Riwayat disimpan per proyek: percakapan tentang Ruko A tidak boleh muncul
  // saat pemakainya sedang mengurus Rumah B.
  const kunci = `propfs-chatai-${projectInfo?.id ?? 'umum'}`
  useEffect(() => {
    try {
      const simpan = sessionStorage.getItem(kunci)
      setPesan(simpan ? JSON.parse(simpan) : [SAPAAN])
    } catch { setPesan([SAPAAN]) }
    setRencana(null)
  }, [kunci])
  useEffect(() => {
    // base64 lampiran sengaja dibuang: sessionStorage cepat penuh oleh foto nota.
    const bersih = pesan.map(m => ({ ...m, files: m.files?.map(f => ({ ...f, base64Data: '' })) }))
    try { sessionStorage.setItem(kunci, JSON.stringify(bersih)) } catch { /* penuh: riwayat saja yang tidak menempel */ }
  }, [pesan, kunci])

  async function muatProcurement() {
    const [p, d, b] = await Promise.all([
      procurementApi().listPo().catch(() => [] as PurchaseOrder[]),
      penerimaanApi().listDo().catch(() => [] as DeliveryOrder[]),
      penerimaanApi().listBayar().catch(() => [] as PoPayment[]),
    ])
    setPos(p); setDos(d); setBayar(b)
    return { p, d, b }
  }
  useEffect(() => { void muatProcurement() }, [])

  async function pilihBerkas(e: React.ChangeEvent<HTMLInputElement>) {
    const berkas = Array.from(e.target.files ?? [])
    // Foto dikecilkan SEBELUM dikirim. Foto kamera 3–8 MB kini menempuh dua
    // perjalanan — ponsel → server kami → Google — dan yang menanggung
    // waktunya adalah orang di lapangan dengan sinyal seadanya. Untuk membaca
    // tulisan pada nota, 1600 piksel sudah jauh melampaui yang dibutuhkan.
    const hasil = await Promise.all(berkas.map(async f => {
      if (f.size > 25 * 1024 * 1024) {
        toast({ title: `${f.name} terlalu besar (maks 25MB)`, variant: 'destructive' })
        return null
      }
      const { base64Data, mimeType, byteAsal, byteAkhir } = await kecilkanFoto(f)
      if (byteAkhir < byteAsal * 0.7) {
        console.log(`[lampiran] ${f.name}: ${ukuranTampil(byteAsal)} → ${ukuranTampil(byteAkhir)}`)
      }
      // Ukurannya ikut ditampilkan. Tanpa itu, "lambat" tidak bisa ditelusuri
      // siapa pun: 250 KB dan 5 MB terlihat sama persis di layar.
      return {
        name: f.name, mimeType, base64Data, ukuran: ukuranTampil(byteAkhir),
        preview: `data:${mimeType};base64,${base64Data}`,
      }
    }))
    setLampiran(v => [...v, ...hasil.filter(Boolean) as never[]])
    e.target.value = ''
  }

  async function kirim() {
    if ((!teks.trim() && lampiran.length === 0) || sibuk) return
    if (!projectInfo) {
      toast({ title: 'Pilih proyek dulu', description: 'Chat AI mencatat ke proyek tertentu.', variant: 'destructive' })
      return
    }

    const milikSaya: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      text: teks.trim(),
      files: lampiran.map(f => ({ name: f.name, mimeType: f.mimeType, base64Data: f.base64Data })),
    }
    setPesan(v => [...v, milikSaya])

    // Foto nota ikut naik ke Google Drive bila webhook-nya dipasang. Tidak
    // ditunggu: kegagalan unggah tidak boleh menahan pembacaan AI.
    const drive = getDriveWebhook()
    if (drive) {
      for (const f of lampiran) {
        if (f.mimeType.startsWith('image/')) {
          void uploadToDrive(drive, {
            name: `${new Date().toISOString().slice(0, 10)}_${f.name}`,
            mimeType: f.mimeType, base64Data: f.base64Data,
            folder: projectInfo.id || 'ChatAI',
          })
        }
      }
    }

    setTeks('')
    setLampiran([])
    setSibuk(true)
    try {
      const { textResponse, parsedResult } = await chatRealisasiWithGemini(
        milikSaya, pesan, activePlan?.components ?? [], realisasiEntries,
      )
      setPesan(v => [...v, {
        id: String(Date.now() + 1), role: 'assistant', text: textResponse,
        newEntries: parsedResult.added,
      }])

      // Biaya langsung tercatat — itu memang tugas utamanya, dan menahannya di
      // balik satu tombol lagi hanya memperlambat pekerjaan yang sudah benar.
      // Nota yang sudah pernah difoto dan dicatat sering difoto lagi — oleh
      // orang berbeda, atau oleh orang yang sama karena lupa. Menyaringnya di
      // sini jauh lebih murah daripada mencarinya kembali setelah laporan
      // keuangannya salah.
      const { diterima, ditolak } = saringEntriBaru(parsedResult.added, realisasiEntries)
      if (diterima.length > 0) addRealisasiEntries(diterima)
      if (ditolak.length > 0) {
        toast({
          title: `${ditolak.length} baris dilewati — sudah pernah dicatat`,
          description: ditolak.map(e => `${e.keterangan} ${fmt(e.jumlah)}`).join(', '),
        })
      }
      parsedResult.updated.forEach(u => updateRealisasiEntry(u.id, u.data))
      parsedResult.deleted.forEach(id => deleteRealisasiEntry(id))

      // Daftar periksa disusun untuk SETIAP masukan, bukan hanya yang berisi
      // biaya: satu bukti transfer tidak menambah biaya sama sekali tetapi tetap
      // harus sampai ke Hutang Vendor.
      const { p, d, b } = await muatProcurement().catch(() => ({ p: pos, d: dos, b: bayar }))
      const r = susunRencana(parsedResult, {
        pos: p, dos: d, sudahDibayar: (id: string) => totalDibayar(id, b),
      })
      // Lampirannya ikut tersimpan bersama pembayaran yang lahir darinya.
      // Sebelumnya isinya dibaca lalu dibuang: yang tersisa hanya angka hasil
      // bacaan, tanpa dokumen yang bisa ditunjukkan ketika kelak dipertanyakan.
      const berkasBukti = milikSaya.files?.[0]
      if (berkasBukti?.base64Data) {
        r.bukti = dataUriBerkas(berkasBukti.mimeType, berkasBukti.base64Data)
      }
      if (r.perluKonfirmasi) {
        setRencana(r)
        setPilihPo(0)
        setPilihBayar(r.pembayaran.map(() => 0))
      }
      const jml = diterima.length + parsedResult.updated.length + parsedResult.deleted.length
      if (jml > 0) toast({ title: `✅ ${jml} perubahan dicatat` })
    } catch (e) {
      setPesan(v => [...v, {
        id: String(Date.now() + 1), role: 'assistant',
        // Ditandai supaya tidak ikut dikirim balik ke model sebagai riwayat.
        galat: true,
        text: `⚠️ ${e instanceof Error ? e.message : String(e)}`,
      }])
    } finally { setSibuk(false) }
  }

  async function catatSemua() {
    if (!rencana) return
    setMenyimpan(true)
    try {
      const hasil = await catatRencana(rencana, { po: pilihPo, bayar: pilihBayar }, {
        simpanPemasukan: p => addPemasukan({
          tanggal: p.tanggal, sumber: p.sumber,
          kategori: p.kategori as PemasukanUsul['kategori'],
          jumlah: p.jumlah, keterangan: p.keterangan,
          projectId: projectInfo?.id,
        }),
        nomorDo: () => nomorDo(dos.length),
        simpanDo: d => penerimaanApi().createDo(d as never),
        tandaiEntri: (id, doId) => updateRealisasiEntry(id, { doId }),
        simpanBayar: b => penerimaanApi().createBayar(b as never),
      })
      await muatProcurement()
      setRencana(null)
      toast({ title: '✅ Tercatat di semua modul', description: ringkasHasil(hasil) })
    } catch (e) {
      const sudah = e instanceof GagalSebagian && e.selesai.length > 0
        ? ` Yang sudah tersimpan: ${e.selesai.join(', ')}.` : ''
      toast({
        title: 'Sebagian gagal disimpan',
        description: (e instanceof Error ? e.message : String(e)) + sudah,
        variant: 'destructive',
      })
    } finally { setMenyimpan(false) }
  }

  const biayaHariIni = useMemo(() => {
    const hari = new Date().toISOString().slice(0, 10)
    return (realisasiEntries as RealisasiEntry[])
      .filter(e => e.tanggal === hari)
      .reduce((s, e) => s + (e.jumlah || 0), 0)
  }, [realisasiEntries])

  return (
    <div className="min-h-screen bg-slate-100/70 flex flex-col">
      <KontraktorHeader
        judul="Chat AI"
        subjudul={projectInfo
          ? `${projectInfo.projectName} · ${realisasiEntries.length} transaksi tercatat`
          : 'Belum ada proyek dipilih'}
        kembaliKe="/kontraktor"
        aksi={urut.length > 0 ? (
          <select
            aria-label="Pilih proyek"
            value={projectInfo?.id ?? ''}
            onChange={e => { if (e.target.value) loadProject(e.target.value) }}
            className="w-full sm:w-auto max-w-[240px] bg-white/10 text-white text-xs font-bold rounded-xl px-3 h-9 border border-white/20">
            {!projectInfo && <option value="" className="text-navy">Pilih proyek…</option>}
            {urut.map(p => (
              <option key={p.info.id} value={p.info.id} className="text-navy">{p.info.projectName}</option>
            ))}
          </select>
        ) : undefined}
      />

      <div className="flex-1 max-w-3xl w-full mx-auto px-4 -mt-2 pb-4 flex flex-col">
        <div className="flex-1 bg-white rounded-2xl border border-border flex flex-col overflow-hidden min-h-[60vh]">

          {urut.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
              <Building2 className="w-10 h-10 opacity-30" />
              <p className="text-xs text-muted-foreground max-w-xs">
                Chat AI mencatat ke sebuah proyek. Buat proyek dulu, lalu kembali ke sini.
              </p>
              <button onClick={() => navigate('/kontraktor')}
                className="h-10 px-5 rounded-xl bg-navy text-white text-xs font-bold">
                Ke Home Kontraktor AI
              </button>
            </div>
          ) : (
            <>
              {/* ── Percakapan ─────────────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {pesan.map(m => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {/* Gelembung yang memuat tabel diberi lebar penuh:
                        potongan 85% pada layar 390 piksel cukup untuk membuang
                        kolom Total ke luar layar — kolom yang paling dicari. */}
                    <div className={`min-w-0 rounded-2xl px-3 py-2.5 ${
                      m.role === 'assistant' && adaTabel(m.text) ? 'max-w-full w-full' : 'max-w-[85%]'
                    } ${
                      m.role === 'user'
                        ? 'bg-navy text-white rounded-br-sm'
                        : 'bg-slate-100 text-navy rounded-bl-sm'}`}>
                      {(m.files?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {m.files!.map((f, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-white/15 rounded-lg px-2 py-1">
                              {f.mimeType.startsWith('image/') ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                              <span className="truncate max-w-[120px]">{f.name}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {m.text ? <TeksChat text={m.text} /> : <p className="text-[13px] italic opacity-70">(lampiran)</p>}
                      {(m.newEntries?.length ?? 0) > 0 && (
                        <p className="mt-1.5 text-[10px] font-bold opacity-80">
                          {m.newEntries!.length} transaksi ·{' '}
                          {fmt(m.newEntries!.reduce((s, e) => s + (e.jumlah || 0), 0))}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {pesan.length <= 1 && (
                  <div className="pt-2 space-y-1.5">
                    <p className="text-[11px] font-bold text-muted-foreground">Coba salah satu:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {CONTOH.map(c => (
                        <button key={c} onClick={() => setTeks(c)}
                          className="text-[11px] text-navy bg-slate-100 hover:bg-slate-200 rounded-full px-3 py-1.5 transition-colors text-left">
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {sibuk && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      AI sedang membaca… {detik > 2 && <b className="font-mono">{detik}s</b>}
                      {detik > 20 && (
                        <span className="block text-[11px] opacity-80">
                          Foto besar memang lebih lama. Berhenti otomatis di 70 detik.
                        </span>
                      )}
                    </span>
                  </div>
                )}
                <div ref={akhirRef} />
              </div>

              {rencana && (
                <PanelRencana
                  rencana={rencana}
                  pilihPo={pilihPo} onPilihPo={setPilihPo}
                  pilihBayar={pilihBayar}
                  onPilihBayar={(i, j) => setPilihBayar(v => v.map((x, k) => k === i ? j : x))}
                  menyimpan={menyimpan}
                  onCatat={catatSemua}
                  onLewati={() => setRencana(null)}
                />
              )}

              {/* ── Kotak kirim ────────────────────────────────────────── */}
              <div className="border-t border-border p-3 space-y-2">
                {lampiran.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {lampiran.map((f, i) => (
                      <div key={i} className="relative">
                        {f.preview
                          ? <img src={f.preview} alt={f.name} className="w-14 h-14 object-cover rounded-xl border border-border" />
                          : <div className="w-14 h-14 rounded-xl border border-border flex items-center justify-center bg-slate-50">
                              <FileText className="w-5 h-5 text-muted-foreground" />
                            </div>}
                        <button onClick={() => setLampiran(v => v.filter((_, j) => j !== i))}
                          aria-label={`Buang ${f.name}`}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-navy text-white flex items-center justify-center">
                          <X className="w-3 h-3" />
                        </button>
                        {f.ukuran && (
                          <span data-ukuran-lampiran
                            className="absolute bottom-0 inset-x-0 text-[9px] font-mono text-center
                                       bg-navy/75 text-white rounded-b-xl leading-tight py-0.5">
                            {f.ukuran}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <input ref={fileRef} type="file" multiple accept="image/*,application/pdf"
                    onChange={pilihBerkas} className="hidden" />
                  <button onClick={() => fileRef.current?.click()} disabled={sibuk}
                    aria-label="Lampirkan foto nota"
                    className="w-10 h-10 shrink-0 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-navy hover:border-navy disabled:opacity-50">
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <textarea
                    value={teks} onChange={e => setTeks(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void kirim() } }}
                    rows={1} placeholder="Ketik atau kirim foto nota…"
                    className="flex-1 min-w-0 resize-none rounded-xl border border-border px-3 py-2.5 text-sm max-h-32 focus:outline-none focus:ring-2 focus:ring-gold"
                  />
                  <button onClick={() => void kirim()} disabled={sibuk || (!teks.trim() && lampiran.length === 0)}
                    aria-label="Kirim"
                    className="w-10 h-10 shrink-0 rounded-xl bg-navy text-white flex items-center justify-center disabled:opacity-40">
                    {sibuk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 min-w-0">
                    <Info className="w-3 h-3 shrink-0" />
                    <span className="truncate">Hari ini tercatat {fmt(biayaHariIni)}</span>
                  </p>
                  {pesan.length > 1 && (
                    <button
                      onClick={() => {
                        if (!window.confirm('Hapus riwayat percakapan? Transaksi yang sudah tercatat tidak ikut terhapus.')) return
                        setPesan([SAPAAN]); setRencana(null)
                        try { sessionStorage.removeItem(kunci) } catch { /* tidak apa-apa */ }
                      }}
                      className="text-[10px] font-bold text-muted-foreground hover:text-red-600 flex items-center gap-1 shrink-0">
                      <Trash2 className="w-3 h-3" /> Bersihkan
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <p className="mt-3 text-center text-[10px] text-muted-foreground flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3" />
          Realisasi Biaya · Akuntan · Procurement — satu masukan, semua modul
        </p>
      </div>
    </div>
  )
}
