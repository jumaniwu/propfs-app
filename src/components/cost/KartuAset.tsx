// ============================================================
// PropFS — Satu alat di daftar Aset & Alat
//
// Yang harus terbaca TANPA mengetuk apa pun:
//   - alat yang mana: foto + nomor aset (lima gerinda sama-sama "Gerinda");
//   - di mana sekarang: siapa yang memegang, di proyek mana, sejak kapan;
//   - apakah terakhir kali ia kembali dengan kurang atau rusak, dan dari
//     tangan siapa.
// Rinciannya — foto saat dipinjam & saat kembali — ada di jendela
// serah-terima.
// ============================================================
import {
  ArrowRightLeft, MapPin, Warehouse, AlertTriangle, ImageOff, Pencil, History, Clock,
} from 'lucide-react'
import {
  nilaiBuku, sisaUmur, lokasiAlat, masihDimiliki, kurangDataAset, normalKelengkapan,
  LABEL_KONDISI, TONE_KONDISI,
  type AsetAlat, type KondisiAlat,
} from '@/lib/asetAlat'
import {
  pinjamanBerjalan, terlambat, lamaHari, pengembalianTerakhir, kembaliBermasalah, masalahKembali,
  type Peminjaman,
} from '@/lib/lacakAlat'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`

export const tanggalJam = (v: unknown): string => {
  const t = Date.parse(String(v ?? ''))
  if (!Number.isFinite(t)) return '-'
  return new Date(t).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
const tanggalSaja = (v: unknown): string => {
  const t = Date.parse(String(v ?? ''))
  if (!Number.isFinite(t)) return '-'
  return new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function KartuAset({
  alat: a, pinjaman, daftarProyek, bolehUbah, hariIni, onSerah, onUbahKondisi, onLengkapi, onLepas,
}: {
  alat: AsetAlat
  pinjaman: Peminjaman[]
  daftarProyek: Array<{ id: string; nama: string }>
  bolehUbah: boolean
  hariIni: Date
  onSerah: () => void
  onUbahKondisi: (k: KondisiAlat) => void
  onLengkapi: () => void
  onLepas: () => void
}) {
  const berjalan = pinjamanBerjalan(pinjaman, a.id)
  const lewat = !!berjalan && terlambat(berjalan)
  const terakhir = pengembalianTerakhir(pinjaman, a.id)
  const masalah = !berjalan && terakhir && kembaliBermasalah(terakhir) ? terakhir : undefined
  const kurangData = kurangDataAset(a)
  const dimiliki = masihDimiliki(a)
  const kelengkapan = normalKelengkapan(a.kelengkapan)

  return (
    <div data-kartu-aset className={`rounded-xl border p-3 space-y-2 min-w-0 ${
      dimiliki ? (lewat || masalah ? 'border-rose-200' : 'border-border') : 'border-border bg-slate-50 opacity-70'}`}>

      <div className="flex items-start gap-2.5">
        {a.foto ? (
          <button type="button" onClick={onSerah} aria-label={`Lihat ${a.nama}`} className="shrink-0">
            <img data-foto-kartu src={a.foto} alt={a.nama}
              className="w-14 h-14 rounded-lg object-cover border border-border bg-slate-50" />
          </button>
        ) : (
          <div className="w-14 h-14 rounded-lg border border-dashed border-border bg-slate-50 shrink-0
            flex flex-col items-center justify-center text-muted-foreground">
            <ImageOff className="w-4 h-4" />
            <span className="text-[8px] mt-0.5">tanpa foto</span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          {a.kode ? (
            <span data-nomor-aset className="inline-block font-mono text-[11px] font-black text-navy
              bg-gold/15 border border-gold/40 rounded px-1.5 py-px tracking-wide break-all">
              {a.kode}
            </span>
          ) : (
            <span className="inline-block text-[10px] font-bold text-amber-800 bg-amber-50
              border border-amber-200 rounded px-1.5 py-px">tanpa nomor aset</span>
          )}
          <p className="text-xs font-bold text-navy break-words mt-0.5">{a.nama}</p>
          <p className="text-[10px] text-muted-foreground break-words">
            {[a.merek, a.nomor_seri].filter(Boolean).join(' · ') || 'tanpa merek'}
            {' · beli '}{a.tanggal_beli}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-xs font-bold text-navy tabular-nums">{fmt(nilaiBuku(a, hariIni))}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">dari {fmt(a.harga)}</p>
        </div>
      </div>

      {/* ── Di mana sekarang ─────────────────────────────────── */}
      {berjalan ? (
        <div data-status-pinjam className={`rounded-lg border p-2 space-y-0.5 ${
          lewat ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50/70'}`}>
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-navy break-words">
            <span className={`text-[9px] font-black uppercase px-1.5 py-px rounded-full shrink-0 ${
              lewat ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'}`}>
              {lewat ? 'Lewat janji' : 'Dipinjam'}
            </span>
            {berjalan.pemegang}{berjalan.pemegang_hp ? ` · ${berjalan.pemegang_hp}` : ''}
          </p>
          <p className="flex items-center gap-1 text-[10px] text-navy/80 break-words">
            <MapPin className="w-3 h-3 shrink-0" />
            {berjalan.project_nama || 'Tanpa proyek'}
          </p>
          <p className="flex items-center gap-1 text-[10px] text-navy/80 break-words">
            <Clock className="w-3 h-3 shrink-0" />
            Sejak {tanggalJam(berjalan.pinjam_at)} · {lamaHari(berjalan) === 0 ? 'hari ini' : `${lamaHari(berjalan)} hari`}
            {berjalan.janji_kembali ? ` · janji kembali ${tanggalSaja(berjalan.janji_kembali)}` : ''}
          </p>
          {normalKelengkapan(berjalan.pinjam_kelengkapan).length > 0 && (
            <p className="text-[10px] text-navy/70 break-words">
              Ikut dibawa: {normalKelengkapan(berjalan.pinjam_kelengkapan).join(', ')}
            </p>
          )}
        </div>
      ) : dimiliki && (
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {a.lokasi_project_id
            ? <><MapPin className="w-3 h-3 shrink-0" /> {lokasiAlat(a, daftarProyek)}</>
            : <><Warehouse className="w-3 h-3 shrink-0" /> Di gudang</>}
        </p>
      )}

      {/* ── Masalah pengembalian terakhir ────────────────────── */}
      {masalah && (
        <div data-masalah-kembali className="rounded-lg border border-rose-200 bg-rose-50 p-2 space-y-0.5">
          <p className="flex items-start gap-1 text-[10px] font-bold text-rose-800 break-words">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
            {masalahKembali(masalah)}
          </p>
          <p className="text-[10px] text-rose-800/80 break-words">
            Dikembalikan {masalah.pemegang} · {tanggalJam(masalah.kembali_at)}
            {masalah.project_nama ? ` · dari ${masalah.project_nama}` : ''}
          </p>
          {masalah.kembali_catatan && (
            <p className="text-[10px] text-rose-900 break-words">“{masalah.kembali_catatan}”</p>
          )}
        </div>
      )}

      {kelengkapan.length > 0 && !berjalan && (
        <p className="text-[10px] text-muted-foreground break-words">
          Kelengkapan: {kelengkapan.join(', ')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full
          ${TONE_KONDISI[a.kondisi] ?? TONE_KONDISI.baik}`}>{LABEL_KONDISI[a.kondisi] ?? a.kondisi}</span>
        {dimiliki && (
          <span className="text-[10px] text-muted-foreground">
            {sisaUmur(a, hariIni) > 0 ? `sisa ${sisaUmur(a, hariIni)} bln` : 'umur habis'}
          </span>
        )}
        {!dimiliki && <span className="text-[10px] text-muted-foreground">sudah dilepas</span>}
      </div>

      {bolehUbah && dimiliki && kurangData.length > 0 && (
        <button type="button" data-lengkapi-aset onClick={onLengkapi}
          className="w-full rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-left
            text-[10px] font-bold text-amber-900">
          Belum ada {kurangData.join(' & ')} — ketuk untuk melengkapi
        </button>
      )}

      {dimiliki && (
        <div className="grid grid-cols-2 gap-2">
          {bolehUbah && !a.kode && !berjalan ? (
            // Serah-terima tanpa nomor aset tidak menunjuk alat yang mana —
            // padahal itulah gunanya tanda terima. Nomornya dilengkapi dulu.
            // Hanya untuk MENYERAHKAN: alat lama yang sedang di luar tetap
            // harus bisa dicatat kembali, bernomor atau tidak.
            <button type="button" onClick={onLengkapi}
              className="h-8 rounded-lg border border-dashed border-amber-400 px-2 text-[10px]
                font-bold text-amber-900">
              Isi nomor aset dulu
            </button>
          ) : (
            <button type="button" data-serah-alat onClick={onSerah}
              className="h-8 rounded-lg border border-navy/30 bg-navy/[0.04] px-2
                flex items-center justify-center gap-1 text-[11px] font-bold text-navy hover:bg-navy/10">
              {bolehUbah
                ? <><ArrowRightLeft className="w-3 h-3 shrink-0" />{berjalan ? 'Catat kembali' : 'Serahkan'}</>
                : <><History className="w-3 h-3 shrink-0" />Riwayat</>}
            </button>
          )}
          {bolehUbah && (berjalan ? (
            // Selama alatnya di luar, kondisinya ditentukan saat ia KEMBALI —
            // dua penulis untuk satu jawaban pasti berselisih.
            <span className="h-8 rounded-lg border border-dashed border-border px-2
              flex items-center justify-center text-[10px] text-muted-foreground text-center">
              Kondisi diisi saat kembali
            </span>
          ) : (
            <select value={a.kondisi} aria-label={`Kondisi ${a.nama}`}
              onChange={e => onUbahKondisi(e.target.value as KondisiAlat)}
              className="h-8 rounded-lg border border-border px-2 text-[11px] font-semibold text-navy">
              {(Object.keys(LABEL_KONDISI) as KondisiAlat[]).map(k => (
                <option key={k} value={k}>{LABEL_KONDISI[k]}</option>
              ))}
            </select>
          ))}
        </div>
      )}

      {bolehUbah && dimiliki && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" data-ubah-aset onClick={onLengkapi}
            className="flex items-center gap-1 text-[10px] font-bold text-navy underline">
            <Pencil className="w-3 h-3" /> Ubah data / foto / kelengkapan
          </button>
          {(a.kode || berjalan) && (
            <button type="button" onClick={onSerah}
              className="flex items-center gap-1 text-[10px] font-bold text-navy underline">
              <History className="w-3 h-3" /> Riwayat pinjam
            </button>
          )}
          <button type="button" data-lepas-aset onClick={onLepas}
            className="text-[10px] font-bold text-muted-foreground underline">
            Tandai sudah dilepas / dijual
          </button>
        </div>
      )}
    </div>
  )
}
