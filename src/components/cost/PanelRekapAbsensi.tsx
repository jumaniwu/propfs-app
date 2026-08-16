// ============================================================
// Rekap absensi tukang — apa yang sebenarnya dicari orang di sini
//
// Laporan harian dibaca sekali, lalu tidak pernah dibuka lagi. Yang dibuka
// tiap akhir pekan adalah pertanyaan yang berbeda: siapa masuk berapa hari.
// Itulah dasar orang dibayar, dan tanpa panel ini jawabannya hanya bisa
// didapat dengan membuka tiga puluh kartu laporan satu per satu.
//
// Ada DUA pertanyaan yang berbeda, jadi dua tampilan:
//
//   PER BULAN   — siapa masuk berapa hari. Dibuka untuk mengawasi.
//   UPAH MINGGUAN — berapa yang harus dibayar Sabtu ini. Dibuka untuk membayar.
//
// Nominal upah hanya muncul DI SINI, di panel kantor. Ia tidak pernah ikut ke
// halaman bertoken yang dibuka mandor: tarif tiap tukang bukan angka yang
// boleh tersebar bersama link laporan.
// ============================================================
import { useMemo, useState } from 'react'
import { Users, FileSpreadsheet, CalendarRange } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { simpanXlsx } from '@/lib/unduhBerkas'
import {
  rekapAbsensi, totalRekap, bulat, STATUS_HADIR, type SumberAbsensi,
} from '@/lib/absensiPekerja'
import {
  rekapUpahMingguan, upahBelumDiisi, type PekerjaLapangan,
} from '@/lib/pekerjaLapangan'
import {
  kelompokPerBulan, pilihanBulan, labelBulanPanjang, bulanBerjalan, SEMUA_BULAN,
} from '@/lib/kelompokBulan'

