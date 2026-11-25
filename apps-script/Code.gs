/**
 * Backend Google Apps Script untuk Web Absensi Peserta Magang 1507
 * Terhubung ke Google Spreadsheet: 1507_Presensi Magang
 * ID Spreadsheet: 1t4_29ie6hc3hjryDlpcKr9Rb6uYDaF8ZZsVft--Sifo
 *
 * Cara pakai:
 * 1. Buka Spreadsheet -> Ekstensi -> Apps Script
 * 2. Tempel seluruh kode ini ke Code.gs, lalu Simpan
 * 3. Jalankan fungsi setupSpreadsheet() sekali untuk membuat sheet & data awal peserta
 * 4. Klik Deploy -> Deployment baru -> Aplikasi web
 *    - Jalankan sebagai: Saya
 *    - Yang memiliki akses: Siapa saja
 * 5. Salin URL Web App ke pengaturan web frontend (config.js / Pengaturan Koneksi)
 */

const SPREADSHEET_ID = '1t4_29ie6hc3hjryDlpcKr9Rb6uYDaF8ZZsVft--Sifo';
const TIMEZONE = 'Asia/Jakarta';
const TARGET_LAT = -0.8423974510439358;
const TARGET_LNG = 103.43806729772506;
const MAX_DISTANCE_METERS = 20;
const MAX_GPS_ACCURACY_METERS = 50;
const MIN_KEGIATAN_WORDS = 100;
const DEFAULT_ADMIN_PIN = '15072026';

const SHEET_PESERTA = 'Peserta';
const SHEET_ABSENSI = 'Absensi';
const SHEET_PENGATURAN = 'Pengaturan';

const INITIAL_PARTICIPANTS = [
  { id: 'P001', nama: 'M Abrar', kategori: 'MagangHub', posisi: 'Asisten Statistisi' },
  { id: 'P002', nama: 'Tia Isnaeni', kategori: 'MagangHub', posisi: 'Asisten Pengelola Keuangan' },
  { id: 'P003', nama: 'Muhammad Alvin Hywala', kategori: 'MagangHub', posisi: 'Asisten Pranata Komputer' },
  { id: 'P004', nama: 'Taufik Mastiyar', kategori: 'MagangHub', posisi: 'Asisten Pranata Komputer' },
  { id: 'P005', nama: 'Fitra Alam Fajar Maulana Ardiansyah', kategori: 'MagangHub', posisi: 'Asisten Publisitas dan Kehumasan' },
  { id: 'P006', nama: 'M. Satria Alfaridzi', kategori: 'Magang SMK', posisi: 'Magang SMK' },
  { id: 'P007', nama: 'Iwan Kurniawan', kategori: 'Magang SMK', posisi: 'Magang SMK' }
];

function getSpreadsheet_() {
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active && active.getId() === SPREADSHEET_ID) {
      return active;
    }
  } catch (e) {}
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Jalankan fungsi ini sekali secara manual untuk inisialisasi sheet dan data awal peserta.
 */
