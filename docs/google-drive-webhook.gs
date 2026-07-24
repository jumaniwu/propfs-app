/**
 * PropFS — Kontraktor AI: Webhook Auto-Upload Foto ke Google Drive
 * ================================================================
 * Cara pakai:
 * 1. Buka https://script.google.com → New Project.
 * 2. Ganti isi Code.gs dengan kode ini.
 * 3. Ganti FOLDER_ID di bawah dengan ID folder Drive tujuan Anda.
 *    (Buka folder di Drive → lihat URL: .../folders/<INI_FOLDER_ID>)
 * 4. Deploy → New deployment → pilih tipe "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. Salin URL yang berakhiran /exec.
 * 6. Tempel URL itu di aplikasi: Kontraktor AI → Pengaturan Proyek →
 *    "Auto-Upload Foto ke Google Drive".
 *
 * Aplikasi akan mengirim foto (base64) sebagai JSON. Script menyimpannya
 * ke folder Anda; bila field "folder" dikirim, dibuatkan subfolder per proyek.
 */

var FOLDER_ID = 'GANTI_DENGAN_ID_FOLDER_DRIVE_ANDA';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var root = DriveApp.getFolderById(FOLDER_ID);

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
