// ============================================================
// Deretan nama beserta status kehadirannya, sebaris di bawah tanggal laporan.
//
// Berdiri sendiri di berkasnya sendiri karena dipakai di dua tempat yang
// sangat berbeda beratnya: panel kantor (di dalam workspace, dengan seluruh
// store-nya) dan halaman kalender PUBLIK yang dibuka owner tanpa login dari
// HP. Menaruhnya di salah satu berkas panel berarti halaman publik ikut
// menyeret modul yang tidak pernah ia pakai.
// ============================================================
import { useMemo } from 'react'
import { bacaAbsensi, labelStatus, STATUS_HADIR, bulat } from '@/lib/absensiPekerja'

export default function ChipAbsensi({ absensi }: { absensi: unknown }) {
  const baris = useMemo(() => bacaAbsensi(absensi), [absensi])
  if (baris.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {baris.map((b, i) => {
        const s = STATUS_HADIR.find(x => x.key === b.status)
        return (
          <span key={`${b.nama}-${i}`} title={`${b.nama} — ${labelStatus(b.status)}`}
            className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${
              b.status === 'hadir' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : b.status === 'setengah' ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : b.status === 'izin' ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-red-50 text-red-700 border-red-200'}`}>
            {b.nama} <span className="font-bold">{s?.pendek ?? '?'}</span>
            {b.lembur ? <span className="opacity-70"> +{bulat(b.lembur)}j</span> : null}
          </span>
        )
      })}
    </div>
  )
}
