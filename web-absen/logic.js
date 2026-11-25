(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AbsenLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HARI_MAP = {
    Sun: { isoDay: 7, nama: 'Minggu' },
    Mon: { isoDay: 1, nama: 'Senin' },
    Tue: { isoDay: 2, nama: 'Selasa' },
    Wed: { isoDay: 3, nama: 'Rabu' },
    Thu: { isoDay: 4, nama: 'Kamis' },
    Fri: { isoDay: 5, nama: 'Jumat' },
    Sat: { isoDay: 6, nama: 'Sabtu' }
  };

  function haversineMeters(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var toRad = function (deg) {
      return (deg * Math.PI) / 180;
    };
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function getWibDateParts(timestampMs) {
    var date = new Date(timestampMs);
    var formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    var parts = formatter.formatToParts(date);
    var map = {};
    for (var i = 0; i < parts.length; i++) {
      map[parts[i].type] = parts[i].value;
    }
    var hour = Number(map.hour === '24' ? '0' : map.hour);
    var minute = Number(map.minute);
    var second = Number(map.second);
    var hariInfo = HARI_MAP[map.weekday] || { isoDay: 1, nama: 'Senin' };

    return {
      dateStr: map.year + '-' + map.month + '-' + map.day,
      timeStr:
        String(hour).padStart(2, '0') +
        ':' +
        String(minute).padStart(2, '0') +
        ':' +
        String(second).padStart(2, '0'),
      hour: hour,
      minute: minute,
      second: second,
      isoDay: hariInfo.isoDay,
      hariNama: hariInfo.nama
    };
  }

  function evaluateAttendanceTime(wibParts, jenisAbsen) {
    var totalMinutes = wibParts.hour * 60 + wibParts.minute;
    var isoDay = wibParts.isoDay;

    if (jenisAbsen === 'Masuk') {
      return totalMinutes < 7 * 60 + 31 ? 'Tepat Waktu' : 'Telat';
    }

    if (isoDay >= 1 && isoDay <= 4) {
      return totalMinutes < 16 * 60 ? 'Pulang Lebih Awal' : 'Pulang Tepat Waktu';
    }
    if (isoDay === 5) {
      return totalMinutes < 16 * 60 + 30 ? 'Pulang Lebih Awal' : 'Pulang Tepat Waktu';
    }
    return 'Pulang (Akhir Pekan)';
  }

  /**
   * Analisis multi-sampel GPS untuk mendeteksi anomali / indikasi Fake GPS di browser.
   * Catatan: Browser web tidak punya akses ke flag OS isFromMockProvider,
   * sehingga analisis ini memeriksa akurasi, selisih timestamp, koordinat statis identik, dan lompatan teleportasi.
   */
  function analyzeGpsSamples(samples, serverNowMs, maxAccuracyMeters) {
    var maxAcc = typeof maxAccuracyMeters === 'number' ? maxAccuracyMeters : 50;
    var suspectFlags = [];
    var blockReason = '';

    if (!Array.isArray(samples) || samples.length === 0) {
      return {
        valid: false,
        blockReason: 'Belum ada sampel GPS.',
        suspectFlags: [],
        latest: null
      };
    }

    var latest = samples[samples.length - 1];
    if (
      typeof latest.lat !== 'number' ||
      typeof latest.lng !== 'number' ||
      typeof latest.accuracy !== 'number' ||
      !isFinite(latest.lat) ||
      !isFinite(latest.lng) ||
      !isFinite(latest.accuracy)
    ) {
      return {
        valid: false,
        blockReason: 'Koordinat atau akurasi GPS tidak terbaca.',
        suspectFlags: ['Invalid-Coords'],
        latest: latest
      };
    }

    if (latest.accuracy <= 0) {
      blockReason = 'Nilai akurasi GPS tidak valid (<= 0 m).';
      suspectFlags.push('Zero-Accuracy');
    } else if (latest.accuracy > maxAcc) {
      blockReason =
        'Akurasi GPS terlalu rendah (' +
        Math.round(latest.accuracy) +
        ' m, maksimal ' +
        maxAcc +
        ' m).';
    }

    if (typeof serverNowMs === 'number' && latest.timestamp > 0) {
      var driftSec = Math.abs(serverNowMs - latest.timestamp) / 1000;
      if (driftSec > 180) {
        suspectFlags.push('Timestamp-Drift-' + Math.round(driftSec) + 's');
        if (!blockReason) {
          blockReason =
            'Indikasi GPS tidak biasa terdeteksi (selisih waktu GPS vs server ' +
            Math.round(driftSec) +
            ' detik). Pastikan tidak memakai Fake GPS lalu segarkan lokasi.';
        }
      }
    }

    if (samples.length >= 2) {
      var identicalCount = 0;
      var suspiciousTeleport = false;

      for (var i = 1; i < samples.length; i++) {
        var prev = samples[i - 1];
        var curr = samples[i];
        if (prev.lat === curr.lat && prev.lng === curr.lng && prev.accuracy === curr.accuracy) {
          identicalCount++;
        }
        var dtSec = Math.max(0.2, (curr.receivedAtPerf - prev.receivedAtPerf) / 1000);
        var dist = haversineMeters(prev.lat, prev.lng, curr.lat, curr.lng);
        var speedMps = dist / dtSec;
        if (dist > 30 && speedMps > 50) {
          suspiciousTeleport = true;
        }
      }

      if (suspiciousTeleport) {
        blockReason = 'Terdeteksi lompatan lokasi tidak wajar (indikasi spoofing/GPS tidak stabil).';
        suspectFlags.push('Teleportation');
      }

      if (samples.length >= 3 && identicalCount === samples.length - 1 && Number.isInteger(latest.accuracy)) {
        suspectFlags.push('Static-Coords-Round-Accuracy');
        if (!blockReason) {
          blockReason =
            'Indikasi GPS tidak biasa terdeteksi (koordinat statis identik). Pastikan tidak memakai Fake GPS lalu tekan Segarkan Lokasi GPS.';
        }
      }
    }

    return {
      valid: !blockReason && suspectFlags.length === 0,
      blockReason: blockReason,
      suspectFlags: suspectFlags,
      latest: latest
    };
  }

  function countChars(text) {
    return String(text == null ? '' : text).replace(/\s+/g, '').length;
  }

  return {
    haversineMeters: haversineMeters,
    getWibDateParts: getWibDateParts,
    evaluateAttendanceTime: evaluateAttendanceTime,
    analyzeGpsSamples: analyzeGpsSamples,
    countChars: countChars
  };
});
