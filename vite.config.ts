import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs'
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
 * Pagar DATA — migrasi tidak boleh menghapus data diam-diam.
 *
 * Keluhan yang paling sering berulang dari pemakainya bukan fitur yang kurang,
 * melainkan satu kalimat: "jangan sampai data lama hilang kalau ada update".
 * Kekhawatiran itu beralasan — pemasukan senilai ratusan juta pernah lenyap,
 * dan buku laporan beserta seluruh absensinya pernah hangus karena satu tombol
 * hapus yang terlihat seperti membuang wadah kosong.
 *
 * Janji tidak menjaga apa pun. Yang menjaga adalah build yang BERHENTI.
 *
 * Pernyataan yang menghancurkan data ditolak di sini, KECUALI yang memang
 * disengaja dan ditandai pada baris tepat di atasnya:
 *
 *     -- BOLEH-HAPUS: <alasan, satu kalimat>
 *     delete from vendor_items where vendor_id = vendor;
 *
 * Penandanya sengaja merepotkan. Yang menuliskannya harus berhenti sejenak dan
 * menyebut alasannya — dan alasan itu tertinggal di berkasnya untuk dibaca
 * orang berikutnya, termasuk oleh yang sedang menelusuri data yang hilang.
 *
 * UPDATE dan DELETE tanpa WHERE ditolak TANPA pengecualian. Supabase memuat
 * ekstensi `safeupdate` untuk peran authenticator: pernyataan seperti itu
 * ditolak di produksi, sementara PostgreSQL biasa menerimanya — jadi cacatnya
 * tidak pernah muncul saat diuji di luar Supabase. Pernah terjadi, dan
 * menggagalkan seluruh penggabungan buku laporan di percobaan pertama.
 */
function pagarDataPlugin(): Plugin {
  return {
    name: 'propfs-pagar-data',
    apply: 'build',
    buildStart() {
      const dir = path.resolve(__dirname, 'supabase/migrations')
      if (!existsSync(dir)) return

      const TANDA = /--\s*BOLEH-HAPUS\s*:\s*\S/i
      // Bentuk yang tidak bisa dibatalkan. `drop function/policy/trigger/index`
      // TIDAK termasuk: itu mengganti perilaku, bukan membuang isi tabel.
      const MERUSAK: Array<[string, RegExp]> = [
        ['DROP TABLE', /^\s*drop\s+table\b/i],
        ['TRUNCATE', /^\s*truncate\b/i],
        ['DROP COLUMN', /\bdrop\s+column\b/i],
        ['DELETE', /^\s*delete\s+from\b/i],
      ]

      const keluhan: string[] = []
      for (const f of readdirSync(dir).filter(n => n.endsWith('.sql'))) {
        const baris = readFileSync(path.join(dir, f), 'utf8').split('\n')
        baris.forEach((b, i) => {
          if (b.trim().startsWith('--')) return

          // Penandanya dicari di beberapa baris sebelumnya, bukan satu saja:
          // pernyataan SQL sering didahului komentar penjelas yang panjang.
          const ditandai = baris.slice(Math.max(0, i - 4), i).some(x => TANDA.test(x))

          for (const [nama, pola] of MERUSAK) {
            if (!pola.test(b)) continue
            if (ditandai) continue
            keluhan.push(`${f}:${i + 1} ${nama} tanpa penanda — ${b.trim().slice(0, 70)}`)
          }

          // Tanpa pengecualian, bahkan dengan penanda.
          if (/^\s*(delete\s+from|update)\s+/i.test(b)) {
            const sisa = baris.slice(i).join('\n')
            const titik = sisa.indexOf(';')
            const pernyataan = titik > 0 ? sisa.slice(0, titik) : sisa.slice(0, 400)
            if (!/\bwhere\b/i.test(pernyataan)) {
              keluhan.push(`${f}:${i + 1} UPDATE/DELETE tanpa WHERE — ditolak Supabase (safeupdate)`)
            }
          }
        })
      }

      if (keluhan.length) {
        throw new Error(
          `[pagar-data] Migrasi bisa menghilangkan data:\n  ${keluhan.join('\n  ')}\n\n`
          + 'Kalau memang disengaja, tulis penandanya pada baris di atasnya:\n'
          + '  -- BOLEH-HAPUS: <alasan, satu kalimat>',
        )
      }
      console.log('[pagar-data] migrasi diperiksa — tidak ada penghapusan data tanpa penanda.')
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
  plugins: [react(), bagikanMetaPlugin(), pagarKunciPlugin(), pagarDataPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
})