function setupSpreadsheet() {
  const ss = getSpreadsheet_();
  const nowStr = formatDateTimeWib_(new Date());

  // 1. Sheet Peserta
  let sheetPeserta = ss.getSheetByName(SHEET_PESERTA);
  if (!sheetPeserta) {
    sheetPeserta = ss.insertSheet(SHEET_PESERTA);
  }
  if (sheetPeserta.getLastRow() === 0) {
    sheetPeserta.appendRow(['ID', 'Nama', 'Kategori', 'Posisi_Jurusan', 'Aktif', 'Ditambahkan_Pada']);
    sheetPeserta.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#e8eef7');
    INITIAL_PARTICIPANTS.forEach(function (p) {
      sheetPeserta.appendRow([p.id, p.nama, p.kategori, p.posisi, 'Ya', nowStr]);
    });
    sheetPeserta.setFrozenRows(1);
  }

  // 2. Sheet Absensi
  let sheetAbsensi = ss.getSheetByName(SHEET_ABSENSI);
  if (!sheetAbsensi) {
    sheetAbsensi = ss.insertSheet(SHEET_ABSENSI);
  }
  if (sheetAbsensi.getLastRow() === 0) {
    sheetAbsensi.appendRow([
      'ID_Absen',
      'Tanggal',
      'Hari',
      'ID_Peserta',
      'Nama',
      'Kategori',
      'Posisi_Jurusan',
      'Jenis_Absen',
      'Waktu_Server_WIB',
      'Status_Ketepatan',
      'Kegiatan_Hari_Ini',
      'Latitude',
      'Longitude',
      'Jarak_Meter',
      'Akurasi_GPS_Meter',
      'Status_GPS',
      'Catatan_Anomali',
      'Perangkat'
    ]);
    sheetAbsensi.getRange(1, 1, 1, 18).setFontWeight('bold').setBackground('#e8eef7');
    sheetAbsensi.setFrozenRows(1);
  }

  // 3. Sheet Pengaturan
  let sheetPengaturan = ss.getSheetByName(SHEET_PENGATURAN);
  if (!sheetPengaturan) {
    sheetPengaturan = ss.insertSheet(SHEET_PENGATURAN);
  }
  if (sheetPengaturan.getLastRow() === 0) {
    sheetPengaturan.appendRow(['Kunci', 'Nilai', 'Keterangan']);
    sheetPengaturan.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e8eef7');
    sheetPengaturan.appendRow(['ADMIN_PIN', DEFAULT_ADMIN_PIN, 'PIN untuk login Panel Admin (ubah di sini)']);
    sheetPengaturan.appendRow(['TARGET_LAT', TARGET_LAT, 'Latitude titik acuan absensi']);
    sheetPengaturan.appendRow(['TARGET_LNG', TARGET_LNG, 'Longitude titik acuan absensi']);
    sheetPengaturan.appendRow(['MAX_DISTANCE_METERS', MAX_DISTANCE_METERS, 'Batas jarak maksimal absensi (meter)']);
    sheetPengaturan.setFrozenRows(1);
  }

  return { ok: true, message: 'Setup spreadsheet selesai.' };
}

function parseConfigNumber_(rawVal, minVal, maxVal, fallback) {
  let num = typeof rawVal === 'number' ? rawVal : Number(String(rawVal || '').trim().replace(',', '.'));
  if (!isFinite(num) || num < minVal || num > maxVal) {
    return fallback;
  }
  return num;
}

