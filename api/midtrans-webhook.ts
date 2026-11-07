// Alamat lama untuk notifikasi Midtrans — perilakunya SAMA PERSIS dengan
// /api/webhook.
//
// Dulu berkas ini salinan yang sudah menyimpang: ia menulis `expires_at`,
// kolom yang sudah diganti nama menjadi `expired_at`, tidak mengenal add-on,
// dan tidak mencatat komisi. Alamat mana pun yang terpasang di dashboard
// Midtrans, keduanya kini menjalankan kode yang sama.
export { default } from './webhook.js';