export default function PanelRekapAbsensi({ laporan, pekerja, namaProyek }: {
  laporan: SumberAbsensi[]
  /** Daftar pekerja terdaftar — tarif hariannya ada di sini, bukan di absensi. */
  pekerja?: PekerjaLapangan[]
  namaProyek: string
}) {
  // Dua pertanyaan yang berbeda, jadi dua tampilan:
  //   BULANAN  — siapa masuk berapa hari (HOK). Untuk mengawasi.
  //   MINGGUAN — berapa yang harus dibayar Sabtu ini. Untuk membayar.
  const [lingkup, setLingkup] = useState<'bulanan' | 'mingguan'>('bulanan')
  // Hanya laporan yang MEMBAWA absensi yang ikut menyusun pemilih bulan.
  // Bulan-bulan sebelum fitur ini ada tidak punya satu nama pun di dalamnya,
  // dan menawarkannya berarti menawarkan halaman kosong.
  const berabsensi = useMemo(
    () => laporan.filter(l => (l.absensi?.length ?? 0) > 0),
    [laporan],
  )

  const kelompok = useMemo(
    () => kelompokPerBulan(berabsensi, l => l.tanggal),
    [berabsensi],
  )
  const opsi = useMemo(() => pilihanBulan(kelompok), [kelompok])

  // Bulan berjalan yang dibuka lebih dulu — itu yang sedang dihitung orang.
  // Kalau bulan ini belum ada absensinya, jatuh ke bulan terbaru yang ada,
  // supaya panel ini tidak pernah membuka diri dalam keadaan kosong.
  const [pilihan, setPilihan] = useState<string>(() => {
    const kini = bulanBerjalan()
    const grup = kelompokPerBulan(
      laporan.filter(l => (l.absensi?.length ?? 0) > 0), l => l.tanggal)
    return grup.some(k => k.bulan === kini) ? kini : (grup[0]?.bulan ?? SEMUA_BULAN)
  })

  const terpilih = useMemo(
    () => pilihan === SEMUA_BULAN
      ? berabsensi
      : (kelompok.find(k => k.bulan === pilihan)?.baris ?? []),
    [berabsensi, kelompok, pilihan],
  )

  const rekap = useMemo(() => rekapAbsensi(terpilih), [terpilih])
  const total = useMemo(() => totalRekap(rekap), [rekap])
  const labelPeriode = pilihan === SEMUA_BULAN ? 'Semua bulan' : labelBulanPanjang(pilihan)

  async function unduh() {
    const xlsx = await import('xlsx')
    const wb = xlsx.utils.book_new()
    const baris = rekap.map(r => ({
      'Nama Pekerja': r.nama,
      'Peran': r.peran,
      'Hadir (hari)': r.hadir,
      'Setengah Hari': r.setengah,
      'Izin': r.izin,
      'Alpa': r.alpa,
      'Total HOK': r.hok,
      'Jam Lembur': r.jamLembur,
      'Terakhir Masuk': r.tanggal[0] ?? '',
    }))
    baris.push({
      'Nama Pekerja': `TOTAL (${total.pekerja} pekerja)`, 'Peran': '',
      'Hadir (hari)': total.hadir, 'Setengah Hari': total.setengah,
      'Izin': total.izin, 'Alpa': total.alpa,
      'Total HOK': total.hok, 'Jam Lembur': total.jamLembur, 'Terakhir Masuk': '',
    })
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(baris), 'Rekap Absensi')
    void simpanXlsx(
      xlsx.write(wb, { bookType: 'xlsx', type: 'array' }),
      `Absensi_${namaProyek || 'Proyek'}_${labelPeriode.replace(/\s+/g, '_')}.xlsx`,
    )
  }

  if (berabsensi.length === 0) {
    return (
      <div className="py-10 text-center space-y-2">
        <Users className="w-9 h-9 mx-auto opacity-25" />
        <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
          Belum ada absensi tercatat. Absensi diisi mandor lewat <b>Link Pekerja</b>,
          di dalam form laporan harian yang sama.
        </p>
      </div>
    )
  }

  if (lingkup === 'mingguan') {
    return (
      <div className="space-y-3">
        <PilihLingkup lingkup={lingkup} setLingkup={setLingkup} />
        <RekapMingguan laporan={berabsensi} pekerja={pekerja ?? []} namaProyek={namaProyek} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <PilihLingkup lingkup={lingkup} setLingkup={setLingkup} />

      {/* Bertumpuk di layar HP. Berdampingan, nama bulannya terpotong di
          tengah — dan "Agustus 2026 (2" bukan pilihan yang bisa dibaca. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        {kelompok.length > 1 && (
          <label className="flex items-center gap-2 flex-1 min-w-0">
            <CalendarRange className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <select value={pilihan} onChange={e => setPilihan(e.target.value)}
              aria-label="Pilih bulan absensi"
              data-pilih-bulan-absensi
              className="h-9 flex-1 min-w-0 rounded-xl border border-border bg-white pl-2.5 pr-8 text-[11px] font-bold text-navy">
              {opsi.map(o => <option key={o.nilai} value={o.nilai}>{o.label}</option>)}
            </select>
          </label>
        )}
        <Button size="sm" variant="outline" className="h-9 text-[11px] gap-1.5 shrink-0" onClick={unduh}>
          <FileSpreadsheet className="w-3.5 h-3.5" /> Unduh Rekap
        </Button>
      </div>

      {/* Tiga angka yang paling sering ditanyakan, sebelum tabelnya dibaca. */}
      <div className="grid grid-cols-3 gap-2">
        {[
          ['Pekerja', String(total.pekerja)],
          ['Total HOK', bulat(total.hok)],
          ['Jam Lembur', bulat(total.jamLembur)],
        ].map(([label, nilai]) => (
          <div key={label} className="rounded-xl bg-slate-50 border border-border p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">{label}</p>
            <p className="text-lg font-black text-navy tabular-nums leading-tight">{nilai}</p>
          </div>
        ))}
      </div>

      {/* TIDAK bergulung ke samping. HOK adalah satu-satunya angka yang
          dicari orang di tabel ini, dan menaruhnya di balik gulungan
          mendatar di layar HP sama saja dengan menyembunyikannya. Jadi
          kolomnya dibuat sesempit mungkin sampai muat di 390 px. */}
      <table className="w-full text-xs border-collapse table-fixed">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="text-left font-bold py-1.5 pr-1">Pekerja</th>
            {STATUS_HADIR.map(s => (
              <th key={s.key} className="text-center font-bold py-1.5 px-0 w-6" title={s.label}>{s.pendek}</th>
            ))}
            <th className="text-right font-bold py-1.5 pl-1.5 w-11">HOK</th>
            <th className="text-right font-bold py-1.5 pl-1.5 w-12">Lbr</th>
          </tr>
        </thead>
        <tbody>
          {rekap.map(r => (
            <tr key={r.kunci} className="border-t border-border">
              <td className="py-2 pr-1">
                <p className="font-semibold text-navy truncate">{r.nama}</p>
                {r.peran && <p className="text-[10px] text-muted-foreground truncate">{r.peran}</p>}
              </td>
              {STATUS_HADIR.map(s => {
                const n = r[s.key]
                return (
                  <td key={s.key} className={`text-center tabular-nums py-2 px-0 ${
                    n === 0 ? 'text-muted-foreground/40'
                      : s.key === 'alpa' ? 'text-red-600 font-bold' : 'text-slate-700'}`}>
                    {n}
                  </td>
                )
              })}
              <td className="text-right py-2 pl-1.5 font-black text-navy tabular-nums">{bulat(r.hok)}</td>
              <td className="text-right py-2 pl-1.5 tabular-nums text-slate-700">
                {r.jamLembur > 0 ? `${bulat(r.jamLembur)}j` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-navy/20 font-bold text-navy">
            <td className="py-2 pr-1 text-[11px]">TOTAL</td>
            {STATUS_HADIR.map(s => (
              <td key={s.key} className="text-center tabular-nums py-2 px-0">{total[s.key]}</td>
            ))}
            <td className="text-right py-2 pl-1.5 tabular-nums">{bulat(total.hok)}</td>
            <td className="text-right py-2 pl-1.5 tabular-nums">
              {total.jamLembur > 0 ? `${bulat(total.jamLembur)}j` : '—'}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="text-[10px] text-muted-foreground -mt-1">
        H hadir · ½ setengah hari · I izin · A alpa · Lbr jam lembur
      </p>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        HOK = hari orang kerja: hadir sehari penuh 1, setengah hari 0,5. Jam lembur
        dihitung terpisah — tarifnya berbeda di tiap perusahaan, jadi tidak ikut
        dijumlahkan ke HOK.
      </p>
    </div>
  )
}

/** Dua pertanyaan berbeda: mengawasi (bulanan) vs membayar (mingguan). */
function PilihLingkup({ lingkup, setLingkup }: {
  lingkup: 'bulanan' | 'mingguan'
  setLingkup: (v: 'bulanan' | 'mingguan') => void
}) {
  return (
    <div className="flex gap-1.5">
      {([
        ['bulanan', 'Per Bulan', 'siapa masuk berapa hari'],
        ['mingguan', 'Upah Mingguan', 'berapa yang dibayar'],
      ] as const).map(([key, label, untuk]) => (
        <button key={key} onClick={() => setLingkup(key)}
          data-lingkup={key}
          className={`flex-1 rounded-xl px-2.5 py-2 text-left transition-colors ${
            lingkup === key ? 'bg-navy text-white' : 'bg-slate-100 text-muted-foreground hover:bg-slate-200'}`}>
          <p className="text-[11px] font-black leading-tight">{label}</p>
          <p className={`text-[9px] leading-tight ${lingkup === key ? 'text-white/70' : ''}`}>{untuk}</p>
        </button>
      ))}
    </div>
  )
}

/**
 * Rekap upah per minggu — dibuka saat hendak membayar.
 *
 * BORONGAN kolom upahnya kosong, bukan nol. Nol berkata "orang ini bekerja
 * dan tidak dibayar sepeser pun"; kosong berkata "orang ini tidak dibayar
 * dengan cara ini". Yang pertama akan ditanyakan orang di akhir minggu.
 */
function RekapMingguan({ laporan, pekerja, namaProyek }: {
  laporan: SumberAbsensi[]
  pekerja: PekerjaLapangan[]
  namaProyek: string
}) {
  const minggu = useMemo(
    () => rekapUpahMingguan(laporan as never, pekerja),
    [laporan, pekerja],
  )
  const [pilihan, setPilihan] = useState(0)
  const m = minggu[Math.min(pilihan, Math.max(0, minggu.length - 1))] ?? null
  const belumAdaTarif = useMemo(() => upahBelumDiisi(m), [m])

  async function unduh() {
    if (!m) return
    const xlsx = await import('xlsx')
    const wb = xlsx.utils.book_new()
    const baris = m.baris.map(r => ({
      'Nama Pekerja': r.nama,
      'Peran': r.peran,
      'Cara Bayar': r.jenis === 'borongan' ? 'Borongan' : 'Harian',
      'Hadir': r.hadir,
      'Setengah Hari': r.setengah,
      'Izin': r.izin,
      'Alpa': r.alpa,
      'Total HOK': r.hok,
      'Jam Lembur': r.jamLembur,
      'Upah/Hari': r.jenis === 'borongan' ? '' : r.upahHarian,
      // Sengaja string kosong, bukan 0 — di Excel pun bedanya harus terbaca.
      'Upah Minggu Ini': r.upah === null ? '' : r.upah,
    }))
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(baris), 'Upah Mingguan')
    void simpanXlsx(
      xlsx.write(wb, { bookType: 'xlsx', type: 'array' }),
      `Upah_${namaProyek || 'Proyek'}_${m.awal}.xlsx`,
    )
  }

  if (!m) {
    return (
      <div className="py-10 text-center space-y-2">
        <Users className="w-9 h-9 mx-auto opacity-25" />
        <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
          Belum ada absensi yang bisa dihitung. Daftarkan pekerja lewat <b>Link Pekerja</b> →
          tab <b>Pekerja</b>, lalu isi absensi hariannya.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        {minggu.length > 1 && (
          <label className="flex items-center gap-2 flex-1 min-w-0">
            <CalendarRange className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <select value={pilihan} onChange={e => setPilihan(Number(e.target.value))}
              aria-label="Pilih minggu" data-pilih-minggu
              className="h-9 flex-1 min-w-0 rounded-xl border border-border bg-white pl-2.5 pr-8 text-[11px] font-bold text-navy">
              {minggu.map((w, i) => <option key={w.awal} value={i}>{w.label}</option>)}
            </select>
          </label>
        )}
        <Button size="sm" variant="outline" className="h-9 text-[11px] gap-1.5 shrink-0" onClick={unduh}>
          <FileSpreadsheet className="w-3.5 h-3.5" /> Unduh Upah
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 border border-border p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Total HOK</p>
          <p className="text-lg font-black text-navy tabular-nums leading-tight">{bulat(m.totalHok)}</p>
        </div>
        <div className="rounded-xl bg-navy text-white p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-white/60 font-bold">Upah Dibayar</p>
          <p className="text-lg font-black tabular-nums leading-tight">
            Rp {Math.round(m.totalUpah).toLocaleString('id-ID')}
          </p>
        </div>
      </div>

      {belumAdaTarif.length > 0 && (
        <p data-upah-kosong className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 leading-relaxed">
          <b>{belumAdaTarif.map(r => r.nama).join(', ')}</b> bekerja minggu ini tetapi upah
          hariannya belum diisi, jadi terhitung nol. Isi di <b>Link Pekerja → tab Pekerja</b>
          supaya tidak ada yang kurang dibayar.
        </p>
      )}

      <table className="w-full text-xs border-collapse table-fixed">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="text-left font-bold py-1.5 pr-1">Pekerja</th>
            <th className="text-right font-bold py-1.5 px-1 w-11">HOK</th>
            <th className="text-right font-bold py-1.5 pl-1.5 w-24">Upah</th>
          </tr>
        </thead>
        <tbody>
          {m.baris.map(r => (
            <tr key={r.kunci} data-upah={r.kunci} className="border-t border-border">
              <td className="py-2 pr-1">
                <p className="font-semibold text-navy truncate">{r.nama}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {r.jenis === 'borongan'
                    ? 'Borongan'
                    : r.upahHarian > 0
                      ? `Rp ${r.upahHarian.toLocaleString('id-ID')}/hari`
                      : 'upah belum diisi'}
                  {r.jamLembur > 0 && ` · ${bulat(r.jamLembur)} j lembur`}
                </p>
              </td>
              <td className="text-right py-2 px-1 font-black text-navy tabular-nums">{bulat(r.hok)}</td>
              <td className="text-right py-2 pl-1.5 tabular-nums">
                {r.upah === null
                  ? <span className="text-[10px] text-muted-foreground italic">borongan</span>
                  : <span className="font-bold text-navy">Rp {Math.round(r.upah).toLocaleString('id-ID')}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Upah = HOK × upah harian. Pekerja <b>borongan</b> dibayar per pekerjaan selesai,
        bukan per hari — absensinya tetap dihitung, kolom upahnya sengaja dikosongkan.
        Jam lembur tidak ikut dijumlahkan ke upah; tarifnya berbeda di tiap perusahaan.
      </p>
    </div>
  )
}
