(function () {
  'use strict';

  var CFG = window.ABSEN_CONFIG;
  var LOGIC = window.AbsenLogic;
  var SHARED = window.AbsenShared;

  var clock = SHARED.createClockSync();

  var state = {
    apiUrl: SHARED.getApiUrl(),
    demoMode: false,
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
      var data = await SHARED.apiGet(state.apiUrl, { action: 'init' });
      if (!data.ok) throw new Error(data.error || 'Gagal memuat data awal.');

      state.demoMode = false;
      clock.syncFromServer(data.serverTimestampMs);
      if (data.geofence) state.geofence = data.geofence;
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
    state.participants = demo.participants.filter(function (p) {
      return p.aktif !== false;
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
    if (currentVal) el.participantSelect.value = currentVal;
    onParticipantChange();
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

    el.participantInfoBox.innerHTML =
      '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">' +
      SHARED.categoryBadgeHtml(p.kategori) +
      '<strong>' + SHARED.escapeHtml(p.posisi || '-') + '</strong>' +
      '</div>' +
      '<div>Masuk hari ini: <strong>' + SHARED.escapeHtml(masukInfo) + '</strong></div>' +
      '<div>Pulang hari ini: <strong>' + SHARED.escapeHtml(pulangInfo) + '</strong></div>';
    el.participantInfoBox.classList.remove('hidden');

    if (sum.masuk && !sum.pulang) {
      setSelectedJenis('Pulang');
    } else if (!sum.masuk) {
      setSelectedJenis('Masuk');
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

  function updateSubmitButton() {
    var hasParticipant = Boolean(el.participantSelect.value);
    var isPulang = getSelectedJenis() === 'Pulang';
    var hasKegiatan = !isPulang || el.kegiatanInput.value.trim().length >= 3;
    var hasEnoughSamples = state.gpsSamples.length >= CFG.REQUIRED_GPS_SAMPLES;
    var gpsValid = Boolean(state.gpsAnalysis && state.gpsAnalysis.valid);
    var insideRadius =
      typeof state.currentDistance === 'number' &&
      state.currentDistance <= state.geofence.maxDistanceMeters;

    el.submitAbsenBtn.disabled = !(
      hasParticipant &&
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
      return { ok: false, error: 'Di luar batas 15 meter.' };
    }
    var demo = SHARED.loadDemoData();
    var participant = demo.participants.find(function (p) { return p.id === payload.participantId; });
    if (!participant) return { ok: false, error: 'Peserta tidak ditemukan.' };

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

  initApp();
  startGpsWatch();
})();
