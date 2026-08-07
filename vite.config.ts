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
      // SELURUH isi dist diperiksa, bukan hanya dist/assets/*.js.
      //
      // Versi sebelumnya melewatkan index.html, halaman share yang disalin dari
      // index.html, source map, dan JSON apa pun — padahal rahasia yang
      // tersisip di sana sama terbukanya. Pagar yang hanya menjaga satu pintu
      // memberi rasa aman yang keliru: buildnya hijau, kebocorannya lewat.
      const dist = path.resolve(__dirname, 'dist')
      const TEKS = /\.(js|mjs|cjs|html|css|json|map|txt|webmanifest)$/i

      const telusuri = (dir: string): string[] => {
        const hasil: string[] = []
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const penuh = path.join(dir, e.name)
          if (e.isDirectory()) hasil.push(...telusuri(penuh))
          else if (TEKS.test(e.name)) hasil.push(penuh)
        }
        return hasil
      }

      let berkas: string[]
      try {
        berkas = telusuri(dist)
      } catch (e) {
        // Gagal membaca hasil build TIDAK boleh berarti "aman". Pagar yang
        // diam ketika tidak bisa memeriksa adalah pagar yang tidak ada.
        throw new Error(`[pagar-kunci] Tidak bisa memeriksa hasil build di ${dist}: ${e}`)
      }
      if (!berkas.length) {
        throw new Error(`[pagar-kunci] Tidak ada berkas yang bisa diperiksa di ${dist}.`)
      }

      // Pagar yang hanya mengenali satu bentuk rahasia memberi rasa aman yang
      // keliru. Versi pertamanya cuma mencari "AIza…", lalu lolos begitu saja
      // ketika kunci SERVER Midtrans dan kunci Resend ikut terbundel — dua
      // rahasia yang justru lebih berbahaya, sebab yang satu memindahkan uang
      // dan yang lain mengirim email atas nama domain kami.
      const POLA: Array<[string, RegExp]> = [
        ['Google/Gemini', /AIza[0-9A-Za-z_-]{35}/],
        ['Midtrans server', /(SB-)?Mid-server-[0-9A-Za-z_-]{10,}/],
        ['Resend', /\bre_[0-9A-Za-z]{8,}/],
        ['OpenAI/kompatibel', /\bsk-[A-Za-z0-9_-]{20,}/],
      ]
      /**
       * JWT berperan service_role melewati SELURUH pagar RLS Supabase — ia
       * bisa membaca dan mengubah data siapa pun.
       *
       * Tidak bisa dicari sebagai teks "service_role": di dalam JWT, perannya
       * ter-encode base64url, jadi pola teks polos tidak akan pernah
       * menemukannya sementara komentar biasa justru salah tertangkap. Yang
       * benar adalah membongkar isi tiap JWT yang terlihat. Anon key —
       * yang memang publik — punya bentuk sama persis dan hanya berbeda pada
       * perannya, jadi memeriksa isi jugalah satu-satunya cara membedakannya.
       */
      const adaServiceRole = (isi: string): boolean => {
        for (const [, muatan] of isi.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{20,})/g)) {
          try {
            if (/"role"\s*:\s*"service_role"/.test(
              Buffer.from(muatan, 'base64url').toString('utf8'),
            )) return true
          } catch { /* bukan JWT yang bisa dibongkar */ }
        }
        return false
      }

      const tertangkap: string[] = []
      for (const f of berkas) {
        const isi = readFileSync(f, 'utf8')
        const nama_ = path.relative(dist, f)
        for (const [nama, pola] of POLA) {
          if (pola.test(isi)) tertangkap.push(`${nama_} (${nama})`)
        }
        if (adaServiceRole(isi)) tertangkap.push(`${nama_} (Supabase service_role)`)
      }
      if (tertangkap.length) {
        throw new Error(
          `[pagar-kunci] Rahasia ikut terbundel di: ${tertangkap.join(', ')}.\n`
          + 'Rahasia tidak boleh sampai ke browser. Pakai variabel TANPA awalan VITE_ '
          + 'dan panggil lewat fungsi di api/.',
        )
      }
      console.log(`[pagar-kunci] ${berkas.length} berkas diperiksa terhadap ${POLA.length + 1} bentuk rahasia — bersih.`)
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
