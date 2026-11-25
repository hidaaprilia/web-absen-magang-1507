window.ABSEN_CONFIG = {
  // Tempel URL Web App Google Apps Script setelah deploy di Spreadsheet 1507_Presensi Magang
  // Contoh: 'https://script.google.com/macros/s/AKfycb.../exec'
  API_URL: 'https://script.google.com/macros/s/AKfycbzLqoKuaCKFc8WEkDVWrnngACt6n9TcFDFS87tkja3mFtYLe3vWBnKEkHGKrSp-XE0_/exec',

  TARGET_LAT: -0.8423974510439358,
  TARGET_LNG: 103.43806729772506,
  MAX_DISTANCE_METERS: 20,
  MAX_GPS_ACCURACY_METERS: 50,
  REQUIRED_GPS_SAMPLES: 3,

  // Data awal peserta (dipakai saat mode preview lokal sebelum Apps Script dihubungkan)
  DEFAULT_PARTICIPANTS: [
    { id: 'P001', nama: 'M Abrar', kategori: 'MagangHub', posisi: 'Asisten Statistisi', aktif: true },
    { id: 'P002', nama: 'Tia Isnaeni', kategori: 'MagangHub', posisi: 'Asisten Pengelola Keuangan', aktif: true },
    { id: 'P003', nama: 'Muhammad Alvin Hywala', kategori: 'MagangHub', posisi: 'Asisten Pranata Komputer', aktif: true },
    { id: 'P004', nama: 'Taufik Mastiyar', kategori: 'MagangHub', posisi: 'Asisten Pranata Komputer', aktif: true },
    { id: 'P005', nama: 'Fitra Alam Fajar Maulana Ardiansyah', kategori: 'MagangHub', posisi: 'Asisten Publisitas dan Kehumasan', aktif: true },
    { id: 'P006', nama: 'M. Satria Alfaridzi', kategori: 'Magang SMK', posisi: 'Magang SMK', aktif: true },
    { id: 'P007', nama: 'Iwan Kurniawan', kategori: 'Magang SMK', posisi: 'Magang SMK', aktif: true }
  ]
};
