/**
 * Kotak yang isinya bisa dicubit untuk diperbesar dan diseret untuk digeser.
 *
 * Dipakai penampil lampiran & gambar kerja. Denah dibaca dengan mencari ANGKA
 * di sudut gambar — dimensi kolom, jarak as, elevasi — dan angka itu ditulis
 * untuk kertas A1. Di layar 390 piksel ia bukan kecil, melainkan tidak ada.
 * Tanpa perbesaran, gambarnya tidak bisa dipakai sama sekali dan satu-satunya
 * jalan tersisa adalah mengunduhnya ke aplikasi lain.
 *
 * Seluruh hitungannya ada di lib/zoomGeser.ts supaya bisa diuji tanpa DOM;
 * berkas ini hanya menyambungkannya ke sentuhan jari.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import {
  ZOOM_AWAL, SKALA_MIN, SKALA_MAKS, batasSkala, geserTerbatas, zoomKeTitik,
  skalaKetukGanda, jarak, tengah, skalaCubit, sedangDiperbesar,
  type KeadaanZoom, type Titik,
} from '@/lib/zoomGeser'

interface Props {
  children: React.ReactNode
  /** Nama untuk pembaca layar. */
  label?: string
}

/**
 * Batas gerak yang masih dianggap ketukan, dalam piksel.
 *
 * Jari tidak pernah benar-benar diam. Tanpa toleransi, setiap ketukan pada
 * layar kapasitif tercatat sebagai seretan sepanjang beberapa piksel, dan
 * ketukan ganda tidak akan pernah terjadi.
 */
const TOLERANSI_KETUK = 10

/** Batas lama sentuhan yang masih dianggap ketukan, dalam milidetik. */
const LAMA_KETUK = 250

