import { useState } from 'react'
import { X, Upload, Download, ShieldCheck, FileCheck, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { kopSaya } from '@/lib/identitasSaya'
import { kwitansiApi, type BarisKwitansi } from '@/lib/kwitansiApi'
import { unduhKwitansiPdf } from '@/lib/kwitansiPdf'
import { AMBANG_MATERAI, TARIF_MATERAI, TAUTAN_EMETERAI } from '@/lib/kwitansi'

/** 3 MB. Kwitansi satu halaman bermeterai jauh di bawah ini. */
const BATAS_BERKAS = 3 * 1024 * 1024

/**
 * Popup pembubuhan meterai: unduh → bubuhkan di e-Meterai → unggah kembali.
 *
 * Berdiri sendiri, bukan sebuah kartu di dalam formulir kwitansi, karena
 * urutannya memang menyeberang keluar aplikasi: PDF-nya dibawa ke situs
 * e-Meterai lebih dulu. Menaruhnya di dalam formulir berarti formulir itu
 * harus tetap terbuka selama perjalanan bolak-balik tersebut — padahal
 * kwitansinya sendiri sudah selesai dan sudah tersimpan.
 */
export default function DialogUnggahMaterai({ k, onSelesai, onTutup }: {
  k: BarisKwitansi
  onSelesai: () => void
  onTutup: () => void
}) {
  const { toast } = useToast()
  const [proses, setProses] = useState(false)
  const [galat, setGalat] = useState('')
  const [terunggah, setTerunggah] = useState<string>('')

  async function pilih(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setGalat('')
    if (f.size > BATAS_BERKAS) {
      setGalat('Berkasnya lebih dari 3 MB. Kwitansi satu halaman semestinya jauh di bawah itu.')
      return
    }
    setProses(true)
    try {
      const data = await new Promise<string>((selesai, gagal) => {
        const r = new FileReader()
        r.onload = () => selesai(String(r.result ?? ''))
        r.onerror = () => gagal(r.error)
        r.readAsDataURL(f)
      })
      await kwitansiApi().ubah(k.id, {
        materai_status: 'terbubuh', materai_pdf: data,
        materai_at: new Date().toISOString(),
      } as Partial<BarisKwitansi>)
      setTerunggah(f.name)
      toast({
        title: 'PDF bermeterai tersimpan',
        description: 'Versi inilah yang akan dikirim ke konsumen.',
      })
      onSelesai()
    } catch (err) {
      setGalat(err instanceof Error ? err.message : String(err))
    } finally { setProses(false) }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center
      p-0 sm:p-4" onClick={onTutup}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85vh]
          flex flex-col overflow-hidden">
        <div className="border-b border-border px-5 py-3 flex items-center justify-between shrink-0">
          <p className="flex items-center gap-1.5 font-bold text-navy">
            <ShieldCheck className="w-4 h-4" /> Bubuhkan e-Meterai
          </p>
          <button onClick={onTutup} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Kwitansi <b className="text-navy">{k.nomor}</b> bernilai di atas{' '}
            Rp {AMBANG_MATERAI.toLocaleString('id-ID')}, jadi wajib bermeterai{' '}
            Rp {TARIF_MATERAI.toLocaleString('id-ID')} menurut UU No. 10/2020.
          </p>

          <ol className="space-y-2 text-xs text-navy">
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-navy text-white grid place-items-center
                text-[10px] font-black">1</span>
              <span className="flex-1 min-w-0">Unduh PDF kwitansinya.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-navy text-white grid place-items-center
                text-[10px] font-black">2</span>
              <span className="flex-1 min-w-0">
                Bubuhkan e-Meterai di situs resminya, lalu simpan hasilnya.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-navy text-white grid place-items-center
                text-[10px] font-black">3</span>
              <span className="flex-1 min-w-0">
                Unggah PDF yang sudah bermeterai di bawah ini. Versi itulah yang dikirim
                ke konsumen.
              </span>
            </li>
          </ol>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => unduhKwitansiPdf(k, kopSaya())}
              className="flex-1 gap-1.5 text-xs font-bold">
              <Download className="w-3.5 h-3.5" /> Unduh PDF
            </Button>
            <a href={TAUTAN_EMETERAI} target="_blank" rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border
                border-border text-xs font-bold text-navy px-3">
              <ExternalLink className="w-3.5 h-3.5" /> Situs e-Meterai
            </a>
          </div>

          {terunggah ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200
              bg-emerald-50 p-2.5">
              <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs truncate flex-1 min-w-0">{terunggah}</span>
            </div>
          ) : (
            <label data-unggah-materai className={`flex items-center justify-center gap-2
              rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 py-4 text-xs
              font-bold text-navy ${proses ? 'opacity-60' : 'cursor-pointer'}`}>
              {proses ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {proses ? 'Menyimpan…' : 'Unggah PDF yang sudah bermeterai'}
              <input type="file" accept="application/pdf" className="hidden" disabled={proses}
                onChange={e => void pilih(e)} />
            </label>
          )}

          {galat && (
            <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200
              rounded-lg p-2 break-words">{galat}</p>
          )}
        </div>

        <div className="border-t border-border p-4 shrink-0">
          <Button variant="outline" onClick={onTutup} className="w-full font-bold">
            {terunggah ? 'Selesai' : 'Tutup'}
          </Button>
        </div>
      </div>
    </div>
  )
}
