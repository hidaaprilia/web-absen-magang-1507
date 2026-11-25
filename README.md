# Web Absensi Peserta Magang 1507

Aplikasi web presensi peserta magang (`MagangHub` dan `Magang SMK`) dengan validasi radius lokasi **15 meter**, sinkronisasi **waktu server WIB**, deteksi anomali GPS, dan database **Google Spreadsheet** via **Google Apps Script**.

## Struktur Folder
- `web-absen/` — Frontend statis (`index.html`, `app.js`, `logic.js`, `styles.css`, `config.js`, `vercel.json`)
- `apps-script/Code.gs` — Backend Google Apps Script untuk spreadsheet `1507_Presensi Magang`
- `vercel.json` — Konfigurasi root agar Vercel otomatis menyajikan folder `web-absen`

## Pengaturan Cepat
1. Buka Google Spreadsheet `1507_Presensi Magang` -> **Ekstensi** -> **Apps Script**.
2. Tempel isi `apps-script/Code.gs` ke `Code.gs`, simpan, lalu jalankan fungsi `setupSpreadsheet()` sekali.
3. Klik **Deploy** -> **Deployment baru** -> **Aplikasi web** (Jalankan sebagai: *Saya*, Akses: *Siapa saja*).
4. Salin URL Web App ke `web-absen/config.js` pada nilai `API_URL`.
5. Deploy ke Vercel (otomatis membaca `vercel.json` -> `outputDirectory: "web-absen"`).