export default function PenampilZoom({ children, label = 'Gambar' }: Props) {
  const [zoom, setZoom] = useState<KeadaanZoom>(ZOOM_AWAL)
  const kotakRef = useRef<HTMLDivElement>(null)
  const isiRef = useRef<HTMLDivElement>(null)

  // Keadaan gerakan yang sedang berjalan. Disimpan di ref, bukan state:
  // gerakan jari menghasilkan puluhan kejadian per detik, dan me-render ulang
  // untuk tiap satu di antaranya membuat geserannya tersendat justru pada HP
  // yang paling butuh lancar.
  const gerak = useRef<{
    jenis: 'tidak' | 'seret' | 'cubit'
    mulaiX: number; mulaiY: number
    awalX: number; awalY: number
    jarakAwal: number; skalaAwal: number
    /** Kapan sentuhan ini dimulai — dipakai membedakan ketukan dari seretan. */
    mulaiWaktu: number
    /** Jarinya sudah bergerak jauh; ini seretan, bukan ketukan. */
    bergerak: boolean
    /** Kapan KETUKAN terakhir selesai. Bukan kapan sentuhan terakhir dimulai. */
    ketukTerakhir: number
  }>({
    jenis: 'tidak', mulaiX: 0, mulaiY: 0, awalX: 0, awalY: 0,
    jarakAwal: 0, skalaAwal: 1, mulaiWaktu: 0, bergerak: false, ketukTerakhir: 0,
  })


  /** Ukuran kotak & isinya, diukur saat dibutuhkan. */
  const ukuran = useCallback(() => {
    const kotak = kotakRef.current
    const isi = isiRef.current
    return {
      lebarLayar: kotak?.clientWidth ?? 0,
      tinggiLayar: kotak?.clientHeight ?? 0,
      // offsetWidth dibaca dari elemen yang BELUM diskalakan — transform tidak
      // mengubah offsetWidth, jadi ini memang ukuran pada skala 1.
      lebarKonten: isi?.offsetWidth ?? 0,
      tinggiKonten: isi?.offsetHeight ?? 0,
    }
  }, [])

  /** Titik sentuh relatif terhadap TENGAH kotak — acuan yang dipakai lib. */
  const keTengah = useCallback((t: Titik): Titik => {
    const k = kotakRef.current?.getBoundingClientRect()
    if (!k) return { x: 0, y: 0 }
    return { x: t.x - (k.left + k.width / 2), y: t.y - (k.top + k.height / 2) }
  }, [])

  const setZoomTerbatas = useCallback((z: KeadaanZoom) => {
    setZoom(geserTerbatas(z, ukuran()))
  }, [ukuran])

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches
    if (t.length === 2) {
      const a = { x: t[0].clientX, y: t[0].clientY }
      const b = { x: t[1].clientX, y: t[1].clientY }
      gerak.current = {
        ...gerak.current, jenis: 'cubit',
        jarakAwal: jarak(a, b), skalaAwal: zoom.skala,
        awalX: zoom.x, awalY: zoom.y,
        mulaiX: 0, mulaiY: 0,
      }
      return
    }
    if (t.length === 1) {
      gerak.current = {
        ...gerak.current,
        jenis: sedangDiperbesar(zoom) ? 'seret' : 'tidak',
        mulaiX: t[0].clientX, mulaiY: t[0].clientY,
        awalX: zoom.x, awalY: zoom.y,
        mulaiWaktu: Date.now(),
        bergerak: false,
      }
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    const g = gerak.current
    const t = e.touches

    // Ditandai sebelum apa pun: sekali jarinya bergerak jauh, sentuhan ini
    // tidak akan pernah menjadi ketukan lagi.
    if (t.length === 1 && !g.bergerak) {
      const jauh = Math.hypot(t[0].clientX - g.mulaiX, t[0].clientY - g.mulaiY)
      if (jauh > TOLERANSI_KETUK) g.bergerak = true
    }

    if (g.jenis === 'cubit' && t.length === 2) {
      const a = { x: t[0].clientX, y: t[0].clientY }
      const b = { x: t[1].clientX, y: t[1].clientY }
      const skala = skalaCubit(g.skalaAwal, g.jarakAwal, jarak(a, b))
      const pusat = keTengah(tengah(a, b))
      setZoom(zoomKeTitik({ skala: g.skalaAwal, x: g.awalX, y: g.awalY }, skala, pusat, ukuran()))
      return
    }

    if (g.jenis === 'seret' && t.length === 1) {
      setZoomTerbatas({
        skala: zoom.skala,
        x: g.awalX + (t[0].clientX - g.mulaiX),
        y: g.awalY + (t[0].clientY - g.mulaiY),
      })
    }
  }

  /**
   * Ketukan ganda dikenali DI SINI, bukan saat sentuhan dimulai.
   *
   * Versi pertama menandai setiap `touchstart` sebagai ketukan, lalu
   * menganggap dua sentuhan berdekatan sebagai ketukan ganda. Akibatnya
   * MENGGESER gambar dengan dua sapuan cepat berturut-turut — cara paling
   * wajar memeriksa denah — terbaca sebagai ketukan ganda, dan perbesarannya
   * kembali ke nol tepat di tengah pemeriksaan.
   *
   * Cacat itu tidak mungkin terlihat dari membaca kodenya; ia muncul karena
   * probe menyeret dua kali berturut-turut.
   *
   * Sekarang sebuah sentuhan hanya dihitung ketukan bila jarinya memang tidak
   * bergerak DAN tidak berlama-lama. Menekan lama untuk membaca sesuatu pun
   * karena itu tidak lagi ikut terhitung.
   */
  function onTouchEnd() {
    const g = gerak.current
    const kini = Date.now()
    const ketukan = !g.bergerak && kini - g.mulaiWaktu < LAMA_KETUK && g.jenis !== 'cubit'

    if (ketukan) {
      if (kini - g.ketukTerakhir < 300) {
        const pusat = keTengah({ x: g.mulaiX, y: g.mulaiY })
        setZoom(zoomKeTitik(zoom, skalaKetukGanda(zoom.skala), pusat, ukuran()))
        gerak.current = { ...g, jenis: 'tidak', ketukTerakhir: 0, bergerak: false }
        return
      }
      gerak.current = { ...g, jenis: 'tidak', ketukTerakhir: kini, bergerak: false }
      return
    }

    gerak.current = { ...g, jenis: 'tidak', bergerak: false }
  }

  // Roda tetikus + Ctrl untuk memperbesar di komputer — arsitek membuka denah
  // yang sama di layar besar, dan memaksanya memakai tombol saja membuat
  // aplikasinya terasa dibuat hanya untuk HP.
  useEffect(() => {
    const kotak = kotakRef.current
    if (!kotak) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const pusat = keTengah({ x: e.clientX, y: e.clientY })
      setZoom(z => zoomKeTitik(z, batasSkala(z.skala * (e.deltaY < 0 ? 1.15 : 0.87)), pusat, ukuran()))
    }
    // passive: false — tanpa itu preventDefault diabaikan dan halamannya ikut
    // membesar bersama gambarnya.
    kotak.addEventListener('wheel', onWheel, { passive: false })
    return () => kotak.removeEventListener('wheel', onWheel)
  }, [keTengah, ukuran])

  const diperbesar = sedangDiperbesar(zoom)

  return (
    <div className="relative w-full h-full">
      <div
        ref={kotakRef}
        data-penampil-zoom
        aria-label={label}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        // touch-none HANYA saat diperbesar. Sebelum itu, gerakan jari harus
        // tetap menggulung daftar halaman — merebutnya sejak awal membuat
        // daftar PDF berhalaman banyak terasa macet.
        className={`w-full h-full overflow-hidden flex items-center justify-center ${
          diperbesar ? 'touch-none' : 'touch-pan-y'}`}
      >
        <div
          ref={isiRef}
          style={{
            transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.skala})`,
            // Titik tumpu di tengah, sama dengan acuan hitungan di
            // lib/zoomGeser.ts. Dua acuan berbeda dalam satu perhitungan
            // adalah cara paling mudah menghasilkan geseran yang meleset
            // separuh layar.
            transformOrigin: 'center center',
            transition: gerak.current.jenis === 'tidak' ? 'transform 120ms ease-out' : 'none',
          }}
          className="will-change-transform"
        >
          {children}
        </div>
      </div>

      {/* Tombol, untuk yang tidak tahu bisa dicubit — dan untuk tetikus. */}
      <div className="absolute right-2 bottom-2 flex flex-col gap-1.5">
        <button type="button" aria-label="Perbesar"
          onClick={() => setZoom(z => zoomKeTitik(z, batasSkala(z.skala * 1.6), { x: 0, y: 0 }, ukuran()))}
          disabled={zoom.skala >= SKALA_MAKS}
          className="w-9 h-9 rounded-xl bg-black/60 text-white flex items-center justify-center disabled:opacity-30">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button type="button" aria-label="Perkecil"
          onClick={() => setZoom(z => zoomKeTitik(z, batasSkala(z.skala / 1.6), { x: 0, y: 0 }, ukuran()))}
          disabled={zoom.skala <= SKALA_MIN}
          className="w-9 h-9 rounded-xl bg-black/60 text-white flex items-center justify-center disabled:opacity-30">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button type="button" aria-label="Tampilkan utuh"
          data-zoom-utuh
          onClick={() => setZoom(ZOOM_AWAL)}
          disabled={!diperbesar}
          className="w-9 h-9 rounded-xl bg-black/60 text-white flex items-center justify-center disabled:opacity-30">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {diperbesar && (
        <span data-zoom-angka
          className="absolute left-2 bottom-2 text-[10px] font-bold text-white bg-black/60 rounded-lg px-2 py-1">
          {zoom.skala.toFixed(1)}×
        </span>
      )}
    </div>
  )
}
