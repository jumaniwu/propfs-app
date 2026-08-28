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
  X, Loader2, ArrowRightLeft, Undo2, Share2, Camera, Clock, AlertTriangle,
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
  lamaHari, terlambat, kondisiMemburuk, riwayatAlat, pesanTandaTerima,
  LABEL_KONDISI_SERAH, kondisiSah,
  type Peminjaman, type KondisiSerah,
} from '@/lib/lacakAlat'
import type { AsetAlat } from '@/lib/asetAlat'

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
      const ket = mode === 'pinjam'
        ? `Pinjam · ${alat.nama}`
        : `Kembali · ${alat.nama}`
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
    pinjam_at: berjalan?.pinjam_at, kembali_at: new Date().toISOString(), kembali_foto: foto,
  }
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
          project_id: proyek || null,
          project_nama: p?.nama ?? '',
          pemegang: pemegang.trim(),
          pemegang_hp: hp.trim(),
          pinjam_at: new Date().toISOString(),
          pinjam_kondisi: kondisi,
          pinjam_foto: foto,
          pinjam_catatan: catatan.trim(),
          janji_kembali: janji || null,
          kembali_at: null,
        })
        toast({ title: 'Peminjaman dicatat', description: `${alat.nama} dipegang ${pemegang.trim()}` })
      } else if (berjalan?.id) {
        await asetPinjamApi().kembalikan(berjalan.id, {
          kembali_at: new Date().toISOString(),
          kembali_kondisi: kondisi,
          kembali_foto: foto,
          kembali_catatan: catatan.trim(),
        })
        toast({ title: 'Pengembalian dicatat' })
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
          <div className="min-w-0">
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
                placeholder="Catatan, mis. kabel roll ikut dibawa" className={inputCls} />

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
                    <p className="text-xs font-bold text-navy break-words">{p.pemegang}</p>
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

                {kondisiMemburuk(p) && (
                  <p className="text-[10px] font-bold text-rose-700">
                    Kondisi menurun selama dipinjam.
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
