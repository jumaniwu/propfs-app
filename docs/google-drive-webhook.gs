/**
 * PropFS — Kontraktor AI: Webhook Auto-Upload Foto ke Google Drive
 * ================================================================
 * Cara pakai:
 * 1. Buka https://script.google.com → New Project.
 * 2. Ganti isi Code.gs dengan kode ini (hapus contoh myFunction bawaan).
 * 3. Isi FOLDER_LINK di bawah dengan LINK folder Google Drive tujuan Anda.
 *    Cara dapat link: buka Google Drive → klik kanan folder → "Bagikan" atau
 *    "Salin link", ATAU buka folder lalu salin URL di address bar. Contoh:
 *    https://drive.google.com/drive/folders/1AbCdEfGhIJKlmNOpQrStuVwx
 *    (boleh tempel link penuh — script otomatis ambil ID-nya. Boleh juga
 *     tempel ID mentahnya saja.)
 * 4. Deploy → New deployment → pilih tipe "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. Salin URL yang berakhiran /exec.
 * 6. Tempel URL itu di aplikasi: Kontraktor AI → Pengaturan Proyek →
 *    "Auto-Upload Foto ke Google Drive".
 *
 * Aplikasi akan mengirim foto (base64) sebagai JSON. Script menyimpannya
 * ke folder Anda; bila field "folder" dikirim, dibuatkan subfolder per proyek.
 *
 * CATATAN: yang ditempel di aplikasi PropFS adalah URL Web App (…/exec),
 * BUKAN link folder Drive. Link folder Drive hanya dipakai di FOLDER_LINK ini.
 */

// Tempel LINK folder Drive Anda di sini (boleh link penuh atau ID saja):
var FOLDER_LINK = 'TEMPEL_LINK_FOLDER_DRIVE_ANDA_DI_SINI';

/** Ambil ID folder dari link Drive, atau kembalikan apa adanya bila sudah ID. */
function folderIdFromLink(s) {
  s = String(s || '').trim();
  var m = s.match(/[-\w]{25,}/);   // ID Drive umumnya >= 25 karakter
  return m ? m[0] : s;
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var root = DriveApp.getFolderById(folderIdFromLink(FOLDER_LINK));

    // subfolder per proyek (opsional)
    var target = root;
    if (body.folder) {
      var it = root.getFoldersByName(body.folder);
      target = it.hasNext() ? it.next() : root.createFolder(body.folder);
    }

    var bytes = Utilities.base64Decode(body.data);
    var blob = Utilities.newBlob(bytes, body.mimeType || 'image/jpeg', body.name || ('foto_' + Date.now() + '.jpg'));
    var file = target.createFile(blob);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, id: file.getId(), url: file.getUrl() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('PropFS Drive webhook aktif.');
}
