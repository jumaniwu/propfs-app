# APK Android PropFS (sideload, tanpa Play Store)

## Cara mendapatkan APK-nya

1. Buka repositori di GitHub → tab **Actions**
2. Pilih alur **Build APK Android** di sisi kiri
3. Klik **Run workflow** → **Run workflow**
4. Tunggu sekitar lima menit
5. Buka jalannya alur → bagian **Artifacts** di bawah → unduh `propfs-apk-…`
6. Berkas zip-nya berisi `.apk`. Kirim ke HP, buka, izinkan "Instal dari
   sumber tidak dikenal" saat ditanya.

Sebelum keystore dipasang, yang keluar adalah **APK debug**. Itu cukup untuk
dipakai sendiri dan tim, tetapi jangan disebar luas — APK debug bisa
di-*debug* siapa pun yang memegangnya.

## Yang perlu diketahui sebelum memasang

**Aplikasi ini wajib online.** Ia memuat https://propfs.id langsung dari
internet, bukan membawa salinannya. Tanpa jaringan, layarnya kosong.

Itu keputusan yang disengaja, dan alasannya bukan kemalasan: aplikasi ini
membangun tautan kwitansi, PO, invoice, dan SPK dari alamat situs yang sedang
dibuka. APK yang membawa salinan berjalan dari `capacitor://localhost`, dan
alamat itulah yang akan ikut tercetak di setiap tautan yang dikirim ke
konsumen dan vendor lewat WhatsApp — tautan yang tidak bisa dibuka siapa pun,
dan tidak ada yang menyadarinya sampai konsumen mengeluh.

Keuntungan sampingannya besar: **setiap pembaruan situs langsung sampai ke
APK**, tanpa membangun ulang dan tanpa siapa pun perlu memasang ulang.

## Membuat keystore (sekali seumur aplikasi)

Keystore adalah kunci yang membuktikan APK ini benar-benar dari Anda. Android
menolak memperbarui aplikasi yang ditandatangani kunci berbeda, jadi **kunci
ini tidak boleh hilang** — kalau hilang, semua orang harus meng-uninstall
dulu sebelum bisa memasang versi berikutnya.

Jalankan di komputer mana pun yang punya Java:

```bash
keytool -genkey -v \
  -keystore propfs.keystore \
  -alias propfs \
  -keyalg RSA -keysize 2048 -validity 10000
```

Ia akan menanyakan kata sandi dan identitas. Simpan kata sandinya di tempat
yang aman — pengelola kata sandi, bukan catatan di HP.

Lalu ubah keystore menjadi teks supaya bisa disimpan sebagai rahasia GitHub:

```bash
base64 -w0 propfs.keystore > propfs.keystore.txt   # Linux
base64 -i propfs.keystore | tr -d '\n' > propfs.keystore.txt   # macOS
```

## Memasang rahasianya di GitHub

Settings → Secrets and variables → **Actions** → New repository secret.
Empat buah, namanya harus persis:

| Nama | Isi |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | seluruh isi `propfs.keystore.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | kata sandi keystore |
| `ANDROID_KEY_ALIAS` | `propfs` |
| `ANDROID_KEY_PASSWORD` | kata sandi kunci (biasanya sama) |

Setelah keempatnya ada, alur berikutnya otomatis menghasilkan APK release yang
ditandatangani. Tidak ada yang perlu diubah di kode.

**Penting saat pindah dari debug ke release:** Android menganggap keduanya
aplikasi yang ditandatangani berbeda dan menolak menimpanya. APK debug harus
di-*uninstall* lebih dulu di setiap HP.

## Yang TIDAK masuk ke dalam APK

Tidak ada satu rahasia pun. Karena aplikasi dimuat dari situsnya, isi APK
hanyalah cangkang: satu halaman "Membuka PropFS…" dan konfigurasi alamat.
Tidak ada `npm run build`, tidak ada `VITE_*`, tidak ada kunci Supabase di
dalam berkas yang dibagikan orang.

## Perilaku khusus di dalam APK

| Hal | Perilaku |
|---|---|
| Tombol kembali perangkat | Menutup dialog bila ada; kalau tidak, mundur satu halaman; di halaman pertama **mengecilkan** aplikasi, bukan menutupnya |
| Unduh PDF / Excel | Membuka menu **Bagikan** Android — kwitansi bisa langsung dikirim ke WhatsApp konsumen tanpa mampir ke aplikasi Files |
| Bilah status | Navy, tidak menimpa konten |
| wa.me, mailto: | Dilempar ke WhatsApp / aplikasi email, tidak dibuka di dalam WebView |

## Kalau nanti mau masuk Google Play

APK semacam ini kemungkinan besar **ditolak** Play Store dengan alasan
"webview wrapper". Untuk ke sana, isinya harus dibundel ke dalam aplikasi —
dan itu berarti seluruh tiga belas titik yang membaca alamat situs harus
diperbaiki lebih dulu. Pekerjaan tersendiri, bukan penyetelan.

## Memperbarui ikon

Ganti `assets/icon.png` (1024×1024) dan `assets/splash.png` (2732×2732), lalu
jalankan alurnya lagi. Keduanya dibuat dari `public/favicon.svg` — sumber yang
sama dengan favicon situs, supaya keduanya tidak pernah berbeda.
