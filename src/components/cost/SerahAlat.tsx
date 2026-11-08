// ============================================================
// PropFS — Serah-terima alat: dipinjam kapan, dibalikin kapan
//
// Sebelum ini, perpindahan alat dicatat lewat sebuah dropdown lokasi. Ia
// menjawab "alat ini di mana" dan tidak lebih: menggantinya menimpa jawaban
// lama, sehingga siapa yang membawanya kemarin tidak tersimpan di mana pun.
//
// Itu justru yang dibutuhkan ketika alatnya tidak ketemu. Genset berpindah
// dari proyek A ke proyek B lewat percakapan WhatsApp yang tidak pernah
// dicatat; dua bulan kemudian ia tidak ada di kedua proyek, dan pertanyaan
// "siapa yang terakhir memegangnya" hanya dijawab ingatan yang bertentangan.
//
// Karena itu yang dicatat di sini PERISTIWA, bukan keadaan — dan setiap
// peristiwa memerlukan foto bercap tanggal & jam. Cap itu DIBAKAR ke dalam
// gambarnya: ia ikut ke mana pun gambarnya pergi, termasuk ketika diteruskan
// lewat WhatsApp, tempat seluruh perselisihan ini biasanya berlangsung.
// ============================================================
import { useMemo, useState } from 'react'
import {
  X, Loader2, ArrowRightLeft, Undo2, Share2, Camera, Clock, AlertTriangle, CheckSquare, Square,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import AmbilFoto from '@/components/lapangan/AmbilFoto'
import { downscaleWithStamp } from '@/lib/imageUtil'
import { waKe } from '@/lib/waLink'
import { Z_TIRAI, PADDING_BAWAH_TIRAI } from '@/lib/lapisan'
import { asetPinjamApi } from '@/lib/asetPinjamApi'
import {
  masihDipinjam, pinjamanBerjalan, bolehPinjam, siapPinjam, siapKembali,
  lamaHari, terlambat, riwayatAlat, pesanTandaTerima,
  kelengkapanSiapSerah, kelengkapanKurang, kembaliBermasalah, masalahKembali,
  LABEL_KONDISI_SERAH, kondisiSah,
  type Peminjaman, type KondisiSerah,
} from '@/lib/lacakAlat'
import { normalKelengkapan, type AsetAlat } from '@/lib/asetAlat'
import { useAuthStore } from '@/store/authStore'

const inputCls = 'w-full rounded-xl border border-border bg-white px-3 py-2 text-sm '
  + 'focus:outline-none focus:ring-2 focus:ring-gold/40'

const tanggalTampil = (v: unknown): string => {
  const t = Date.parse(String(v ?? ''))
  if (!Number.isFinite(t)) return '-'
  return new Date(t).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function SerahAlat({ alat, daftar, daftarProyek, bolehUbah, onTutup, onBerubah }: {
  alat: AsetAlat
  daftar: Peminjaman[]
  daftarProyek: Array<{ id: string; nama: string }>
  bolehUbah: boolean
  onTutup: () => void
  onBerubah: () => void | Promise<void>
}) {
  const { toast } = useToast()
  // Siapa yang MENCATAT — petugas gudang/admin, bukan peminjamnya. Ketika
  // sebuah catatan dipertanyakan, inilah orang yang ditanya.
  const pencatat = useAuthStore(s => s.profile?.full_name ?? '') || ''
  const [sibuk, setSibuk] = useState(false)
  const [foto, setFoto] = useState('')
  const [olahFoto, setOlahFoto] = useState(false)

  const berjalan = useMemo(() => pinjamanBerjalan(daftar, alat.id), [daftar, alat.id])
  const riwayat = useMemo(() => riwayatAlat(daftar, alat.id), [daftar, alat.id])
  const mode: 'pinjam' | 'kembali' = berjalan ? 'kembali' : 'pinjam'

  // Formulir peminjaman
  const [pemegang, setPemegang] = useState('')
  const [hp, setHp] = useState('')
  const [proyek, setProyek] = useState('')
  const [janji, setJanji] = useState('')
  const [kondisi, setKondisi] = useState<KondisiSerah>(kondisiSah(alat.kondisi))
  const [catatan, setCatatan] = useState('')

  // Kelengkapan yang dicentang. Saat menyerahkan: kelengkapan alatnya, minus
  // yang tidak kembali terakhir kali. Saat menerima kembali: semua yang
  // tercatat ikut diserahkan — yang tidak ada, dihapus centangnya.
  const daftarCentang = mode === 'pinjam'
    ? normalKelengkapan([...normalKelengkapan(alat.kelengkapan)])
    : normalKelengkapan(berjalan?.pinjam_kelengkapan)
  const [centang, setCentang] = useState<string[]>(() => mode === 'pinjam'
    ? kelengkapanSiapSerah(alat.kelengkapan, daftar, alat.id)
    : normalKelengkapan(berjalan?.pinjam_kelengkapan))
  const tandai = (k: string) => setCentang(c => c.includes(k) ? c.filter(x => x !== k) : [...c, k])

  /**
   * Foto dikecilkan DAN dicap di sini, sekali, sebelum disimpan.
   *
   * Mencapnya saat ditampilkan akan terlihat sama di layar tetapi tidak ikut
   * ketika gambarnya disimpan atau diteruskan — dan justru di sanalah capnya
   * dibutuhkan.
   */
  async function ambilFoto(berkas: File[]) {
    const f = berkas[0]
    if (!f) return
    setOlahFoto(true)
    try {
      const nama = [alat.kode, alat.nama].filter(Boolean).join(' · ')
      const ket = mode === 'pinjam' ? `Pinjam · ${nama}` : `Kembali · ${nama}`
      setFoto(await downscaleWithStamp(f, ket, 1000, 0.7))
    } catch (e) {
      toast({
        title: 'Foto gagal diproses', variant: 'destructive',
        description: e instanceof Error ? e.message : String(e),
      })
    } finally { setOlahFoto(false) }
  }

  const drafPinjam: Partial<Peminjaman> = {
    aset_id: alat.id, pemegang, pinjam_at: new Date().toISOString(), pinjam_foto: foto,
  }
  const drafKembali: Partial<Peminjaman> = {
    ...berjalan,
    kembali_at: new Date().toISOString(), kembali_foto: foto,
    kembali_kondisi: kondisi, kembali_catatan: catatan, kembali_kelengkapan: centang,
  }
  // Dihitung saat itu juga, sebelum disimpan — supaya yang kurang terlihat
  // selagi peminjamnya masih berdiri di depan gudang.
  const kurangSekarang = mode === 'kembali' ? kelengkapanKurang(drafKembali) : []
  const bisa = mode === 'pinjam' ? bolehPinjam(daftar, alat.id) : { boleh: true, alasan: '' }
  const siap = mode === 'pinjam' ? siapPinjam(drafPinjam) : siapKembali(drafKembali)

  async function simpan() {
    if (sibuk || !siap.boleh) return
    setSibuk(true)
    try {
      if (mode === 'pinjam') {
        const p = daftarProyek.find(x => x.id === proyek)
        await asetPinjamApi().pinjam({
          aset_id: alat.id,
          // Nama alat DISALIN, tidak diambil lewat relasi. Alat yang namanya
          // diperbaiki setahun kemudian tidak boleh mengubah bunyi tanda
          // terima yang sudah dicetak dan disepakati.
          aset_nama: alat.nama,
          aset_kode: alat.kode ?? '',
          project_id: proyek || null,
          project_nama: p?.nama ?? '',
          pemegang: pemegang.trim(),
          pemegang_hp: hp.trim(),
          pinjam_at: new Date().toISOString(),
          pinjam_oleh: pencatat,
          pinjam_kondisi: kondisi,
          pinjam_foto: foto,
          pinjam_catatan: catatan.trim(),
          pinjam_kelengkapan: normalKelengkapan(centang),
          janji_kembali: janji || null,
          kembali_at: null,
        })
        toast({ title: 'Peminjaman dicatat', description: `${alat.nama} dipegang ${pemegang.trim()}` })
      } else if (berjalan?.id) {
        await asetPinjamApi().kembalikan(berjalan.id, {
          kembali_at: new Date().toISOString(),
          kembali_oleh: pencatat,
          kembali_kondisi: kondisi,
          kembali_foto: foto,
          kembali_catatan: catatan.trim(),
          kembali_kelengkapan: normalKelengkapan(centang),
        })
        toast({
          title: kurangSekarang.length ? 'Pengembalian dicatat — ada yang kurang' : 'Pengembalian dicatat',
          description: kurangSekarang.length ? `Kurang: ${kurangSekarang.join(', ')}` : undefined,
          variant: kurangSekarang.length ? 'destructive' : undefined,
        })
      }
      setFoto(''); setPemegang(''); setHp(''); setCatatan(''); setJanji('')
      await onBerubah()
      onTutup()
    } catch (e) {
      toast({
        title: 'Gagal menyimpan', variant: 'destructive',
        description: e instanceof Error ? e.message : String(e),
      })
    } finally { setSibuk(false) }
  }

  function bagikan(p: Peminjaman) {
    window.open(waKe(p.pemegang_hp ?? '', pesanTandaTerima(p)), '_blank', 'noopener')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center"
      style={{ zIndex: Z_TIRAI }} onClick={onTutup}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl
          max-h-[92vh] flex flex-col min-h-0">

        <div className="flex items-start justify-between gap-2 p-4 pb-2 shrink-0">
          {alat.foto && (
            <img src={alat.foto} alt={alat.nama}
              className="w-12 h-12 rounded-lg object-cover border border-border shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            {alat.kode && (
              <span className="inline-block font-mono text-[10px] font-black text-navy bg-gold/15
                border border-gold/40 rounded px-1.5 py-px tracking-wide break-all">{alat.kode}</span>
            )}
            <h3 className="font-bold text-navy text-sm break-words">{alat.nama}</h3>
            <p className="text-[11px] text-muted-foreground break-words">
              {berjalan
                ? `Dipegang ${berjalan.pemegang}${berjalan.project_nama ? ` · ${berjalan.project_nama}` : ''}`
                + ` · ${lamaHari(berjalan)} hari`
                : 'Di gudang'}
            </p>
          </div>
          <button onClick={onTutup} aria-label="Tutup"
            className="p-1 text-muted-foreground hover:text-navy shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 space-y-3">
          {berjalan && terlambat(berjalan) && (
            <p className="flex items-start gap-1.5 text-[11px] text-rose-800 bg-rose-50
              border border-rose-200 rounded-xl p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              Sudah lewat janji kembali {tanggalTampil(berjalan.janji_kembali)}.
            </p>
          )}

          {bolehUbah && !bisa.boleh && (
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200
              rounded-xl p-2.5">{bisa.alasan}</p>
          )}

          {bolehUbah && (
            <div className="rounded-2xl border border-border p-3 space-y-2.5">
              <p className="text-[11px] font-black uppercase tracking-wide text-navy">
                {mode === 'pinjam' ? 'Catat peminjaman' : 'Catat pengembalian'}
              </p>

              {mode === 'pinjam' && (
                <>
                  <input data-uji="pemegang" value={pemegang} placeholder="Nama yang membawa alatnya"
                    onChange={e => setPemegang(e.target.value)} className={inputCls} />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={hp} placeholder="No. HP (opsional)" inputMode="tel"
                      onChange={e => setHp(e.target.value)} className={inputCls} />
                    <select value={proyek} onChange={e => setProyek(e.target.value)}
                      aria-label="Dibawa ke proyek" className={inputCls}>
                      <option value="">Tanpa proyek</option>
                      {daftarProyek.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
                    </select>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      Janji dikembalikan (boleh kosong)
                    </span>
                    <input type="date" value={janji} onChange={e => setJanji(e.target.value)}
                      className={inputCls} />
                  </label>
                </>
              )}

              {daftarCentang.length > 0 ? (
                <div data-centang-kelengkapan className="space-y-1">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {mode === 'pinjam' ? 'Kelengkapan yang ikut diserahkan' : 'Kelengkapan yang ikut kembali'}
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {daftarCentang.map(k => {
                      const ya = centang.includes(k)
                      const kurang = mode === 'kembali' && !ya
                      return (
                        <button key={k} type="button" data-butir-centang onClick={() => tandai(k)}
                          aria-pressed={ya}
                          className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left
                            text-[11px] font-semibold break-words ${
                            kurang ? 'border-rose-300 bg-rose-50 text-rose-800'
                              : ya ? 'border-navy/30 bg-navy/[0.04] text-navy' : 'border-border text-muted-foreground'}`}>
                          {ya ? <CheckSquare className="w-3.5 h-3.5 shrink-0" /> : <Square className="w-3.5 h-3.5 shrink-0" />}
                          {k}
                        </button>
                      )
                    })}
                  </div>
                  {kurangSekarang.length > 0 && (
                    <p data-kurang-sekarang className="text-[11px] font-bold text-rose-700">
                      Kurang: {kurangSekarang.join(', ')} — tercatat atas nama {berjalan?.pemegang}.
                    </p>
                  )}
                </div>
              ) : mode === 'pinjam' && (
                <p className="text-[10px] text-muted-foreground">
                  Alat ini belum punya daftar kelengkapan — isi lewat “Ubah data” supaya yang kurang
                  saat kembali bisa ketahuan.
                </p>
              )}

              <label className="block space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground">
                  Kondisi saat {mode === 'pinjam' ? 'diserahkan' : 'dikembalikan'}
                </span>
                <select value={kondisi} aria-label="Kondisi alat"
                  onChange={e => setKondisi(kondisiSah(e.target.value))} className={inputCls}>
                  {(Object.keys(LABEL_KONDISI_SERAH) as KondisiSerah[]).map(k => (
                    <option key={k} value={k}>{LABEL_KONDISI_SERAH[k]}</option>
                  ))}
                </select>
              </label>

              <textarea value={catatan} onChange={e => setCatatan(e.target.value)} rows={2}
                placeholder={mode === 'kembali' && kembaliBermasalah(drafKembali)
                  ? 'Wajib: apa yang terjadi? mis. cover patah di lokasi, kunci hilang'
                  : 'Catatan, mis. kabel roll ikut dibawa'}
                className={`${inputCls} ${mode === 'kembali' && kembaliBermasalah(drafKembali) && !catatan.trim()
                  ? 'border-rose-300' : ''}`} />

              {/* Foto WAJIB, dan capnya dibakar ke dalam gambarnya. Tanggal
                  yang hanya tersimpan di baris database membuktikan waktunya
                  hanya bagi yang percaya pada barisnya — dan perselisihan soal
                  alat lecet berlangsung di WhatsApp, tempat barisnya tidak
                  ikut. */}
              <div className="space-y-1.5">
                <AmbilFoto onPilih={ambilFoto} sibuk={olahFoto} arah="belakang" />
                <p className="text-[10px] text-muted-foreground">
                  Wajib. Tanggal & jam otomatis tercetak di fotonya.
                </p>
                {foto && (
                  <img data-foto-serah src={foto} alt="Foto alat saat serah terima"
                    className="w-full rounded-xl border border-border" />
                )}
              </div>

              {!siap.boleh && <p className="text-[11px] text-amber-800">{siap.alasan}</p>}

              <Button data-simpan-serah onClick={() => void simpan()}
                disabled={!siap.boleh || !bisa.boleh || sibuk || olahFoto}
                className="w-full gap-1.5 bg-navy hover:bg-navy/90 font-bold h-10">
                {sibuk ? <Loader2 className="w-4 h-4 animate-spin" />
                  : mode === 'pinjam' ? <ArrowRightLeft className="w-4 h-4" />
                    : <Undo2 className="w-4 h-4" />}
                {mode === 'pinjam' ? 'Serahkan alat' : 'Terima kembali'}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-wide text-navy">
              Riwayat ({riwayat.length})
            </p>
            {riwayat.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-2">
                Belum pernah dipinjamkan lewat aplikasi.
              </p>
            ) : riwayat.map(p => (
              <div key={p.id ?? p.pinjam_at} data-riwayat-pinjam
                className={`rounded-xl border p-2.5 space-y-1.5 ${
                  masihDipinjam(p) ? 'border-navy/30 bg-navy/[0.03]' : 'border-border'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-navy break-words">
                      {p.pemegang}{p.pemegang_hp ? ` · ${p.pemegang_hp}` : ''}
                    </p>
                    <p className="text-[10px] text-muted-foreground break-words">
                      {p.project_nama || 'tanpa proyek'} · {lamaHari(p)} hari
                    </p>
                  </div>
                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0
                    ${masihDipinjam(p) ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                    {masihDipinjam(p) ? 'Di luar' : 'Kembali'}
                  </span>
                </div>

                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  <p className="flex items-center gap-1">
                    <Clock className="w-3 h-3 shrink-0" />
                    Pinjam {tanggalTampil(p.pinjam_at)} · {LABEL_KONDISI_SERAH[kondisiSah(p.pinjam_kondisi)]}
                  </p>
                  {!masihDipinjam(p) && (
                    <p className="flex items-center gap-1">
                      <Undo2 className="w-3 h-3 shrink-0" />
                      Kembali {tanggalTampil(p.kembali_at)} · {LABEL_KONDISI_SERAH[kondisiSah(p.kembali_kondisi)]}
                    </p>
                  )}
                </div>

                {normalKelengkapan(p.pinjam_kelengkapan).length > 0 && (
                  <p className="text-[10px] text-muted-foreground break-words">
                    Diserahkan bersama: {normalKelengkapan(p.pinjam_kelengkapan).join(', ')}
                  </p>
                )}
                {kembaliBermasalah(p) && (
                  <p data-masalah-riwayat className="text-[10px] font-bold text-rose-700 break-words">
                    {masalahKembali(p)}
                  </p>
                )}
                {(p.pinjam_catatan || p.kembali_catatan) && (
                  <div className="text-[10px] text-navy/80 space-y-0.5 break-words">
                    {p.pinjam_catatan && <p>Saat pinjam: “{p.pinjam_catatan}”</p>}
                    {p.kembali_catatan && <p>Saat kembali: “{p.kembali_catatan}”</p>}
                  </div>
                )}
                {(p.pinjam_oleh || p.kembali_oleh) && (
                  <p className="text-[9px] text-muted-foreground break-words">
                    Dicatat {[p.pinjam_oleh && `serah: ${p.pinjam_oleh}`, p.kembali_oleh && `terima: ${p.kembali_oleh}`]
                      .filter(Boolean).join(' · ')}
                  </p>
                )}

                {(p.pinjam_foto || p.kembali_foto) && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {p.pinjam_foto && (
                      <figure className="space-y-0.5">
                        <img src={p.pinjam_foto} alt="Saat dipinjam"
                          className="w-full rounded-lg border border-border" />
                        <figcaption className="text-[9px] text-muted-foreground">Saat dipinjam</figcaption>
                      </figure>
                    )}
                    {p.kembali_foto && (
                      <figure className="space-y-0.5">
                        <img src={p.kembali_foto} alt="Saat dikembalikan"
                          className="w-full rounded-lg border border-border" />
                        <figcaption className="text-[9px] text-muted-foreground">Saat dikembalikan</figcaption>
                      </figure>
                    )}
                  </div>
                )}

                {/* Teksnya saja yang dikirim; `wa.me` memang tidak bisa membawa
                    gambar. Justru karena itu capnya dibakar ke dalam foto —
                    begitu keduanya berpisah, hanya yang tercetak di gambar
                    yang pasti ikut. */}
                <button data-bagikan-tt onClick={() => bagikan(p)}
                  className="flex items-center gap-1 text-[10px] font-bold text-navy underline">
                  <Share2 className="w-3 h-3" /> Kirim tanda terima
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className={`px-4 pt-2 shrink-0 ${PADDING_BAWAH_TIRAI}`}>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            <Camera className="w-3 h-3 inline-block mr-0.5 -mt-px" />
            Cap tanggal & jam ikut tercetak di gambarnya, jadi tetap terbaca saat
            fotonya diteruskan lewat WhatsApp.
          </p>
        </div>
      </div>
    </div>
  )
}