function getConfig_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_PENGATURAN);
  if (!sheet) {
    setupSpreadsheet();
    sheet = ss.getSheetByName(SHEET_PENGATURAN);
  }
  const rows = sheet.getDataRange().getValues();
  const cfg = {
    ADMIN_PIN: DEFAULT_ADMIN_PIN,
    TARGET_LAT: TARGET_LAT,
    TARGET_LNG: TARGET_LNG,
    MAX_DISTANCE_METERS: MAX_DISTANCE_METERS
  };
  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0] || '').trim();
    const rawVal = rows[i][1];
    const val = String(rawVal == null ? '' : rawVal).trim();
    if (!key || !val) continue;
    if (key === 'ADMIN_PIN') cfg.ADMIN_PIN = val;
    if (key === 'TARGET_LAT') cfg.TARGET_LAT = parseConfigNumber_(rawVal, -90, 90, TARGET_LAT);
    if (key === 'TARGET_LNG') cfg.TARGET_LNG = parseConfigNumber_(rawVal, -180, 180, TARGET_LNG);
    if (key === 'MAX_DISTANCE_METERS') {
      cfg.MAX_DISTANCE_METERS = parseConfigNumber_(rawVal, 1, 5000, MAX_DISTANCE_METERS);
    }
  }
  return cfg;
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = String(params.action || 'init').trim();

  try {
    if (action === 'init' || action === 'time') {
      const now = new Date();
      const cfg = getConfig_();
      const participants = getParticipants_(true);
      const todayWib = formatDateWib_(now);
      const todayRecords = getAttendanceByDate_(todayWib);

      return jsonResponse_({
        ok: true,
        serverTimestampMs: now.getTime(),
        serverDateWib: todayWib,
        serverTimeWib: formatTimeWib_(now),
        timezone: TIMEZONE,
        geofence: {
          lat: cfg.TARGET_LAT,
          lng: cfg.TARGET_LNG,
          maxDistanceMeters: cfg.MAX_DISTANCE_METERS
        },
        participants: participants,
        todaySummary: summarizeTodayByParticipant_(todayRecords)
      });
    }

    if (action === 'adminData') {
      const pin = String(params.pin || '').trim();
      const cfg = getConfig_();
      if (!pin || pin !== cfg.ADMIN_PIN) {
        return jsonResponse_({ ok: false, error: 'PIN admin salah.' });
      }
      const dateFilter = String(params.date || '').trim();
      const participants = getParticipants_(false);
      const records = dateFilter ? getAttendanceByDate_(dateFilter) : getAllAttendance_();
      return jsonResponse_({
        ok: true,
        serverTimestampMs: new Date().getTime(),
        serverDateWib: formatDateWib_(new Date()),
        participants: participants,
        records: records
      });
    }

    return jsonResponse_({ ok: false, error: 'Action tidak dikenal: ' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(raw);
    const action = String(body.action || '').trim();

    if (action === 'submitAttendance') {
      return jsonResponse_(handleSubmitAttendance_(body));
    }
    if (action === 'adminVerify') {
      const cfg = getConfig_();
      const valid = String(body.pin || '').trim() === cfg.ADMIN_PIN;
      return jsonResponse_({ ok: valid, error: valid ? null : 'PIN admin salah.' });
    }
    if (action === 'addParticipant') {
      return jsonResponse_(handleAddParticipant_(body));
    }
    if (action === 'toggleParticipant') {
      return jsonResponse_(handleToggleParticipant_(body));
    }

    return jsonResponse_({ ok: false, error: 'Action POST tidak dikenal: ' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function handleSubmitAttendance_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const now = new Date();
    const cfg = getConfig_();
    const participantId = String(body.participantId || '').trim();
    const jenisAbsen = String(body.jenisAbsen || '').trim(); // 'Masuk' | 'Pulang'
    const kegiatan = String(body.kegiatan || '').trim();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const accuracy = Number(body.accuracy);
    const gpsTimestampMs = Number(body.gpsTimestampMs || 0);
    const suspectFlags = Array.isArray(body.suspectFlags) ? body.suspectFlags.map(String) : [];
    const blockReason = String(body.blockReason || '').trim();
    const userAgent = String(body.userAgent || '').slice(0, 180);

    if (!participantId) return { ok: false, error: 'Peserta wajib dipilih.' };
    if (jenisAbsen !== 'Masuk' && jenisAbsen !== 'Pulang') {
      return { ok: false, error: 'Jenis absen harus Masuk atau Pulang.' };
    }
    if (jenisAbsen === 'Pulang') {
      const wordCount = kegiatan ? kegiatan.split(/\s+/).filter(Boolean).length : 0;
      if (wordCount < MIN_KEGIATAN_WORDS) {
        return {
          ok: false,
          error:
            'Isian kegiatan hari ini wajib minimal ' +
            MIN_KEGIATAN_WORDS +
            ' kata saat absen pulang (saat ini: ' +
            wordCount +
            ' kata).'
        };
      }
    }
    const recordedKegiatan = jenisAbsen === 'Masuk' ? (kegiatan || '-') : kegiatan;
    if (!isFinite(lat) || !isFinite(lng) || !isFinite(accuracy)) {
      return { ok: false, error: 'Data koordinat GPS tidak valid.' };
    }
    if (accuracy <= 0 || accuracy > MAX_GPS_ACCURACY_METERS) {
      return {
        ok: false,
        error: 'Akurasi GPS tidak memenuhi syarat (' + Math.round(accuracy) + ' m). Aktifkan GPS presisi tinggi dan coba di area terbuka.'
      };
    }
    if (blockReason) {
      return { ok: false, error: 'Validasi GPS ditolak: ' + blockReason };
    }

    // Validasi timestamp GPS terhadap waktu server (mencegah cache / manipulasi timestamp jauh)
    if (gpsTimestampMs > 0) {
      const driftSec = Math.abs(now.getTime() - gpsTimestampMs) / 1000;
      if (driftSec > 180) {
        suspectFlags.push('Selisih waktu GPS vs server ' + Math.round(driftSec) + ' dtk');
      }
    }

    // Hitung jarak Haversine di server
    const distanceMeters = haversineMeters_(lat, lng, cfg.TARGET_LAT, cfg.TARGET_LNG);
    if (distanceMeters > cfg.MAX_DISTANCE_METERS) {
      return {
        ok: false,
        error: 'Lokasi di luar batas ' + cfg.MAX_DISTANCE_METERS + ' meter (jarak Anda: ' + distanceMeters.toFixed(2) + ' meter).'
      };
    }

    // Cari peserta aktif
    const participants = getParticipants_(true);
    const participant = participants.find(function (p) { return p.id === participantId; });
    if (!participant) {
      return { ok: false, error: 'Peserta tidak ditemukan atau sudah dinonaktifkan.' };
    }

    // Cek duplikasi absen hari ini
    const todayWib = formatDateWib_(now);
    const todayRecords = getAttendanceByDate_(todayWib);
    const alreadyMasuk = todayRecords.some(function (r) {
      return r.idPeserta === participant.id && r.jenisAbsen === 'Masuk';
    });
    const alreadyPulang = todayRecords.some(function (r) {
      return r.idPeserta === participant.id && r.jenisAbsen === 'Pulang';
    });

    if (jenisAbsen === 'Masuk' && alreadyMasuk) {
      return { ok: false, error: participant.nama + ' sudah melakukan Absen Masuk hari ini (' + todayWib + ').' };
    }
    if (jenisAbsen === 'Pulang' && !alreadyMasuk) {
      return { ok: false, error: participant.nama + ' belum melakukan Absen Masuk hari ini. Silakan Absen Masuk terlebih dahulu.' };
    }
    if (jenisAbsen === 'Pulang' && alreadyPulang) {
      return { ok: false, error: participant.nama + ' sudah melakukan Absen Pulang hari ini (' + todayWib + ').' };
    }

    // Evaluasi status ketepatan berdasarkan WAKTU SERVER WIB (anti ganti jam perangkat)
    const evalResult = evaluateAttendanceTime_(now, jenisAbsen);
    const statusGps = suspectFlags.length > 0 ? 'Perlu Cek' : 'Valid';
    const catatanAnomali = suspectFlags.join('; ');
    const idAbsen = 'ABS-' + Utilities.formatDate(now, TIMEZONE, 'yyyyMMdd-HHmmss') + '-' + participant.id;

    const ss = getSpreadsheet_();
    const sheetAbsensi = ss.getSheetByName(SHEET_ABSENSI);
    sheetAbsensi.appendRow([
      idAbsen,
      todayWib,
      evalResult.hariIndonesia,
      participant.id,
      participant.nama,
      participant.kategori,
      participant.posisi,
      jenisAbsen,
      evalResult.waktuWib,
      evalResult.statusKetepatan,
      recordedKegiatan,
      lat,
      lng,
      Number(distanceMeters.toFixed(2)),
      Number(accuracy.toFixed(1)),
      statusGps,
      catatanAnomali,
      userAgent
    ]);

    return {
      ok: true,
      record: {
        idAbsen: idAbsen,
        tanggal: todayWib,
        hari: evalResult.hariIndonesia,
        idPeserta: participant.id,
        nama: participant.nama,
        kategori: participant.kategori,
        posisi: participant.posisi,
        jenisAbsen: jenisAbsen,
        waktuWib: evalResult.waktuWib,
        statusKetepatan: evalResult.statusKetepatan,
        kegiatan: recordedKegiatan,
        jarakMeter: Number(distanceMeters.toFixed(2)),
        akurasiMeter: Number(accuracy.toFixed(1)),
        statusGps: statusGps
      }
    };
  } finally {
    lock.releaseLock();
  }
}

function handleAddParticipant_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cfg = getConfig_();
    const pin = String(body.pin || '').trim();
    if (!pin || pin !== cfg.ADMIN_PIN) {
      return { ok: false, error: 'PIN admin salah.' };
    }

    const nama = String(body.nama || '').trim();
    const kategori = String(body.kategori || '').trim();
    const posisi = String(body.posisi || '').trim() || (kategori === 'Magang SMK' ? 'Magang SMK' : '-');

    if (!nama || nama.length < 2) {
      return { ok: false, error: 'Nama peserta wajib diisi.' };
    }
    if (kategori !== 'MagangHub' && kategori !== 'Magang SMK') {
      return { ok: false, error: 'Kategori harus MagangHub atau Magang SMK.' };
    }

    const existing = getParticipants_(false);
    const duplicate = existing.some(function (p) {
      return p.nama.toLowerCase() === nama.toLowerCase();
    });
    if (duplicate) {
      return { ok: false, error: 'Peserta dengan nama "' + nama + '" sudah ada.' };
    }

    const nextNum = existing.length + 1;
    const newId = 'P' + String(nextNum).padStart(3, '0');
    const nowStr = formatDateTimeWib_(new Date());

    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(SHEET_PESERTA);
    sheet.appendRow([newId, nama, kategori, posisi, 'Ya', nowStr]);

    return {
      ok: true,
      participant: {
        id: newId,
        nama: nama,
        kategori: kategori,
        posisi: posisi,
        aktif: true
      }
    };
  } finally {
    lock.releaseLock();
  }
}

function handleToggleParticipant_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cfg = getConfig_();
    const pin = String(body.pin || '').trim();
    if (!pin || pin !== cfg.ADMIN_PIN) {
      return { ok: false, error: 'PIN admin salah.' };
    }
    const id = String(body.id || '').trim();
    const aktif = body.aktif ? 'Ya' : 'Tidak';

    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(SHEET_PESERTA);
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim() === id) {
        sheet.getRange(i + 1, 5).setValue(aktif);
        return { ok: true, id: id, aktif: body.aktif };
      }
    }
    return { ok: false, error: 'ID peserta tidak ditemukan.' };
  } finally {
    lock.releaseLock();
  }
}

