import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { HALAMAN_BAGIKAN, terapkanMeta } from './src/lib/ogShare'

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
  plugins: [react(), bagikanMetaPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
})
