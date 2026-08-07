import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { HALAMAN_BAGIKAN, terapkanMeta } from './src/lib/ogShare'

/**
 * Kunci Gemini TIDAK BOLEH ikut ke bundel — dan itu bukan sekadar aturan gaya.
 *
 * Vite menyisipkan setiap variabel berawalan VITE_ ke dalam berkas JavaScript
 * yang diunduh setiap pengunjung. Ketika kuncinya bernama VITE_GEMINI_API_KEY,
 * ia tercetak apa adanya di sana; kuncinya dipanen orang, dipakai atas
 * tanggungan kami, dan Google mensuspend project-nya karena "abusive activity
 * consistent with hijacking".
 *
 * Menghapusnya dari process.env di sini menutup jalannya walaupun variabelnya
 * masih tertinggal di setelan Vercel. Ini penting karena sepuluh modul membaca
 * `import.meta.env` sebagai SATU OBJEK untuk mengambil variabel lain — dan
 * sekali itu terjadi, Vite menyalin seluruh isinya, termasuk yang tidak
 * diminta. Tidak menyebut namanya saja tidak cukup.
 */
const KUNCI_TERLARANG = ['VITE_GEMINI_API_KEY', 'VITE_GROQ_API_KEY', 'VITE_OPENROUTER_API_KEY']
for (const k of KUNCI_TERLARANG) delete process.env[k]

/**
 * Pagar terakhir: periksa hasil build, gagalkan bila ada yang berbentuk kunci.
 *
 * Aturan yang hanya ditulis di komentar akan dilanggar suatu hari, dan
 * pelanggarannya tidak terlihat sampai tagihannya datang. Ini membuat
 * kebocoran yang sama mustahil lolos diam-diam: buildnya berhenti.
 */
function pagarKunciPlugin(): Plugin {
  return {
    name: 'propfs-pagar-kunci',
    apply: 'build',
    closeBundle() {
      const aset = path.resolve(__dirname, 'dist', 'assets')
      let berkas: string[]
      try { berkas = readdirSync(aset).filter(f => f.endsWith('.js')) } catch { return }

      const pola = /AIza[0-9A-Za-z_-]{35}/
      const tertangkap: string[] = []
      for (const f of berkas) {
        if (pola.test(readFileSync(path.join(aset, f), 'utf8'))) tertangkap.push(f)
      }
      if (tertangkap.length) {
        throw new Error(
          `[pagar-kunci] Kunci API ikut terbundel di: ${tertangkap.join(', ')}.\n`
          + 'Kunci tidak boleh sampai ke browser. Pakai variabel TANPA awalan VITE_ '
          + 'dan panggil lewat /api/ai.',
        )
      }
      console.log(`[pagar-kunci] ${berkas.length} berkas diperiksa, tidak ada kunci yang terbawa.`)
    },
  }
}

/**
 * Aplikasi ini SPA, sedangkan crawler WhatsApp/Telegram tidak menjalankan
 * JavaScript — jadi semua tautan yang dikirim menampilkan judul yang sama dari
 * index.html. Plugin ini menyalin index.html hasil build menjadi beberapa
 * berkas di dist/share/, masing-masing dengan meta Open Graph sendiri.
 *
 * Disalin SETELAH build supaya nama aset yang sudah ber-hash ikut terbawa apa
 * adanya; vercel.json yang mengarahkan tiap rute ke berkas ini.
 */
function bagikanMetaPlugin(): Plugin {
  return {
    name: 'propfs-og-share',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve(__dirname, 'dist')
      let index: string
      try {
        index = readFileSync(path.join(dist, 'index.html'), 'utf8')
      } catch {
        // Build tanpa keluaran HTML — tidak ada yang perlu dikerjakan.
        return
      }
      mkdirSync(path.join(dist, 'share'), { recursive: true })
      for (const h of HALAMAN_BAGIKAN) {
        writeFileSync(path.join(dist, 'share', `${h.berkas}.html`), terapkanMeta(index, h), 'utf8')
      }
      console.log(`[og-share] ${HALAMAN_BAGIKAN.length} halaman pratinjau dibuat di dist/share/`)
    },
  }
}

export default defineConfig({
  plugins: [react(), bagikanMetaPlugin(), pagarKunciPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
})