function evaluateAttendanceTime_(dateObj, jenisAbsen) {
  const hh = Number(Utilities.formatDate(dateObj, TIMEZONE, 'HH'));
  const mm = Number(Utilities.formatDate(dateObj, TIMEZONE, 'mm'));
  const ss = Number(Utilities.formatDate(dateObj, TIMEZONE, 'ss'));
  const isoDay = Number(Utilities.formatDate(dateObj, TIMEZONE, 'u')); // 1=Senin .. 7=Minggu
  const hariMap = {
    1: 'Senin',
    2: 'Selasa',
    3: 'Rabu',
    4: 'Kamis',
    5: 'Jumat',
    6: 'Sabtu',
    7: 'Minggu'
  };
  const totalMinutes = hh * 60 + mm;
  const waktuWib = Utilities.formatDate(dateObj, TIMEZONE, 'HH:mm:ss');

  let statusKetepatan = '';
  if (jenisAbsen === 'Masuk') {
    if (totalMinutes < 7 * 60 + 31) {
      statusKetepatan = 'Tepat Waktu';
    } else if (totalMinutes <= 8 * 60) {
      statusKetepatan = 'Telat 1';
    } else if (totalMinutes <= 12 * 60) {
      statusKetepatan = 'Telat 2';
    } else {
      statusKetepatan = 'Telat 2 (Lewat 12:00)';
    }
  } else {
    if (isoDay >= 1 && isoDay <= 4) {
      statusKetepatan = totalMinutes < 16 * 60 ? 'Pulang Lebih Awal' : 'Pulang Tepat Waktu';
    } else if (isoDay === 5) {
      statusKetepatan = totalMinutes < 16 * 60 + 30 ? 'Pulang Lebih Awal' : 'Pulang Tepat Waktu';
    } else {
      statusKetepatan = 'Pulang (Akhir Pekan)';
    }
  }

  return {
    hariIndonesia: hariMap[isoDay] || '',
    waktuWib: waktuWib,
    totalMinutes: totalMinutes,
    isoDay: isoDay,
    statusKetepatan: statusKetepatan
  };
}

