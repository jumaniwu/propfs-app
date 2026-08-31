// ============================================================
// PropFS — Perbaiki satu baris biaya dengan tangan
//
// Sampai sekarang, satu-satunya cara mengubah sebuah baris adalah menyuruh
// AI. Kartu biaya di daftar tidak punya tombol sunting sama sekali — jadi
// ketika lima baris tercatat Rp 135 padahal maksudnya Rp 135.000, yang bisa
// dilakukan hanyalah mengetik ulang permintaan dan berharap kali ini
// dimengerti. Ketika AI-nya keliru, tidak ada jalan lain.
//
// Salah ketik satu angka tidak seharusnya memerlukan percakapan.
// ============================================================
import { useState } from 'react'
import { X, Loader2, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Z_TIRAI, PADDING_BAWAH_TIRAI } from '@/lib/lapisan'
import { angkaRupiah } from '@/lib/suntingBiaya'
import type { RealisasiEntry } from '@/lib/ai-realisasi'

const inputCls = 'w-full rounded-xl border border-border bg-white px-3 py-2 text-sm '
  + 'focus:outline-none focus:ring-2 focus:ring-gold/40'

export default function SuntingBiaya({ entri, onSimpan, onHapus, onTutup }: {
  entri: RealisasiEntry
  onSimpan: (patch: Partial<RealisasiEntry>) => void
  onHapus: () => void
  onTutup: () => void
}) {
  // Nominalnya dipegang sebagai TEKS selama diketik, bukan sebagai angka.
  // Mengubahnya menjadi number pada setiap ketukan membuat "135." mustahil
  // diketik: titiknya hilang seketika, dan yang mengetik menyangka tombolnya
  // rusak.
  const [namaMaterial, setNamaMaterial] = useState(entri.namaMaterial ?? '')
  const [jumlah, setJumlah] = useState(String(entri.jumlah ?? ''))
  const [keterangan, setKeterangan] = useState(entri.keterangan ?? '')
  const [tanggal, setTanggal] = useState(entri.tanggal ?? '')
  const [sibuk, setSibuk] = useState(false)

  const nilai = angkaRupiah(jumlah)
  const berubah = nilai !== entri.jumlah
    || namaMaterial.trim() !== (entri.namaMaterial ?? '')
    || keterangan.trim() !== (entri.keterangan ?? '')
    || tanggal !== (entri.tanggal ?? '')

  function simpan() {
    if (!berubah || sibuk) return
    setSibuk(true)
    try {
      onSimpan({
        jumlah: nilai, keterangan: keterangan.trim(), tanggal,
        // String kosong, bukan undefined: undefined pada sebuah tambalan
        // berarti "jangan ubah", sehingga nama yang SENGAJA dikosongkan tidak
        // akan pernah benar-benar terhapus.
        ...(entri.tipe === 'material' ? { namaMaterial: namaMaterial.trim() } : {}),
      })
      onTutup()
    } finally { setSibuk(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center"
      style={{ zIndex: Z_TIRAI }} onClick={onTutup}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl flex flex-col">
        <div className="flex items-center justify-between gap-2 p-4 pb-2">
          <h3 className="font-bold text-navy text-sm">Perbaiki baris biaya</h3>
          <button onClick={onTutup} aria-label="Tutup"
            className="p-1 text-muted-foreground hover:text-navy"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-4 space-y-3">
          {/* Nama barang lebih dulu, karena inilah yang tampil sebagai judul
              di daftar. Baris yang namanya kosong berbunyi "Pembelian alat
              kerja" seperti semua baris lain, dan tidak bisa dibedakan tanpa
              membuka notanya. */}
          {entri.tipe === 'material' && (
            <label className="block space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">
                Nama barang (sesuai nota)
              </span>
              <input data-sunting-nama value={namaMaterial} className={inputCls}
                onChange={e => setNamaMaterial(e.target.value)}
                placeholder="mis. Besi Ulir 16mm" />
              <span className="block text-[10px] text-muted-foreground">
                Ini yang tampil sebagai judul di daftar. Tulis jenis, ukuran, dan mutunya saja —
                kemasan dan merek toko taruh di keterangan.
              </span>
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground">Keterangan</span>
            <input data-sunting-ket value={keterangan} className={inputCls}
              onChange={e => setKeterangan(e.target.value)} />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground">Nominal</span>
            <input data-sunting-jumlah value={jumlah} inputMode="text" className={inputCls}
              onChange={e => setJumlah(e.target.value)} placeholder="mis. 135.000 atau 135rb" />
            {/* Hasil bacanya ditunjukkan SEBELUM disimpan.
                "135.000" dan "135000" dan "135rb" ketiganya sah, dan yang
                mengetik harus bisa melihat bahwa yang dimengerti aplikasi sama
                dengan yang ia maksud — sebelum menekan simpan, bukan sesudah
                menemukan angkanya salah keesokan harinya. */}
            <span data-sunting-baca className={`block text-[11px] font-bold ${
              nilai > 0 ? 'text-navy' : 'text-amber-800'}`}>
              {nilai > 0
                ? `Tersimpan sebagai Rp ${nilai.toLocaleString('id-ID')}`
                : 'Nominalnya belum terbaca.'}
            </span>
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground">Tanggal</span>
            <input type="date" data-sunting-tanggal value={tanggal} className={inputCls}
              onChange={e => setTanggal(e.target.value)} />
          </label>
        </div>

        <div className={`p-4 pt-3 flex gap-2 ${PADDING_BAWAH_TIRAI}`}>
          <button data-sunting-hapus onClick={() => { onHapus(); onTutup() }}
            className="h-10 px-3 rounded-xl border border-rose-200 text-rose-700
              flex items-center gap-1.5 text-xs font-bold hover:bg-rose-50">
            <Trash2 className="w-3.5 h-3.5" /> Hapus
          </button>
          <Button data-sunting-simpan onClick={simpan} disabled={!berubah || sibuk}
            className="flex-1 gap-1.5 bg-navy hover:bg-navy/90 font-bold h-10">
            {sibuk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan
          </Button>
        </div>
      </div>
    </div>
  )
}
