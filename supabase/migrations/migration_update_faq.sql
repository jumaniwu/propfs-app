UPDATE app_settings
SET value = jsonb_set(
  value,
  '{faqItems}',
  '[
    {
      "id": "faq-1",
      "question": "Apa manfaat utama menggunakan PropFS dibanding cara manual?",
      "answer": "PropFS menghemat waktu Anda dari berminggu-minggu menjadi hitungan jam. Yang lebih penting, hasil analisisnya konsisten dan bebas human error. Developer yang menggunakan PropFS bisa mengambil keputusan investasi lebih cepat, lebih percaya diri, dan dengan data yang jauh lebih solid dibanding mengandalkan feeling atau spreadsheet buatan sendiri."
    },
    {
      "id": "faq-2",
      "question": "Siapa yang paling diuntungkan dengan menggunakan PropFS?",
      "answer": "PropFS paling dirasakan manfaatnya oleh empat tipe pengguna: (1) Developer properti yang ingin tahu apakah proyek mereka benar-benar menguntungkan sebelum mulai bangun, (2) Investor yang ingin memvalidasi tawaran kerjasama lahan sebelum menanam modal, (3) Konsultan properti yang butuh alat bantu membuat laporan FS profesional untuk klien, dan (4) Pemilik lahan yang ingin tahu potensi maksimal lahannya jika dikembangkan."
    },
    {
      "id": "faq-3",
      "question": "Apa yang bisa saya ketahui dari hasil analisis PropFS?",
      "answer": "Dari satu proyek yang diinput, PropFS menghasilkan: proyeksi keuntungan bersih, titik balik modal (breakeven), Net Present Value (NPV), Internal Rate of Return (IRR), simulasi cashflow bulanan, analisis sensitivitas terhadap perubahan harga atau biaya, hingga perhitungan bagi hasil dengan investor. Semua informasi yang Anda butuhkan untuk memutuskan apakah proyek layak dilanjutkan atau tidak."
    },
    {
      "id": "faq-4",
      "question": "Bagaimana PropFS membantu saya terlihat lebih profesional di depan investor?",
      "answer": "Laporan PDF yang dihasilkan PropFS tampil dengan format standar keuangan yang rapi, lengkap dengan grafik cashflow, tabel proyeksi, dan analisis risiko. Ketika Anda presentasi ke investor atau bank dengan laporan seperti ini, Anda langsung terlihat serius dan terukur — bukan sekadar developer yang mengandalkan estimasi kasar. Kepercayaan investor dimulai dari data yang bisa dipertanggungjawabkan."
    },
    {
      "id": "faq-5",
      "question": "Apakah PropFS bisa membantu saya menghindari kerugian proyek?",
      "answer": "Inilah tujuan utama PropFS. Banyak developer merugi bukan karena proyeknya buruk, tapi karena tidak punya gambaran cashflow yang akurat sejak awal — kehabisan modal di tengah pembangunan, salah menghitung biaya, atau terlalu optimis dengan harga jual. PropFS memaksa Anda melihat angka yang realistis sebelum satu pun bata dipasang, termasuk simulasi skenario terburuk jika harga jual turun atau biaya membangun naik."
    },
    {
      "id": "faq-6",
      "question": "Apakah PropFS cocok untuk proyek skala kecil seperti 10-20 unit rumah?",
      "answer": "Justru proyek skala kecil yang paling membutuhkan analisis yang cermat — margin kesalahannya lebih tipis dan modalnya lebih terbatas. PropFS sama efektifnya untuk proyek 10 unit perumahan sederhana maupun proyek ratusan unit mixed-use. Tidak ada minimum skala proyek. Yang penting adalah Anda tahu angkanya sebelum mulai."
    },
    {
      "id": "faq-7",
      "question": "Apa tujuan jangka panjang PropFS untuk industri properti Indonesia?",
      "answer": "Kami percaya bahwa industri properti Indonesia yang lebih sehat dimulai dari keputusan investasi yang lebih cerdas. Terlalu banyak proyek gagal di tengah jalan karena perencanaan keuangan yang lemah. PropFS hadir untuk mendemokratisasi akses terhadap analisis kelayakan properti yang selama ini hanya bisa dilakukan oleh konsultan mahal atau developer besar. Dengan PropFS, developer kecil pun bisa bersaing dengan perencanaan yang sama profesionalnya."
    },
    {
      "id": "faq-8",
      "question": "Apakah hasil analisis PropFS bisa saya jadikan pegangan untuk negosiasi harga lahan?",
      "answer": "Sangat bisa. Salah satu penggunaan paling powerful dari PropFS adalah saat negosiasi harga lahan. Dengan memasukkan berbagai skenario harga lahan, Anda bisa langsung melihat di harga berapa proyek masih layak dan di harga berapa sudah tidak masuk akal secara finansial. Ini memberi Anda posisi negosiasi yang jauh lebih kuat karena berbasis angka, bukan feeling."
    }
  ]'::jsonb,
  true
)
WHERE key = 'landing_page_cms';

-- Verifikasi isi FAQ baru:
SELECT 
  item->>'question' as pertanyaan
FROM app_settings,
jsonb_array_elements(value->'faqItems') as item
WHERE key = 'landing_page_cms';
