// ============================================================
// Rekap absensi tukang — apa yang sebenarnya dicari orang di sini
//
// Laporan harian dibaca sekali, lalu tidak pernah dibuka lagi. Yang dibuka
// tiap akhir pekan adalah pertanyaan yang berbeda: siapa masuk berapa hari.
// Itulah dasar orang dibayar, dan tanpa panel ini jawabannya hanya bisa
// didapat dengan membuka tiga puluh kartu laporan satu per satu.
//
// Satu hal yang sengaja TIDAK ada di sini: nominal upah. Tarif tiap tukang
// bukan angka yang boleh ikut tersebar bersama link laporan, dan HOK sudah
// cukup untuk dikalikan sendiri oleh yang berhak mengetahuinya.
// ============================================================
import { useMemo, useState } from 'react'
import { Users, FileSpreadsheet, CalendarRange } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { simpanXlsx } from '@/lib/unduhBerkas'
import {
  rekapAbsensi, totalRekap, bulat, STATUS_HADIR, type SumberAbsensi,
} from '@/lib/absensiPekerja'
import {
  kelompokPerBulan, pilihanBulan, labelBulanPanjang, bulanBerjalan, SEMUA_BULAN,
} from '@/lib/kelompokBulan'

export default function PanelRekapAbsensi({ laporan, namaProyek }: {
  laporan: SumberAbsensi[]
  namaProyek: string
}) {
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

  return (
    <div className="space-y-3">
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