function haversineMeters_(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = function (deg) { return (deg * Math.PI) / 180; };
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getParticipants_(onlyActive) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_PESERTA);
  if (!sheet || sheet.getLastRow() === 0) {
    setupSpreadsheet();
    sheet = ss.getSheetByName(SHEET_PESERTA);
  }
  const rows = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i][0] || '').trim();
    const nama = String(rows[i][1] || '').trim();
    const kategori = String(rows[i][2] || '').trim();
    const posisi = String(rows[i][3] || '').trim();
    const aktifStr = String(rows[i][4] || 'Ya').trim().toLowerCase();
    const aktif = aktifStr === 'ya' || aktifStr === 'true' || aktifStr === '1';
    if (!id || !nama) continue;
    if (onlyActive && !aktif) continue;
    list.push({ id: id, nama: nama, kategori: kategori, posisi: posisi, aktif: aktif });
  }
  return list;
}

function getAllAttendance_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_ABSENSI);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const rows = sheet.getDataRange().getValues();
  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    records.push({
      idAbsen: String(r[0]),
      tanggal: formatCellDate_(r[1]),
      hari: String(r[2] || ''),
      idPeserta: String(r[3] || ''),
      nama: String(r[4] || ''),
      kategori: String(r[5] || ''),
      posisi: String(r[6] || ''),
      jenisAbsen: String(r[7] || ''),
      waktuWib: formatCellTime_(r[8]),
      statusKetepatan: String(r[9] || ''),
      kegiatan: String(r[10] || ''),
      latitude: Number(r[11] || 0),
      longitude: Number(r[12] || 0),
      jarakMeter: Number(r[13] || 0),
      akurasiMeter: Number(r[14] || 0),
      statusGps: String(r[15] || ''),
      catatanAnomali: String(r[16] || ''),
      perangkat: String(r[17] || '')
    });
  }
  return records;
}

function getAttendanceByDate_(dateStr) {
  return getAllAttendance_().filter(function (r) {
    return r.tanggal === dateStr;
  });
}

function summarizeTodayByParticipant_(records) {
  const map = {};
  records.forEach(function (r) {
    if (!map[r.idPeserta]) {
      map[r.idPeserta] = { masuk: null, pulang: null };
    }
    if (r.jenisAbsen === 'Masuk') map[r.idPeserta].masuk = r;
    if (r.jenisAbsen === 'Pulang') map[r.idPeserta].pulang = r;
  });
  return map;
}

function formatDateWib_(dateObj) {
  return Utilities.formatDate(dateObj, TIMEZONE, 'yyyy-MM-dd');
}

function formatTimeWib_(dateObj) {
  return Utilities.formatDate(dateObj, TIMEZONE, 'HH:mm:ss');
}

function formatDateTimeWib_(dateObj) {
  return Utilities.formatDate(dateObj, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function formatCellDate_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, TIMEZONE, 'yyyy-MM-dd');
  }
  return String(val || '').trim();
}

function formatCellTime_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, TIMEZONE, 'HH:mm:ss');
  }
  return String(val || '').trim();
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
