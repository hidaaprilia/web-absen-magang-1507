(function () {
  'use strict';

  var CFG = window.ABSEN_CONFIG;
  var LOGIC = window.AbsenLogic;

  var STORAGE_API_URL = 'absen1507_api_url';
  var STORAGE_DEMO_PARTICIPANTS = 'absen1507_demo_participants';
  var STORAGE_DEMO_RECORDS = 'absen1507_demo_records';
  var DEMO_PIN = '15072026';

  var state = {
    apiUrl: localStorage.getItem(STORAGE_API_URL) || CFG.API_URL || '',
    demoMode: false,
    serverOffsetAnchorMs: Date.now(),
    serverOffsetPerfMs: performance.now(),
    timeSyncedFromServer: false,
    geofence: {
      lat: CFG.TARGET_LAT,
      lng: CFG.TARGET_LNG,
      maxDistanceMeters: CFG.MAX_DISTANCE_METERS
    },
    participants: [],
    todaySummary: {},
    adminPin: '',
    adminParticipants: [],
    adminRecords: [],
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
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabAbsen: document.getElementById('tabAbsen'),
    tabAdmin: document.getElementById('tabAdmin'),
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
    kegiatanInput: document.getElementById('kegiatanInput'),
    submitAbsenBtn: document.getElementById('submitAbsenBtn'),
    submitResultBox: document.getElementById('submitResultBox'),
    adminLoginCard: document.getElementById('adminLoginCard'),
    adminLoginForm: document.getElementById('adminLoginForm'),
    adminPinInput: document.getElementById('adminPinInput'),
    adminLoginError: document.getElementById('adminLoginError'),
    adminDashboard: document.getElementById('adminDashboard'),
    adminStatsGrid: document.getElementById('adminStatsGrid'),
    adminRefreshBtn: document.getElementById('adminRefreshBtn'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    adminLogoutBtn: document.getElementById('adminLogoutBtn'),
    filterDate: document.getElementById('filterDate'),
    filterCategory: document.getElementById('filterCategory'),
    filterSearch: document.getElementById('filterSearch'),
    adminSummaryBody: document.getElementById('adminSummaryBody'),
    adminLogBody: document.getElementById('adminLogBody'),
    addParticipantForm: document.getElementById('addParticipantForm'),
    newParticipantName: document.getElementById('newParticipantName'),
    newParticipantCategory: document.getElementById('newParticipantCategory'),
    newParticipantRole: document.getElementById('newParticipantRole'),
    addParticipantMsg: document.getElementById('addParticipantMsg'),
    participantsTableBody: document.getElementById('participantsTableBody'),
    apiUrlOverrideInput: document.getElementById('apiUrlOverrideInput'),
    saveApiUrlBtn: document.getElementById('saveApiUrlBtn')
  };

  function getServerNowMs() {
    return state.serverOffsetAnchorMs + (performance.now() - state.serverOffsetPerfMs);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function statusBadgeHtml(status) {
    if (!status) return '<span class="badge badge-neutral">Belum</span>';
    if (status === 'Tepat Waktu' || status === 'Pulang Tepat Waktu' || status === 'Valid') {
      return '<span class="badge badge-ok">' + escapeHtml(status) + '</span>';
    }
    if (status === 'Telat 1' || status === 'Perlu Cek') {
      return '<span class="badge badge-warn">' + escapeHtml(status) + '</span>';
    }
    if (status.indexOf('Telat 2') === 0 || status === 'Pulang Lebih Awal') {
      return '<span class="badge badge-danger">' + escapeHtml(status) + '</span>';
    }
    return '<span class="badge badge-neutral">' + escapeHtml(status) + '</span>';
  }

  function categoryBadgeHtml(kategori) {
    if (kategori === 'MagangHub') {
      return '<span class="badge badge-hub">MagangHub</span>';
    }
    return '<span class="badge badge-smk">Magang SMK</span>';
  }

  function setBanner(node, type, text) {
    node.className = 'banner ' + type;
    node.textContent = text;
    node.classList.remove('hidden');
  }

  async function apiGet(params) {
    var qs = new URLSearchParams(params).toString();
    var res = await fetch(state.apiUrl + '?' + qs, { method: 'GET', redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function apiPost(payload) {
    // Memakai text/plain agar terhindar dari CORS preflight OPTIONS pada Google Apps Script
    var res = await fetch(state.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function loadDemoData() {
    var pRaw = localStorage.getItem(STORAGE_DEMO_PARTICIPANTS);
    var rRaw = localStorage.getItem(STORAGE_DEMO_RECORDS);
    var participants = pRaw ? JSON.parse(pRaw) : CFG.DEFAULT_PARTICIPANTS.slice();
    if (!pRaw) localStorage.setItem(STORAGE_DEMO_PARTICIPANTS, JSON.stringify(participants));
    var records = rRaw ? JSON.parse(rRaw) : [];
    return { participants: participants, records: records };
  }

  function saveDemoParticipants(list) {
    localStorage.setItem(STORAGE_DEMO_PARTICIPANTS, JSON.stringify(list));
  }

  function saveDemoRecords(list) {
    localStorage.setItem(STORAGE_DEMO_RECORDS, JSON.stringify(list));
  }

  async function initApp() {
    el.apiUrlOverrideInput.value = state.apiUrl;
    if (!state.apiUrl) {
      activateDemoMode('Mode Preview Lokal aktif (URL Google Apps Script belum dipasang di config.js).');
      return;
    }

    try {
      var data = await apiGet({ action: 'init' });
      if (!data.ok) throw new Error(data.error || 'Gagal memuat data awal.');

      state.demoMode = false;
      state.serverOffsetAnchorMs = data.serverTimestampMs;
      state.serverOffsetPerfMs = performance.now();
      state.timeSyncedFromServer = true;
      if (data.geofence) state.geofence = data.geofence;
      state.participants = data.participants || [];
      state.todaySummary = data.todaySummary || {};

      el.targetCoordText.textContent =
        state.geofence.lat.toFixed(6) + ', ' + state.geofence.lng.toFixed(6);
      setBanner(
        el.connectionBanner,
        'ok',
        'Terhubung ke Google Spreadsheet (1507_Presensi Magang). Waktu memakai server WIB.'
      );
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
    state.timeSyncedFromServer = false;
    var demo = loadDemoData();
    state.participants = demo.participants.filter(function (p) {
      return p.aktif !== false;
    });
    var todayStr = LOGIC.getWibDateParts(getServerNowMs()).dateStr;
    var summary = {};
    demo.records
      .filter(function (r) { return r.tanggal === todayStr; })
      .forEach(function (r) {
        if (!summary[r.idPeserta]) summary[r.idPeserta] = { masuk: null, pulang: null };
        if (r.jenisAbsen === 'Masuk') summary[r.idPeserta].masuk = r;
        if (r.jenisAbsen === 'Pulang') summary[r.idPeserta].pulang = r;
      });
    state.todaySummary = summary;
    setBanner(el.connectionBanner, 'warn', reasonText);
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
      categoryBadgeHtml(p.kategori) +
      '<strong>' + escapeHtml(p.posisi || '-') + '</strong>' +
      '</div>' +
      '<div>Masuk hari ini: <strong>' + escapeHtml(masukInfo) + '</strong></div>' +
      '<div>Pulang hari ini: <strong>' + escapeHtml(pulangInfo) + '</strong></div>';
    el.participantInfoBox.classList.remove('hidden');

    // Otomatis sarankan Pulang jika sudah Masuk dan belum Pulang
    if (sum.masuk && !sum.pulang) {
      setSelectedJenis('Pulang');
    } else if (!sum.masuk) {
      setSelectedJenis('Masuk');
    }
    updateSubmitButton();
  }

  function setSelectedJenis(jenis) {
    var radios = document.querySelectorAll('input[name="jenisAbsen"]');
    radios.forEach(function (r) {
      r.checked = r.value === jenis;
    });
    el.cardMasuk.classList.toggle('selected', jenis === 'Masuk');
    el.cardPulang.classList.toggle('selected', jenis === 'Pulang');
    updateEstimatedStatus();
  }

  function getSelectedJenis() {
    var checked = document.querySelector('input[name="jenisAbsen"]:checked');
    return checked ? checked.value : 'Masuk';
  }

  function updateClock() {
    var parts = LOGIC.getWibDateParts(getServerNowMs());
    el.serverClock.textContent = parts.timeStr + ' WIB';
    el.serverDate.textContent = parts.hariNama + ', ' + parts.dateStr;
    el.clockSource.textContent = state.timeSyncedFromServer
      ? 'Sumber: Waktu Server Google'
      : 'Sumber: Mode Preview Lokal';
    if (!el.filterDate.value) {
      el.filterDate.value = parts.dateStr;
    }
  }

  function updateEstimatedStatus() {
    var parts = LOGIC.getWibDateParts(getServerNowMs());
    var jenis = getSelectedJenis();
    var est = LOGIC.evaluateAttendanceTime(parts, jenis);
    el.estimatedStatusText.innerHTML =
      'Estimasi status (' + escapeHtml(jenis) + ' sekarang): ' + statusBadgeHtml(est);
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
          getServerNowMs(),
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
        el.gpsStatusBadge.innerHTML = '<span class="badge badge-danger">' + escapeHtml(msg) + '</span>';
        setBanner(el.gpsWarningBox, 'danger', msg);
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
      setBanner(el.gpsWarningBox, 'danger', analysis.blockReason);
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
      setBanner(
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
      setBanner(
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
    var hasKegiatan = el.kegiatanInput.value.trim().length >= 3;
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
    var payload = {
      action: 'submitAttendance',
      participantId: el.participantSelect.value,
      jenisAbsen: getSelectedJenis(),
      kegiatan: el.kegiatanInput.value.trim(),
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
      var res;
      if (state.demoMode) {
        res = submitDemoAttendance(payload);
      } else {
        res = await apiPost(payload);
      }

      if (!res.ok) {
        setBanner(el.submitResultBox, 'danger', res.error || 'Gagal mengirim absensi.');
      } else {
        var r = res.record;
        if (!state.todaySummary[r.idPeserta]) {
          state.todaySummary[r.idPeserta] = { masuk: null, pulang: null };
        }
        if (r.jenisAbsen === 'Masuk') state.todaySummary[r.idPeserta].masuk = r;
        if (r.jenisAbsen === 'Pulang') state.todaySummary[r.idPeserta].pulang = r;

        setBanner(
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
      setBanner(el.submitResultBox, 'danger', 'Error jaringan: ' + err.message);
    } finally {
      el.submitAbsenBtn.textContent = 'Kirim Absensi';
      updateSubmitButton();
    }
  }

  function submitDemoAttendance(payload) {
    var nowMs = getServerNowMs();
    var parts = LOGIC.getWibDateParts(nowMs);
    var dist = LOGIC.haversineMeters(
      payload.lat,
      payload.lng,
      state.geofence.lat,
      state.geofence.lng
    );
    if (dist > state.geofence.maxDistanceMeters) {
      return { ok: false, error: 'Di luar batas 15 meter.' };
    }
    var demo = loadDemoData();
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
    saveDemoRecords(demo.records);
    return { ok: true, record: record };
  }

  async function handleAdminLogin(e) {
    e.preventDefault();
    var pin = el.adminPinInput.value.trim();
    el.adminLoginError.classList.add('hidden');

    try {
      if (state.demoMode) {
        if (pin !== DEMO_PIN) {
          setBanner(el.adminLoginError, 'danger', 'PIN salah (PIN preview default: 15072026).');
          return;
        }
      } else {
        var verify = await apiPost({ action: 'adminVerify', pin: pin });
        if (!verify.ok) {
          setBanner(el.adminLoginError, 'danger', verify.error || 'PIN admin salah.');
          return;
        }
      }

      state.adminPin = pin;
      el.adminLoginCard.classList.add('hidden');
      el.adminDashboard.classList.remove('hidden');
      await loadAdminData();
    } catch (err) {
      setBanner(el.adminLoginError, 'danger', 'Gagal verifikasi: ' + err.message);
    }
  }

  async function loadAdminData() {
    var dateVal = el.filterDate.value || '';
    if (state.demoMode) {
      var demo = loadDemoData();
      state.adminParticipants = demo.participants;
      state.adminRecords = dateVal
        ? demo.records.filter(function (r) { return r.tanggal === dateVal; })
        : demo.records;
      renderAdminDashboard();
      return;
    }

    var res = await apiGet({ action: 'adminData', pin: state.adminPin, date: dateVal });
    if (!res.ok) {
      alert(res.error || 'Gagal memuat data admin.');
      return;
    }
    state.adminParticipants = res.participants || [];
    state.adminRecords = res.records || [];
    renderAdminDashboard();
  }

  function renderAdminDashboard() {
    var catFilter = el.filterCategory.value;
    var search = el.filterSearch.value.trim().toLowerCase();

    var filteredParticipants = state.adminParticipants.filter(function (p) {
      if (catFilter !== 'ALL' && p.kategori !== catFilter) return false;
      if (search && p.nama.toLowerCase().indexOf(search) === -1) return false;
      return true;
    });

    var byParticipant = {};
    state.adminRecords.forEach(function (r) {
      if (!byParticipant[r.idPeserta]) byParticipant[r.idPeserta] = { masuk: null, pulang: null };
      if (r.jenisAbsen === 'Masuk') byParticipant[r.idPeserta].masuk = r;
      if (r.jenisAbsen === 'Pulang') byParticipant[r.idPeserta].pulang = r;
    });

    // Hitung statistik
    var totalAktif = state.adminParticipants.filter(function (p) { return p.aktif !== false; }).length;
    var hadirCount = 0;
    var tepatCount = 0;
    var telat1Count = 0;
    var telat2Count = 0;
    var pulangAwalCount = 0;
    var gpsCekCount = 0;

    state.adminRecords.forEach(function (r) {
      if (r.jenisAbsen === 'Masuk') {
        hadirCount++;
        if (r.statusKetepatan === 'Tepat Waktu') tepatCount++;
        if (r.statusKetepatan === 'Telat 1') telat1Count++;
        if (r.statusKetepatan.indexOf('Telat 2') === 0) telat2Count++;
      } else if (r.jenisAbsen === 'Pulang') {
        if (r.statusKetepatan === 'Pulang Lebih Awal') pulangAwalCount++;
      }
      if (r.statusGps === 'Perlu Cek') gpsCekCount++;
    });

    el.adminStatsGrid.innerHTML =
      statCardHtml('Peserta Aktif', totalAktif) +
      statCardHtml('Sudah Masuk', hadirCount) +
      statCardHtml('Tepat Waktu', tepatCount) +
      statCardHtml('Telat 1', telat1Count) +
      statCardHtml('Telat 2', telat2Count) +
      statCardHtml('Pulang Lebih Awal', pulangAwalCount) +
      statCardHtml('GPS Perlu Cek', gpsCekCount);

    // Render Rekap Harian
    el.adminSummaryBody.innerHTML = '';
    if (filteredParticipants.length === 0) {
      el.adminSummaryBody.innerHTML = '<tr><td colspan="8">Tidak ada peserta sesuai filter.</td></tr>';
    } else {
      filteredParticipants.forEach(function (p) {
        var pair = byParticipant[p.id] || { masuk: null, pulang: null };
        var masuk = pair.masuk;
        var pulang = pair.pulang;
        var kegiatanParts = [];
        if (masuk && masuk.kegiatan) kegiatanParts.push('Masuk: ' + masuk.kegiatan);
        if (pulang && pulang.kegiatan) kegiatanParts.push('Pulang: ' + pulang.kegiatan);
        var gpsNotes = [];
        if (masuk) gpsNotes.push('Masuk ' + masuk.jarakMeter + 'm (' + masuk.statusGps + ')');
        if (pulang) gpsNotes.push('Pulang ' + pulang.jarakMeter + 'm (' + pulang.statusGps + ')');

        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td><strong>' + escapeHtml(p.nama) + '</strong></td>' +
          '<td>' + categoryBadgeHtml(p.kategori) + '<br><small>' + escapeHtml(p.posisi || '-') + '</small></td>' +
          '<td>' + (masuk ? escapeHtml(masuk.waktuWib) : '-') + '</td>' +
          '<td>' + statusBadgeHtml(masuk ? masuk.statusKetepatan : '') + '</td>' +
          '<td>' + (pulang ? escapeHtml(pulang.waktuWib) : '-') + '</td>' +
          '<td>' + statusBadgeHtml(pulang ? pulang.statusKetepatan : '') + '</td>' +
          '<td>' + (kegiatanParts.length ? escapeHtml(kegiatanParts.join(' | ')) : '-') + '</td>' +
          '<td>' + (gpsNotes.length ? escapeHtml(gpsNotes.join(' / ')) : '-') + '</td>';
        el.adminSummaryBody.appendChild(tr);
      });
    }

    // Render Log Detail
    var filteredLogs = state.adminRecords.filter(function (r) {
      if (catFilter !== 'ALL' && r.kategori !== catFilter) return false;
      if (search && r.nama.toLowerCase().indexOf(search) === -1) return false;
      return true;
    });
    el.adminLogBody.innerHTML = '';
    if (filteredLogs.length === 0) {
      el.adminLogBody.innerHTML = '<tr><td colspan="9">Belum ada log absensi pada tanggal ini.</td></tr>';
    } else {
      filteredLogs.forEach(function (r) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + escapeHtml(r.tanggal) + '</td>' +
          '<td>' + escapeHtml(r.nama) + '</td>' +
          '<td>' + categoryBadgeHtml(r.kategori) + '</td>' +
          '<td>' + escapeHtml(r.jenisAbsen) + '</td>' +
          '<td>' + escapeHtml(r.waktuWib) + '</td>' +
          '<td>' + statusBadgeHtml(r.statusKetepatan) + '</td>' +
          '<td>' + escapeHtml(r.jarakMeter + ' m / ±' + r.akurasiMeter + ' m') + '</td>' +
          '<td>' + statusBadgeHtml(r.statusGps) + (r.catatanAnomali ? '<br><small>' + escapeHtml(r.catatanAnomali) + '</small>' : '') + '</td>' +
          '<td>' + escapeHtml(r.kegiatan) + '</td>';
        el.adminLogBody.appendChild(tr);
      });
    }

    // Render Tabel Daftar Peserta
    el.participantsTableBody.innerHTML = '';
    state.adminParticipants.forEach(function (p) {
      var tr = document.createElement('tr');
      var aktif = p.aktif !== false;
      tr.innerHTML =
        '<td>' + escapeHtml(p.id) + '</td>' +
        '<td><strong>' + escapeHtml(p.nama) + '</strong></td>' +
        '<td>' + categoryBadgeHtml(p.kategori) + '<br><small>' + escapeHtml(p.posisi || '-') + '</small></td>' +
        '<td>' + (aktif ? '<span class="badge badge-ok">Aktif</span>' : '<span class="badge badge-neutral">Nonaktif</span>') + '</td>' +
        '<td><button type="button" class="btn btn-secondary toggle-part-btn" data-id="' + escapeHtml(p.id) + '" data-next="' + (!aktif) + '">' +
        (aktif ? 'Nonaktifkan' : 'Aktifkan') +
        '</button></td>';
      el.participantsTableBody.appendChild(tr);
    });
  }

  function statCardHtml(label, val) {
    return '<div class="stat-card"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(val) + '</strong></div>';
  }

  async function handleAddParticipant(e) {
    e.preventDefault();
    var nama = el.newParticipantName.value.trim();
    var kategori = el.newParticipantCategory.value;
    var posisi = el.newParticipantRole.value.trim();
    el.addParticipantMsg.classList.add('hidden');

    try {
      if (state.demoMode) {
        var demo = loadDemoData();
        if (demo.participants.some(function (p) { return p.nama.toLowerCase() === nama.toLowerCase(); })) {
          setBanner(el.addParticipantMsg, 'danger', 'Peserta dengan nama tersebut sudah ada.');
          return;
        }
        var newId = 'P' + String(demo.participants.length + 1).padStart(3, '0');
        demo.participants.push({
          id: newId,
          nama: nama,
          kategori: kategori,
          posisi: posisi || (kategori === 'Magang SMK' ? 'Magang SMK' : '-'),
          aktif: true
        });
        saveDemoParticipants(demo.participants);
        state.participants = demo.participants.filter(function (p) { return p.aktif !== false; });
        state.adminParticipants = demo.participants;
      } else {
        var res = await apiPost({
          action: 'addParticipant',
          pin: state.adminPin,
          nama: nama,
          kategori: kategori,
          posisi: posisi
        });
        if (!res.ok) {
          setBanner(el.addParticipantMsg, 'danger', res.error || 'Gagal menambah peserta.');
          return;
        }
        await initApp();
        await loadAdminData();
      }

      setBanner(el.addParticipantMsg, 'ok', 'Peserta "' + nama + '" berhasil ditambahkan.');
      el.newParticipantName.value = '';
      el.newParticipantRole.value = '';
      populateParticipantsDropdown();
      renderAdminDashboard();
    } catch (err) {
      setBanner(el.addParticipantMsg, 'danger', 'Error: ' + err.message);
    }
  }

  async function handleToggleParticipant(id, nextAktif) {
    try {
      if (state.demoMode) {
        var demo = loadDemoData();
        demo.participants = demo.participants.map(function (p) {
          if (p.id === id) p.aktif = nextAktif;
          return p;
        });
        saveDemoParticipants(demo.participants);
        state.participants = demo.participants.filter(function (p) { return p.aktif !== false; });
        state.adminParticipants = demo.participants;
        populateParticipantsDropdown();
        renderAdminDashboard();
        return;
      }

      var res = await apiPost({
        action: 'toggleParticipant',
        pin: state.adminPin,
        id: id,
        aktif: nextAktif
      });
      if (!res.ok) {
        alert(res.error || 'Gagal memperbarui status peserta.');
        return;
      }
      await initApp();
      await loadAdminData();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  function exportAdminCsv() {
    var headers = ['Tanggal', 'Hari', 'ID_Peserta', 'Nama', 'Kategori', 'Posisi', 'Jenis_Absen', 'Jam_WIB', 'Status_Ketepatan', 'Kegiatan', 'Jarak_Meter', 'Akurasi_Meter', 'Status_GPS', 'Catatan_Anomali'];
    var lines = [headers.join(',')];
    state.adminRecords.forEach(function (r) {
      var row = [
        r.tanggal, r.hari, r.idPeserta, r.nama, r.kategori, r.posisi,
        r.jenisAbsen, r.waktuWib, r.statusKetepatan, r.kegiatan,
        r.jarakMeter, r.akurasiMeter, r.statusGps, r.catatanAnomali
      ].map(function (v) {
        return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      });
      lines.push(row.join(','));
    });

    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'rekap-absensi-magang-' + (el.filterDate.value || 'semua') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Event listeners
  el.tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      el.tabBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var target = btn.getAttribute('data-tab');
      el.tabAbsen.classList.toggle('hidden', target !== 'absen');
      el.tabAdmin.classList.toggle('hidden', target !== 'admin');
    });
  });

  document.querySelectorAll('input[name="jenisAbsen"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      setSelectedJenis(radio.value);
    });
  });

  el.participantSelect.addEventListener('change', onParticipantChange);
  el.kegiatanInput.addEventListener('input', updateSubmitButton);
  el.refreshGpsBtn.addEventListener('click', startGpsWatch);
  el.absenForm.addEventListener('submit', handleAbsenSubmit);
  el.adminLoginForm.addEventListener('submit', handleAdminLogin);
  el.adminRefreshBtn.addEventListener('click', loadAdminData);
  el.exportCsvBtn.addEventListener('click', exportAdminCsv);
  el.adminLogoutBtn.addEventListener('click', function () {
    state.adminPin = '';
    el.adminPinInput.value = '';
    el.adminDashboard.classList.add('hidden');
    el.adminLoginCard.classList.remove('hidden');
  });
  el.filterDate.addEventListener('change', loadAdminData);
  el.filterCategory.addEventListener('change', renderAdminDashboard);
  el.filterSearch.addEventListener('input', renderAdminDashboard);
  el.addParticipantForm.addEventListener('submit', handleAddParticipant);
  el.participantsTableBody.addEventListener('click', function (e) {
    var btn = e.target.closest('.toggle-part-btn');
    if (!btn) return;
    handleToggleParticipant(btn.getAttribute('data-id'), btn.getAttribute('data-next') === 'true');
  });
  el.saveApiUrlBtn.addEventListener('click', function () {
    var url = el.apiUrlOverrideInput.value.trim();
    state.apiUrl = url;
    if (url) {
      localStorage.setItem(STORAGE_API_URL, url);
    } else {
      localStorage.removeItem(STORAGE_API_URL);
    }
    initApp().then(function () {
      if (state.adminPin) loadAdminData();
    });
  });

  setInterval(function () {
    updateClock();
    updateEstimatedStatus();
  }, 1000);

  initApp();
  startGpsWatch();
})();
