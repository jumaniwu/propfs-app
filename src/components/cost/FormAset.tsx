// ============================================================
// PropFS — Formulir alat kerja: catat baru, atau lengkapi yang lama
//
// Tiga isian yang menentukan apakah sebuah alat bisa dilacak sama sekali:
//
//   NOMOR ASET — satu-satunya pembeda lima gerinda bermerek sama. Diusulkan
//     otomatis, tetapi tetap bisa diketik: alat yang SUDAH ditulisi nomor di
//     badannya harus dicatat dengan nomor yang tertulis itu.
//   FOTO — bukti alatnya ada dan rupanya seperti apa. Wajib; capnya dibakar
//     ke dalam gambar.
//   KELENGKAPAN — apa yang seharusnya ikut. Tanpa daftar ini, "ada yang
//     kurang waktu dikembalikan?" tidak bisa dijawab siapa pun.
//
// Mode "ubah" hanya menyentuh identitas alat. Harga, tanggal beli, dan umur
// ekonomis tidak bisa diubah dari sini: ketiganya menentukan penyusutan yang
// sudah masuk laporan bulan-bulan sebelumnya.
// ============================================================
import { useMemo, useState } from 'react'
import { X, Plus, Loader2, Hash, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import AmbilFoto from '@/components/lapangan/AmbilFoto'
import { downscaleWithStamp } from '@/lib/imageUtil'
import {
  siapSimpanAset, siapIdentitasAset, usulNomorAset, normalNomorAset, nomorAsetKembar,
  normalKelengkapan, USUL_KELENGKAPAN, PILIHAN_UMUR,
  type AsetAlat,
} from '@/lib/asetAlat'

const inputCls = 'w-full rounded-xl border border-border bg-white px-3 py-2 text-sm '
  + 'focus:outline-none focus:ring-2 focus:ring-gold/40'

export type DrafAset = Omit<AsetAlat, 'id'> & { id?: string }

export default function FormAset({ awal, mode, daftar, singkatan, onBatal, onSimpan }: {
  awal: DrafAset
  mode: 'baru' | 'ubah'
  /** Seluruh alat — untuk usulan nomor & pemeriksaan nomor kembar. */
  daftar: AsetAlat[]
  /** Singkatan perusahaan untuk alat PERTAMA; berikutnya mengikuti nomor yang ada. */
  singkatan: string
  onBatal: () => void
  onSimpan: (d: DrafAset) => Promise<void>
}) {
  const { toast } = useToast()
  const [draf, setDraf] = useState<DrafAset>(() => ({
    ...awal,
    kelengkapan: normalKelengkapan(awal.kelengkapan),
    // Alat baru langsung diberi usulan nomor. Alat lama yang belum bernomor
    // TIDAK: nomornya harus disalin dari badan alatnya, dan usulan yang sudah
    // terisi terlalu mudah tersimpan begitu saja.
    kode: awal.kode || (mode === 'baru' ? usulNomorAset(daftar, { singkatan, tanggal: awal.tanggal_beli }) : ''),
  }))
  const [kodeDiketik, setKodeDiketik] = useState(!!awal.kode || mode === 'ubah')
  const [butir, setButir] = useState('')
  const [olahFoto, setOlahFoto] = useState(false)
  const [sibuk, setSibuk] = useState(false)

  const usulan = useMemo(
    () => usulNomorAset(daftar, { singkatan, tanggal: draf.tanggal_beli }),
    [daftar, singkatan, draf.tanggal_beli],
  )
  const kembar = nomorAsetKembar(daftar, draf.kode, draf.id)
  const siap = mode === 'baru' ? siapSimpanAset(draf, daftar) : siapIdentitasAset(draf, daftar)
  const set = (patch: Partial<DrafAset>) => setDraf(d => ({ ...d, ...patch }))

  async function ambilFoto(berkas: File[]) {
    const f = berkas[0]
    if (!f) return
    setOlahFoto(true)
    try {
      const ket = [normalNomorAset(draf.kode), draf.nama.trim()].filter(Boolean).join(' · ')
      set({ foto: await downscaleWithStamp(f, ket ? `Aset ${ket}` : 'Aset', 900, 0.65) })
    } catch (e) {
      toast({
        title: 'Foto gagal diproses', variant: 'destructive',
        description: e instanceof Error ? e.message : String(e),
      })
    } finally { setOlahFoto(false) }
  }

  function tambahButir(teks: string) {
    const baru = normalKelengkapan([...(draf.kelengkapan ?? []), teks])
    set({ kelengkapan: baru })
    setButir('')
  }

  async function simpan() {
    if (!siap.boleh || sibuk) return
    setSibuk(true)
    try {
      await onSimpan({
        ...draf,
        nama: draf.nama.trim(),
        kode: normalNomorAset(draf.kode),
        kelengkapan: normalKelengkapan(draf.kelengkapan),
      })
    } finally { setSibuk(false) }
  }

  const belumDipakai = USUL_KELENGKAPAN.filter(u =>
    !(draf.kelengkapan ?? []).some(k => k.toLowerCase() === u.toLowerCase()))

  return (
    <div data-form-aset className="rounded-xl border-2 border-gold/40 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-navy">{mode === 'baru' ? 'Catat alat' : 'Lengkapi data alat'}</p>
        <button onClick={onBatal} aria-label="Tutup formulir"
          className="text-muted-foreground hover:text-navy"><X className="w-4 h-4" /></button>
      </div>

      <input data-aset-nama value={draf.nama} placeholder="Nama alat, mis. Gerinda tangan 4 inch"
        onChange={e => set({ nama: e.target.value })}
        className={`${inputCls} font-semibold`} />

      {/* ── Nomor aset ───────────────────────────────────────── */}
      <label className="block space-y-1">
        <span className="text-[10px] font-bold text-navy flex items-center gap-1">
          <Hash className="w-3 h-3" /> Nomor aset
        </span>
        <input data-aset-kode value={draf.kode} placeholder="mis. 008/NBI/XI/26"
          autoCapitalize="characters" spellCheck={false}
          onChange={e => { setKodeDiketik(true); set({ kode: e.target.value }) }}
          onBlur={() => set({ kode: normalNomorAset(draf.kode) })}
          className={`${inputCls} font-mono font-bold tracking-wide uppercase ${
            kembar ? 'border-rose-400 ring-1 ring-rose-300' : ''}`} />
        {kembar ? (
          <span className="block text-[10px] font-bold text-rose-700 leading-relaxed">
            Sudah dipakai {String(kembar.nama ?? 'alat lain')}. Nomor berikutnya: {' '}
            <button type="button" data-pakai-usulan onClick={() => { setKodeDiketik(false); set({ kode: usulan }) }}
              className="font-mono font-bold text-navy underline">{usulan}</button>
          </span>
        ) : (
          <span className="block text-[10px] text-muted-foreground leading-relaxed">
            Samakan dengan yang tertulis di badan alatnya.
            {normalNomorAset(draf.kode) !== usulan && (
              <> Nomor berikutnya: {' '}
                <button type="button" data-pakai-usulan onClick={() => { setKodeDiketik(false); set({ kode: usulan }) }}
                  className="font-mono font-bold text-navy underline">{usulan}</button>
              </>
            )}
          </span>
        )}
      </label>

      <div className="grid grid-cols-2 gap-2">
        <input value={draf.merek} placeholder="Merek"
          onChange={e => set({ merek: e.target.value })} className={inputCls} />
        <input value={draf.nomor_seri} placeholder="Nomor seri pabrik"
          onChange={e => set({ nomor_seri: e.target.value })} className={inputCls} />
      </div>

      {/* ── Foto ─────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-navy">Foto alat</span>
        {draf.foto ? (
          <div className="relative">
            <img data-foto-aset src={draf.foto} alt="Foto alat"
              className="w-full max-h-64 object-contain rounded-xl border border-border bg-slate-50" />
            <button type="button" onClick={() => set({ foto: '' })}
              className="absolute top-1.5 right-1.5 rounded-full bg-white/90 border border-border p-1"
              aria-label="Ganti foto"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <AmbilFoto onPilih={ambilFoto} sibuk={olahFoto} arah="belakang" />
        )}
        <p className="text-[10px] text-muted-foreground">
          Wajib. Usahakan nomor asetnya ikut terlihat; tanggal & jam tercetak otomatis.
        </p>
      </div>

      {/* ── Kelengkapan ──────────────────────────────────────── */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-navy">Kelengkapan yang ikut</span>
        {(draf.kelengkapan ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {(draf.kelengkapan ?? []).map(k => (
              <span key={k} data-butir-kelengkapan
                className="inline-flex items-center gap-1 rounded-full bg-navy/[0.06] border border-navy/20
                  pl-2.5 pr-1 py-0.5 text-[11px] font-semibold text-navy">
                {k}
                <button type="button" aria-label={`Hapus ${k}`}
                  onClick={() => set({ kelengkapan: (draf.kelengkapan ?? []).filter(x => x !== k) })}
                  className="rounded-full p-0.5 hover:bg-navy/10"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input data-isian-kelengkapan value={butir} placeholder="mis. Cover pelindung"
            onChange={e => setButir(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (butir.trim()) tambahButir(butir) } }}
            className={inputCls} />
          <Button type="button" size="sm" disabled={!butir.trim()} onClick={() => tambahButir(butir)}
            className="h-auto shrink-0 bg-navy hover:bg-navy/90 px-3" aria-label="Tambah kelengkapan">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {belumDipakai.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {belumDipakai.map(u => (
              <button key={u} type="button" onClick={() => tambahButir(u)}
                className="rounded-full border border-dashed border-border px-2 py-0.5
                  text-[10px] text-muted-foreground hover:text-navy hover:border-navy/40">
                + {u}
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          Dicentang saat alat diserahkan dan diperiksa saat kembali — yang tidak kembali tercatat kurang.
        </p>
      </div>

      {mode === 'baru' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground">Tanggal beli</span>
            <input type="date" data-aset-tanggal value={draf.tanggal_beli}
              onChange={e => {
                const tanggal_beli = e.target.value
                // Usulan nomor mengikuti bulan beli — selama nomornya belum
                // diketik sendiri. Yang diketik tidak pernah ditimpa.
                set(kodeDiketik ? { tanggal_beli }
                  : { tanggal_beli, kode: usulNomorAset(daftar, { singkatan, tanggal: tanggal_beli }) })
              }}
              className={inputCls} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground">Harga (Rp)</span>
            <input type="number" min={0} data-aset-harga value={draf.harga || ''}
              onChange={e => set({ harga: Number(e.target.value) || 0 })}
              inputMode="numeric" className={inputCls} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground">Umur ekonomis</span>
            <select value={draf.umur_bulan} data-aset-umur
              onChange={e => set({ umur_bulan: Number(e.target.value) })} className={inputCls}>
              {PILIHAN_UMUR.map(p => <option key={p.bulan} value={p.bulan}>{p.label}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground">Nilai residu (Rp)</span>
            <input type="number" min={0} value={draf.nilai_residu || ''}
              onChange={e => set({ nilai_residu: Number(e.target.value) || 0 })}
              placeholder="0" inputMode="numeric" className={inputCls} />
          </label>
        </div>
      )}

      {!siap.boleh && <p data-alasan-aset className="text-[11px] text-amber-800">{siap.alasan}</p>}
      <Button data-simpan-aset onClick={() => void simpan()} disabled={!siap.boleh || sibuk || olahFoto}
        className="w-full gap-1.5 bg-navy hover:bg-navy/90 font-bold h-10">
        {sibuk ? <Loader2 className="w-4 h-4 animate-spin" />
          : mode === 'baru' ? <Plus className="w-4 h-4" /> : <Check className="w-4 h-4" />}
        {mode === 'baru' ? 'Simpan Alat' : 'Simpan Perubahan'}
      </Button>
    </div>
  )
}
