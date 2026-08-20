// Penampil foto layar penuh (lightbox) — dipakai di kalender owner, panel
// laporan masuk, dan pratinjau laporan pekerja. Foto sering berupa data URL
// base64 yang TIDAK bisa dibuka di tab baru pada HP, jadi ditampilkan in-app.
import { useEffect } from 'react'
import { simpanBerkas } from '@/lib/unduhBerkas'
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react'

export default function PhotoLightbox({
  photos, index, onClose, onIndex,
}: {
  photos: string[]
  index: number
  onClose: () => void
  onIndex: (i: number) => void
}) {
  const prev = () => onIndex((index - 1 + photos.length) % photos.length)
  const next = () => onIndex((index + 1) % photos.length)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (index < 0 || index >= photos.length) return null
  const src = photos[index]

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col select-none" onClick={onClose}>
      {/* Bar atas */}
      <div className="flex items-center justify-between px-4 py-3 text-white/90" onClick={e => e.stopPropagation()}>
        <span className="text-sm font-medium">{index + 1} / {photos.length}</span>
        <div className="flex items-center gap-2">
          {/* Tombol, bukan <a download>. Di WebView Android tautan seperti itu
              tidak mengunduh apa pun dan tidak melempar apa pun — foto lapangan
              yang hendak dikirim ke pemilik proyek berakhir sebagai ketukan
              yang tidak menghasilkan apa-apa. */}
          <button onClick={() => void simpanBerkas(src, `foto_${index + 1}.jpg`, 'image/jpeg')}
            className="p-2 rounded-full hover:bg-white/10" title="Unduh" aria-label="Unduh foto">
            <Download className="w-5 h-5" />
          </button>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10" title="Tutup">
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Gambar */}
      <div className="flex-1 flex items-center justify-center px-2 pb-2 min-h-0" onClick={onClose}>
        <img src={src} alt="" onClick={e => e.stopPropagation()}
          className="max-w-full max-h-full object-contain rounded-lg" />
      </div>

      {/* Navigasi */}
      {photos.length > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); prev() }}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button onClick={e => { e.stopPropagation(); next() }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white">
            <ChevronRight className="w-6 h-6" />
          </button>
          {/* Strip thumbnail */}
          <div className="flex gap-1.5 overflow-x-auto px-4 py-3 justify-center" onClick={e => e.stopPropagation()}>
            {photos.map((p, i) => (
              <img key={i} src={p} alt="" onClick={() => onIndex(i)}
                className={`h-12 w-12 object-cover rounded-md cursor-pointer shrink-0 border-2 transition-opacity ${
                  i === index ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-80'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
