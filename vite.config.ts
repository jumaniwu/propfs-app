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
const KUNCI_TERLARANG = [
  'VITE_GEMINI_API_KEY', 'VITE_GROQ_API_KEY', 'VITE_OPENROUTER_API_KEY',
  // Kunci SERVER Midtrans bisa menarik dan mengembalikan uang; kunci Resend
  // bisa mengirim email atas nama domain kami. Keduanya sempat punya jalan
  // mundur berawalan VITE_ di fungsi serverless, sehingga nama berbahaya itu
  // tampak sah — dan sekali dipakai, keduanya ikut ke bundel publik. Diuji:
  // memang tercetak apa adanya di dist/assets/index-*.js.
  'VITE_MIDTRANS_SERVER_KEY', 'VITE_RESEND_API_KEY',
  'VITE_SUPABASE_SERVICE_ROLE_KEY', 'VITE_CRON_SECRET',
]
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

      // Pagar yang hanya mengenali satu bentuk rahasia memberi rasa aman yang
      // keliru. Versi pertamanya cuma mencari "AIza…", lalu lolos begitu saja
      // ketika kunci SERVER Midtrans dan kunci Resend ikut terbundel — dua
      // rahasia yang justru lebih berbahaya, sebab yang satu memindahkan uang
      // dan yang lain mengirim email atas nama domain kami.
      const POLA: Array<[string, RegExp]> = [
        ['Google/Gemini', /AIza[0-9A-Za-z_-]{35}/],
        ['Midtrans server', /(SB-)?Mid-server-[0-9A-Za-z_-]{10,}/],
        ['Resend', /\bre_[0-9A-Za-z]{8,}/],
        // JWT berperan service_role melewati SELURUH pagar RLS Supabase.
        ['Supabase service role', /service_role/],
        ['OpenAI/kompatibel', /\bsk-[A-Za-z0-9_-]{20,}/],
      ]
      const tertangkap: string[] = []
      for (const f of berkas) {
        const isi = readFileSync(path.join(aset, f), 'utf8')
        for (const [nama, pola] of POLA) {
          if (pola.test(isi)) tertangkap.push(`${f} (${nama})`)
        }
      }
      if (tertangkap.length) {
        throw new Error(
          `[pagar-kunci] Rahasia ikut terbundel di: ${tertangkap.join(', ')}.\n`
          + 'Rahasia tidak boleh sampai ke browser. Pakai variabel TANPA awalan VITE_ '
          + 'dan panggil lewat fungsi di api/.',
        )
      }
      console.log(`[pagar-kunci] ${berkas.length} berkas diperiksa terhadap ${POLA.length} bentuk rahasia — bersih.`)
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
