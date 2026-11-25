(function () {
  'use strict';

  var CFG = window.ABSEN_CONFIG;
  var LOGIC = window.AbsenLogic;
  var SHARED = window.AbsenShared;

  var clock = SHARED.createClockSync();
  var STORAGE_INSTALL_DISMISSED = 'absen1507_install_dismissed';
  var urlParams = new URLSearchParams(window.location.search);
  var requestedJenisParam = urlParams.get('jenis');
  var hasShortcutJenis = requestedJenisParam === 'Masuk' || requestedJenisParam === 'Pulang';

  var state = {
    apiUrl: SHARED.getApiUrl(),
    deviceId: SHARED.getOrCreateDeviceId(),
    demoMode: false,
    deferredInstallPrompt: null,
    geofence: {
      lat: CFG.TARGET_LAT,
      lng: CFG.TARGET_LNG,
      maxDistanceMeters: CFG.MAX_DISTANCE_METERS
    },
    participants: [],
    todaySummary: {},
    gpsSamples: [],
    gpsWatchId: null,
    gpsAnalysis: null,
    currentDistance: null
  };

  var el = {
    serverClock: document.getElementById('serverClock'),
    serverDate: document.getElementById('serverDate'),
    clockSource: document.getElementById('clockSource'),
    connectionBanner: document.getElementById('connectionBanner'),
    installBar: document.getElementById('installBar'),
    installDesc: document.getElementById('installDesc'),
    installAppBtn: document.getElementById('installAppBtn'),
    dismissInstallBtn: document.getElementById('dismissInstallBtn'),
    installGuideBox: document.getElementById('installGuideBox'),
    distanceDisplay: document.getElementById('distanceDisplay'),
    distanceBar: document.getElementById('distanceBar'),
    gpsStatusBadge: document.getElementById('gpsStatusBadge'),
    targetCoordText: document.getElementById('targetCoordText'),
    userCoordText: document.getElementById('userCoordText'),
    gpsAccuracyText: document.getElementById('gpsAccuracyText'),
    gpsSamplesText: document.getElementById('gpsSamplesText'),
    gpsWarningBox: document.getElementById('gpsWarningBox'),
    refreshGpsBtn: document.getElementById('refreshGpsBtn'),
    participantSelect: document.getElementById('participantSelect'),
    participantInfoBox: document.getElementById('participantInfoBox'),
    absenForm: document.getElementById('absenForm'),
    cardMasuk: document.getElementById('cardMasuk'),
    cardPulang: document.getElementById('cardPulang'),
    estimatedStatusText: document.getElementById('estimatedStatusText'),
    kegiatanField: document.getElementById('kegiatanField'),
    kegiatanInput: document.getElementById('kegiatanInput'),
    kegiatanCharCount: document.getElementById('kegiatanCharCount'),
    submitAbsenBtn: document.getElementById('submitAbsenBtn'),
    submitResultBox: document.getElementById('submitResultBox')
  };

  async function initApp() {
    state.apiUrl = SHARED.getApiUrl();
    if (!state.apiUrl) {
      activateDemoMode('Mode Preview Lokal aktif (URL Google Apps Script belum dipasang di config.js).');
      return;
    }

    try {
      var data = await SHARED.apiGet(state.apiUrl, { action: 'init', deviceId: state.deviceId });
      if (!data.ok) throw new Error(data.error || 'Gagal memuat data awal.');

      state.demoMode = false;
      clock.syncFromServer(data.serverTimestampMs);
      if (data.geofence) {
        if (
          typeof data.geofence.lat === 'number' &&
          typeof data.geofence.lng === 'number' &&
          isFinite(data.geofence.lat) &&
          isFinite(data.geofence.lng) &&
          Math.abs(data.geofence.lat) <= 90 &&
          Math.abs(data.geofence.lng) <= 180
        ) {
          state.geofence.lat = data.geofence.lat;
          state.geofence.lng = data.geofence.lng;
        }
        if (
          typeof data.geofence.maxDistanceMeters === 'number' &&
          isFinite(data.geofence.maxDistanceMeters) &&
          data.geofence.maxDistanceMeters > 0
        ) {
          state.geofence.maxDistanceMeters = Math.max(
            CFG.MAX_DISTANCE_METERS,
            data.geofence.maxDistanceMeters
          );
        }
      }
      state.participants = data.participants || [];
      state.todaySummary = data.todaySummary || {};

      el.targetCoordText.textContent =
        state.geofence.lat.toFixed(6) + ', ' + state.geofence.lng.toFixed(6);
      el.connectionBanner.classList.add('hidden');
      populateParticipantsDropdown();
      updateClock();
      updateEstimatedStatus();
    } catch (err) {
      activateDemoMode(
        'Gagal terhubung ke Apps Script (' + err.message + '). Beralih ke Mode Preview Lokal.'
      );
    }
  }

  function activateDemoMode(reasonText) {
    state.demoMode = true;
    clock.markLocal();
    var demo = SHARED.loadDemoData();
    state.participants = demo.participants
      .filter(function (p) { return p.aktif !== false; })
      .map(function (p) {
        return {
          id: p.id,
          nama: p.nama,
          kategori: p.kategori,
          posisi: p.posisi,
          aktif: p.aktif,
          hasDevice: Boolean(p.deviceId),
          boundToThisDevice: Boolean(p.deviceId && p.deviceId === state.deviceId)
        };
      });
    var todayStr = clock.getWibParts().dateStr;
    var summary = {};
    demo.records
      .filter(function (r) { return r.tanggal === todayStr; })
      .forEach(function (r) {
        if (!summary[r.idPeserta]) summary[r.idPeserta] = { masuk: null, pulang: null };
        if (r.jenisAbsen === 'Masuk') summary[r.idPeserta].masuk = r;
        if (r.jenisAbsen === 'Pulang') summary[r.idPeserta].pulang = r;
      });
    state.todaySummary = summary;
    SHARED.setBanner(el.connectionBanner, 'warn', reasonText);
    populateParticipantsDropdown();
    updateClock();
    updateEstimatedStatus();
  }

  function populateParticipantsDropdown() {
    var currentVal = el.participantSelect.value;
    el.participantSelect.innerHTML = '<option value="">-- Pilih Nama Peserta --</option>';

    var hubGroup = document.createElement('optgroup');
    hubGroup.label = 'Peserta MagangHub';
    var smkGroup = document.createElement('optgroup');
    smkGroup.label = 'Peserta Magang SMK';

    state.participants.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.posisi && p.posisi !== p.kategori ? p.nama + ' (' + p.posisi + ')' : p.nama;
      if (p.kategori === 'MagangHub') {
        hubGroup.appendChild(opt);
      } else {
        smkGroup.appendChild(opt);
      }
    });

    if (hubGroup.children.length > 0) el.participantSelect.appendChild(hubGroup);
    if (smkGroup.children.length > 0) el.participantSelect.appendChild(smkGroup);
    if (currentVal) {
      el.participantSelect.value = currentVal;
    } else {
      var bound = state.participants.find(function (p) { return p.boundToThisDevice; });
      if (bound) el.participantSelect.value = bound.id;
    }
    onParticipantChange();
  }

  function getDeviceBindingIssue(p) {
    if (!p) return '';
    var boundToThis = state.participants.find(function (item) { return item.boundToThisDevice; });
    if (boundToThis && boundToThis.id !== p.id) {
      return 'HP ini sudah terdaftar untuk ' + boundToThis.nama + '. Satu HP hanya untuk satu nama.';
    }
    if (p.hasDevice && !p.boundToThisDevice) {
      return p.nama + ' sudah terkunci di perangkat lain. Hubungi Admin untuk Reset Perangkat.';
    }
    return '';
  }

  function onParticipantChange() {
    var id = el.participantSelect.value;
    var p = state.participants.find(function (item) { return item.id === id; });
    if (!p) {
      el.participantInfoBox.classList.add('hidden');
      updateSubmitButton();
      return;
    }

    var sum = state.todaySummary[p.id] || { masuk: null, pulang: null };
    var masukInfo = sum.masuk
      ? sum.masuk.waktuWib + ' (' + sum.masuk.statusKetepatan + ')'
      : 'Belum absen masuk';
    var pulangInfo = sum.pulang
      ? sum.pulang.waktuWib + ' (' + sum.pulang.statusKetepatan + ')'
      : 'Belum absen pulang';

    var deviceIssue = getDeviceBindingIssue(p);
    var deviceLine = p.boundToThisDevice
      ? '<span class="badge badge-ok">Perangkat: Terdaftar di HP ini</span>'
      : deviceIssue
        ? '<span class="badge badge-danger">' + SHARED.escapeHtml(deviceIssue) + '</span>'
        : '<span class="badge badge-neutral">Perangkat: Belum terikat (akan dikunci ke HP ini saat absen)</span>';

    el.participantInfoBox.innerHTML =
      '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">' +
      SHARED.categoryBadgeHtml(p.kategori) +
      '<strong>' + SHARED.escapeHtml(p.posisi || '-') + '</strong>' +
      '</div>' +
      '<div>Masuk hari ini: <strong>' + SHARED.escapeHtml(masukInfo) + '</strong></div>' +
      '<div>Pulang hari ini: <strong>' + SHARED.escapeHtml(pulangInfo) + '</strong></div>' +
      '<div style="margin-top:6px;">' + deviceLine + '</div>';
    el.participantInfoBox.classList.remove('hidden');

    if (!hasShortcutJenis) {
      if (sum.masuk && !sum.pulang) {
        setSelectedJenis('Pulang');
      } else if (!sum.masuk) {
        setSelectedJenis('Masuk');
      }
    }
    updateSubmitButton();
  }

  function setSelectedJenis(jenis) {
    document.querySelectorAll('input[name="jenisAbsen"]').forEach(function (r) {
      r.checked = r.value === jenis;
    });
    el.cardMasuk.classList.toggle('selected', jenis === 'Masuk');
    el.cardPulang.classList.toggle('selected', jenis === 'Pulang');
    var isPulang = jenis === 'Pulang';
    el.kegiatanField.classList.toggle('hidden', !isPulang);
    el.kegiatanInput.required = isPulang;
    updateEstimatedStatus();
    updateSubmitButton();
  }

  function getSelectedJenis() {
    var checked = document.querySelector('input[name="jenisAbsen"]:checked');
    return checked ? checked.value : 'Masuk';
  }

  function updateClock() {
    var parts = clock.getWibParts();
    el.serverClock.textContent = parts.timeStr + ' WIB';
    el.serverDate.textContent = parts.hariNama + ', ' + parts.dateStr;
    el.clockSource.textContent = clock.isSynced()
      ? 'Sumber: Waktu Server Google'
      : 'Sumber: Mode Preview Lokal';
  }

  function updateEstimatedStatus() {
    var parts = clock.getWibParts();
    var jenis = getSelectedJenis();
    var est = LOGIC.evaluateAttendanceTime(parts, jenis);
    el.estimatedStatusText.innerHTML =
      'Estimasi status (' + SHARED.escapeHtml(jenis) + ' sekarang): ' + SHARED.statusBadgeHtml(est);
  }

  function startGpsWatch() {
    if (!('geolocation' in navigator)) {
      el.gpsStatusBadge.innerHTML =
        '<span class="badge badge-danger">Browser tidak mendukung GPS</span>';
      return;
    }

    if (state.gpsWatchId !== null) {
      navigator.geolocation.clearWatch(state.gpsWatchId);
    }

    state.gpsSamples = [];
    state.gpsAnalysis = null;
    state.currentDistance = null;
    el.gpsWarningBox.classList.add('hidden');
    el.gpsSamplesText.textContent = '0 / ' + CFG.REQUIRED_GPS_SAMPLES + ' sampel';
    el.gpsStatusBadge.innerHTML = '<span class="badge badge-neutral">Mengambil posisi GPS...</span>';
    updateSubmitButton();

    state.gpsWatchId = navigator.geolocation.watchPosition(
      function (pos) {
        var c = pos.coords;
        var sample = {
          lat: c.latitude,
          lng: c.longitude,
          accuracy: c.accuracy,
          timestamp: pos.timestamp,
          receivedAtPerf: performance.now()
        };
        state.gpsSamples.push(sample);
        if (state.gpsSamples.length > 5) state.gpsSamples.shift();

        var dist = LOGIC.haversineMeters(
          sample.lat,
          sample.lng,
          state.geofence.lat,
          state.geofence.lng
        );
        state.currentDistance = dist;

        var analysis = LOGIC.analyzeGpsSamples(
          state.gpsSamples,
          clock.nowMs(),
          CFG.MAX_GPS_ACCURACY_METERS
        );
        state.gpsAnalysis = analysis;

        renderGpsState(sample, dist, analysis);
        updateSubmitButton();
      },
      function (err) {
        var msg = 'Gagal membaca lokasi GPS.';
        if (err.code === 1) msg = 'Izin lokasi ditolak. Mohon izinkan akses lokasi di browser.';
        if (err.code === 2) msg = 'Sinyal GPS tidak tersedia. Aktifkan GPS HP dan coba di area terbuka.';
        if (err.code === 3) msg = 'Waktu pembacaan GPS habis. Tekan Segarkan Lokasi GPS.';
        el.gpsStatusBadge.innerHTML = '<span class="badge badge-danger">' + SHARED.escapeHtml(msg) + '</span>';
        SHARED.setBanner(el.gpsWarningBox, 'danger', msg);
        updateSubmitButton();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000
      }
    );
  }

  function renderGpsState(sample, dist, analysis) {
    el.distanceDisplay.textContent = dist.toFixed(2) + ' m';
    el.userCoordText.textContent = sample.lat.toFixed(6) + ', ' + sample.lng.toFixed(6);
    el.gpsAccuracyText.textContent = '± ' + sample.accuracy.toFixed(1) + ' m';

    var count = Math.min(state.gpsSamples.length, CFG.REQUIRED_GPS_SAMPLES);
    el.gpsSamplesText.textContent = count + ' / ' + CFG.REQUIRED_GPS_SAMPLES + ' sampel';

    var ratio = Math.min(100, (dist / state.geofence.maxDistanceMeters) * 100);
    el.distanceBar.style.width = ratio + '%';

    var insideRadius = dist <= state.geofence.maxDistanceMeters;
    el.distanceBar.style.backgroundColor = insideRadius ? '#16a34a' : '#dc2626';

    if (!analysis.valid) {
      el.gpsStatusBadge.innerHTML = '<span class="badge badge-danger">GPS Ditolak</span>';
      SHARED.setBanner(el.gpsWarningBox, 'danger', analysis.blockReason);
      return;
    }

    if (state.gpsSamples.length < CFG.REQUIRED_GPS_SAMPLES) {
      el.gpsStatusBadge.innerHTML =
        '<span class="badge badge-warn">Memverifikasi stabilitas GPS (' +
        state.gpsSamples.length +
        '/' +
        CFG.REQUIRED_GPS_SAMPLES +
        ')...</span>';
      el.gpsWarningBox.classList.add('hidden');
      return;
    }

    if (!insideRadius) {
      el.gpsStatusBadge.innerHTML =
        '<span class="badge badge-danger">Di luar radius ' +
        state.geofence.maxDistanceMeters +
        ' m</span>';
      SHARED.setBanner(
        el.gpsWarningBox,
        'danger',
        'Jarak Anda ' +
          dist.toFixed(2) +
          ' m dari titik kantor. Harus <= ' +
          state.geofence.maxDistanceMeters +
          ' m untuk mengirim absensi.'
      );
      return;
    }

    if (analysis.suspectFlags.length > 0) {
      el.gpsStatusBadge.innerHTML =
        '<span class="badge badge-warn">Dalam radius (Ada catatan anomali GPS)</span>';
      SHARED.setBanner(
        el.gpsWarningBox,
        'warn',
        'Indikasi GPS tidak biasa terdeteksi (' +
          analysis.suspectFlags.join(', ') +
          ') dan akan dicatat untuk tinjauan admin.'
      );
    } else {
      el.gpsStatusBadge.innerHTML =
        '<span class="badge badge-ok">Lokasi Valid (Dalam Radius <= ' +
        state.geofence.maxDistanceMeters +
        ' m)</span>';
      el.gpsWarningBox.classList.add('hidden');
    }
  }

  function updateKegiatanCharCount() {
    var minChars = CFG.MIN_KEGIATAN_CHARS || 100;
    var count = LOGIC.countChars(el.kegiatanInput.value);
    if (!el.kegiatanCharCount) return count;
    if (count >= minChars) {
      el.kegiatanCharCount.textContent = count + ' / ' + minChars + ' huruf (memenuhi syarat)';
      el.kegiatanCharCount.classList.add('ok');
    } else {
      el.kegiatanCharCount.textContent =
        count + ' / ' + minChars + ' huruf (kurang ' + (minChars - count) + ' huruf)';
      el.kegiatanCharCount.classList.remove('ok');
    }
    return count;
  }

  function updateSubmitButton() {
    var selectedParticipant = state.participants.find(function (item) {
      return item.id === el.participantSelect.value;
    });
    var hasParticipant = Boolean(selectedParticipant);
    var deviceBlocked = Boolean(selectedParticipant && getDeviceBindingIssue(selectedParticipant));
    var isPulang = getSelectedJenis() === 'Pulang';
    var minChars = CFG.MIN_KEGIATAN_CHARS || 100;
    var charCount = updateKegiatanCharCount();
    var hasKegiatan = !isPulang || charCount >= minChars;
    var hasEnoughSamples = state.gpsSamples.length >= CFG.REQUIRED_GPS_SAMPLES;
    var gpsValid = Boolean(state.gpsAnalysis && state.gpsAnalysis.valid);
    var insideRadius =
      typeof state.currentDistance === 'number' &&
      state.currentDistance <= state.geofence.maxDistanceMeters;

    el.submitAbsenBtn.disabled = !(
      hasParticipant &&
      !deviceBlocked &&
      hasKegiatan &&
      hasEnoughSamples &&
      gpsValid &&
      insideRadius
    );
  }

  async function handleAbsenSubmit(e) {
    e.preventDefault();
    if (el.submitAbsenBtn.disabled) return;

    var latest = state.gpsAnalysis.latest;
    var jenis = getSelectedJenis();
    var kegiatanVal = jenis === 'Pulang' ? el.kegiatanInput.value.trim() : 'Hadir (Absen Masuk)';
    var payload = {
      action: 'submitAttendance',
      participantId: el.participantSelect.value,
      deviceId: state.deviceId,
      jenisAbsen: jenis,
      kegiatan: kegiatanVal,
      lat: latest.lat,
      lng: latest.lng,
      accuracy: latest.accuracy,
      gpsTimestampMs: latest.timestamp,
      suspectFlags: state.gpsAnalysis.suspectFlags,
      blockReason: state.gpsAnalysis.blockReason,
      userAgent: navigator.userAgent
    };

    el.submitAbsenBtn.disabled = true;
    el.submitAbsenBtn.textContent = 'Mengirim absensi...';

    try {
      var res = state.demoMode
        ? submitDemoAttendance(payload)
        : await SHARED.apiPost(state.apiUrl, payload);

      if (!res.ok) {
        SHARED.setBanner(el.submitResultBox, 'danger', res.error || 'Gagal mengirim absensi.');
      } else {
        var r = res.record;
        if (!state.todaySummary[r.idPeserta]) {
          state.todaySummary[r.idPeserta] = { masuk: null, pulang: null };
        }
        if (r.jenisAbsen === 'Masuk') state.todaySummary[r.idPeserta].masuk = r;
        if (r.jenisAbsen === 'Pulang') state.todaySummary[r.idPeserta].pulang = r;

        state.participants = state.participants.map(function (p) {
          if (p.id === r.idPeserta) {
            p.hasDevice = true;
            p.boundToThisDevice = true;
          }
          return p;
        });

        SHARED.setBanner(
          el.submitResultBox,
          'ok',
          'Berhasil! ' +
            r.nama +
            ' (' +
            r.jenisAbsen +
            ') tercatat pukul ' +
            r.waktuWib +
            ' WIB — Status: ' +
            r.statusKetepatan +
            ' | Jarak: ' +
            r.jarakMeter +
            ' m.'
        );
        el.kegiatanInput.value = '';
        onParticipantChange();
      }
    } catch (err) {
      SHARED.setBanner(el.submitResultBox, 'danger', 'Error jaringan: ' + err.message);
    } finally {
      el.submitAbsenBtn.textContent = 'Kirim Absensi';
      updateSubmitButton();
    }
  }

  function submitDemoAttendance(payload) {
    var parts = clock.getWibParts();
    var dist = LOGIC.haversineMeters(
      payload.lat,
      payload.lng,
      state.geofence.lat,
      state.geofence.lng
    );
    if (dist > state.geofence.maxDistanceMeters) {
      return { ok: false, error: 'Di luar batas ' + state.geofence.maxDistanceMeters + ' meter.' };
    }
    var minChars = CFG.MIN_KEGIATAN_CHARS || 100;
    if (payload.jenisAbsen === 'Pulang' && LOGIC.countChars(payload.kegiatan) < minChars) {
      return { ok: false, error: 'Isian kegiatan hari ini minimal ' + minChars + ' huruf.' };
    }
    var demo = SHARED.loadDemoData();
    var participant = demo.participants.find(function (p) { return p.id === payload.participantId; });
    if (!participant) return { ok: false, error: 'Peserta tidak ditemukan.' };

    var otherBound = demo.participants.find(function (p) {
      return p.id !== participant.id && p.deviceId && p.deviceId === payload.deviceId;
    });
    if (otherBound) {
      return {
        ok: false,
        error: 'Perangkat ini sudah terdaftar untuk ' + otherBound.nama + '. Satu HP hanya untuk satu peserta.'
      };
    }
    if (participant.deviceId && participant.deviceId !== payload.deviceId) {
      return {
        ok: false,
        error: participant.nama + ' sudah terkunci pada perangkat lain. Hubungi Admin untuk Reset Perangkat.'
      };
    }
    if (!participant.deviceId) {
      participant.deviceId = payload.deviceId;
      SHARED.saveDemoParticipants(demo.participants);
    }

    var todayRows = demo.records.filter(function (r) {
      return r.tanggal === parts.dateStr && r.idPeserta === participant.id;
    });
    if (payload.jenisAbsen === 'Masuk' && todayRows.some(function (r) { return r.jenisAbsen === 'Masuk'; })) {
      return { ok: false, error: participant.nama + ' sudah Absen Masuk hari ini.' };
    }
    if (payload.jenisAbsen === 'Pulang' && !todayRows.some(function (r) { return r.jenisAbsen === 'Masuk'; })) {
      return { ok: false, error: participant.nama + ' belum Absen Masuk hari ini.' };
    }
    if (payload.jenisAbsen === 'Pulang' && todayRows.some(function (r) { return r.jenisAbsen === 'Pulang'; })) {
      return { ok: false, error: participant.nama + ' sudah Absen Pulang hari ini.' };
    }

    var statusKetepatan = LOGIC.evaluateAttendanceTime(parts, payload.jenisAbsen);
    var record = {
      idAbsen: 'DEMO-' + Date.now(),
      tanggal: parts.dateStr,
      hari: parts.hariNama,
      idPeserta: participant.id,
      nama: participant.nama,
      kategori: participant.kategori,
      posisi: participant.posisi,
      jenisAbsen: payload.jenisAbsen,
      waktuWib: parts.timeStr,
      statusKetepatan: statusKetepatan,
      kegiatan: payload.kegiatan,
      latitude: payload.lat,
      longitude: payload.lng,
      jarakMeter: Number(dist.toFixed(2)),
      akurasiMeter: Number(payload.accuracy.toFixed(1)),
      statusGps: payload.suspectFlags.length > 0 ? 'Perlu Cek' : 'Valid',
      catatanAnomali: payload.suspectFlags.join('; '),
      perangkat: payload.userAgent.slice(0, 120)
    };
    demo.records.push(record);
    SHARED.saveDemoRecords(demo.records);
    return { ok: true, record: record };
  }

  function setupPwaInstallAndShortcuts() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    }

    if (hasShortcutJenis) {
      setSelectedJenis(requestedJenisParam);
    }

    var isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    var dismissed = localStorage.getItem(STORAGE_INSTALL_DISMISSED) === '1';
    if (isStandalone || dismissed) return;

    var ua = navigator.userAgent || '';
    var isIos = /iPhone|iPad|iPod/i.test(ua);
    var isAndroid = /Android/i.test(ua);

    if (isIos) {
      el.installDesc.textContent =
        'Di iPhone/iPad (Safari), tambahkan web ini sebagai pintasan aplikasi di Layar Utama.';
      el.installAppBtn.textContent = 'Cara Buat Pintasan iOS';
      el.installBar.classList.remove('hidden');
    } else if (isAndroid) {
      el.installDesc.textContent =
        'Pasang ke layar utama Android untuk akses cepat dan pintasan Absen Masuk/Pulang.';
      el.installBar.classList.remove('hidden');
    }

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      state.deferredInstallPrompt = e;
      el.installAppBtn.textContent = 'Pasang Aplikasi';
      el.installGuideBox.classList.add('hidden');
      el.installBar.classList.remove('hidden');
    });

    window.addEventListener('appinstalled', function () {
      state.deferredInstallPrompt = null;
      el.installBar.classList.add('hidden');
    });

    el.installAppBtn.addEventListener('click', async function () {
      if (state.deferredInstallPrompt) {
        state.deferredInstallPrompt.prompt();
        var choice = await state.deferredInstallPrompt.userChoice;
        state.deferredInstallPrompt = null;
        if (choice && choice.outcome === 'accepted') {
          el.installBar.classList.add('hidden');
        }
        return;
      }

      if (isIos) {
        el.installGuideBox.innerHTML =
          '<strong>Langkah di Safari iPhone/iPad:</strong>' +
          '<ol>' +
          '<li>Buka situs ini di <strong>Safari</strong>.</li>' +
          '<li>Ketuk ikon <strong>Bagikan (Share ⬆︎)</strong> di bilah bawah/atas.</li>' +
          '<li>Pilih <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong> → ketuk <strong>Tambah</strong>.</li>' +
          '</ol>';
      } else {
        el.installGuideBox.innerHTML =
          '<strong>Langkah di Android (Chrome / Edge):</strong>' +
          '<ol>' +
          '<li>Ketuk menu <strong>⋮</strong> di pojok kanan atas browser.</li>' +
          '<li>Pilih <strong>Tambahkan ke layar utama</strong> atau <strong>Instal aplikasi</strong>.</li>' +
          '<li>Setelah terpasang, tekan lama ikon aplikasi untuk pintasan cepat <strong>Absen Masuk</strong> atau <strong>Absen Pulang</strong>.</li>' +
          '</ol>';
      }
      el.installGuideBox.classList.toggle('hidden');
    });

    el.dismissInstallBtn.addEventListener('click', function () {
      localStorage.setItem(STORAGE_INSTALL_DISMISSED, '1');
      el.installBar.classList.add('hidden');
    });
  }

  document.querySelectorAll('input[name="jenisAbsen"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      setSelectedJenis(radio.value);
    });
  });

  el.participantSelect.addEventListener('change', onParticipantChange);
  el.kegiatanInput.addEventListener('input', updateSubmitButton);
  el.refreshGpsBtn.addEventListener('click', startGpsWatch);
  el.absenForm.addEventListener('submit', handleAbsenSubmit);

  setInterval(function () {
    updateClock();
    updateEstimatedStatus();
  }, 1000);

  setupPwaInstallAndShortcuts();
  initApp();
  startGpsWatch();
})();
