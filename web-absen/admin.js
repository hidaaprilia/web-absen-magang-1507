(function () {
  'use strict';

  var SHARED = window.AbsenShared;
  var clock = SHARED.createClockSync();

  var state = {
    apiUrl: SHARED.getApiUrl(),
    demoMode: false,
    adminPin: '',
    adminParticipants: [],
    adminRecords: []
  };

  var el = {
    serverClock: document.getElementById('serverClock'),
    serverDate: document.getElementById('serverDate'),
    clockSource: document.getElementById('clockSource'),
    connectionBanner: document.getElementById('connectionBanner'),
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

  function updateClock() {
    var parts = clock.getWibParts();
    el.serverClock.textContent = parts.timeStr + ' WIB';
    el.serverDate.textContent = parts.hariNama + ', ' + parts.dateStr;
    el.clockSource.textContent = clock.isSynced()
      ? 'Sumber: Waktu Server Google'
      : 'Sumber: Mode Preview Lokal';
    if (!el.filterDate.value) {
      el.filterDate.value = parts.dateStr;
    }
  }

  async function initAdminConnection() {
    state.apiUrl = SHARED.getApiUrl();
    el.apiUrlOverrideInput.value = state.apiUrl;

    if (!state.apiUrl) {
      state.demoMode = true;
      clock.markLocal();
      SHARED.setBanner(
        el.connectionBanner,
        'warn',
        'Mode Preview Lokal aktif (URL Google Apps Script belum dipasang di config.js).'
      );
      updateClock();
      return;
    }

    try {
      var data = await SHARED.apiGet(state.apiUrl, { action: 'init' });
      if (!data.ok) throw new Error(data.error || 'Gagal terhubung ke server.');
      state.demoMode = false;
      clock.syncFromServer(data.serverTimestampMs);
      el.connectionBanner.classList.add('hidden');
      updateClock();
    } catch (err) {
      state.demoMode = true;
      clock.markLocal();
      SHARED.setBanner(
        el.connectionBanner,
        'warn',
        'Gagal terhubung ke Apps Script (' + err.message + '). Beralih ke Mode Preview Lokal.'
      );
      updateClock();
    }
  }

  async function handleAdminLogin(e) {
    e.preventDefault();
    var pin = el.adminPinInput.value.trim();
    el.adminLoginError.classList.add('hidden');

    try {
      if (state.demoMode) {
        if (pin !== SHARED.DEMO_PIN) {
          SHARED.setBanner(el.adminLoginError, 'danger', 'PIN salah (PIN mode preview lokal: PREVIEW).');
          return;
        }
      } else {
        var verify = await SHARED.apiPost(state.apiUrl, { action: 'adminVerify', pin: pin });
        if (!verify.ok) {
          SHARED.setBanner(el.adminLoginError, 'danger', verify.error || 'PIN admin salah.');
          return;
        }
      }

      state.adminPin = pin;
      el.adminLoginCard.classList.add('hidden');
      el.adminDashboard.classList.remove('hidden');
      await loadAdminData();
    } catch (err) {
      SHARED.setBanner(el.adminLoginError, 'danger', 'Gagal verifikasi: ' + err.message);
    }
  }

  async function loadAdminData() {
    var dateVal = el.filterDate.value || '';
    if (state.demoMode) {
      var demo = SHARED.loadDemoData();
      state.adminParticipants = demo.participants;
      state.adminRecords = dateVal
        ? demo.records.filter(function (r) { return r.tanggal === dateVal; })
        : demo.records;
      renderAdminDashboard();
      return;
    }

    var res = await SHARED.apiPost(state.apiUrl, {
      action: 'adminData',
      pin: state.adminPin,
      date: dateVal
    });
    if (!res.ok) {
      alert(res.error || 'Gagal memuat data admin.');
      return;
    }
    clock.syncFromServer(res.serverTimestampMs);
    state.adminParticipants = res.participants || [];
    state.adminRecords = res.records || [];
    renderAdminDashboard();
  }

  function statCardHtml(label, val) {
    return (
      '<div class="stat-card"><span>' +
      SHARED.escapeHtml(label) +
      '</span><strong>' +
      SHARED.escapeHtml(val) +
      '</strong></div>'
    );
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

    el.adminSummaryBody.innerHTML = '';
    if (filteredParticipants.length === 0) {
      el.adminSummaryBody.innerHTML = '<tr><td colspan="8">Tidak ada peserta sesuai filter.</td></tr>';
    } else {
      filteredParticipants.forEach(function (p) {
        var pair = byParticipant[p.id] || { masuk: null, pulang: null };
        var masuk = pair.masuk;
        var pulang = pair.pulang;
        var kegiatanParts = [];
        if (masuk && masuk.kegiatan && masuk.kegiatan !== 'Hadir (Absen Masuk)' && masuk.kegiatan !== '-') {
          kegiatanParts.push('Masuk: ' + masuk.kegiatan);
        }
        if (pulang && pulang.kegiatan) kegiatanParts.push(pulang.kegiatan);
        var gpsNotes = [];
        if (masuk) gpsNotes.push('Masuk ' + masuk.jarakMeter + 'm (' + masuk.statusGps + ')');
        if (pulang) gpsNotes.push('Pulang ' + pulang.jarakMeter + 'm (' + pulang.statusGps + ')');

        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td><strong>' + SHARED.escapeHtml(p.nama) + '</strong></td>' +
          '<td>' + SHARED.categoryBadgeHtml(p.kategori) + '<br><small>' + SHARED.escapeHtml(p.posisi || '-') + '</small></td>' +
          '<td>' + (masuk ? SHARED.escapeHtml(masuk.waktuWib) : '-') + '</td>' +
          '<td>' + SHARED.statusBadgeHtml(masuk ? masuk.statusKetepatan : '') + '</td>' +
          '<td>' + (pulang ? SHARED.escapeHtml(pulang.waktuWib) : '-') + '</td>' +
          '<td>' + SHARED.statusBadgeHtml(pulang ? pulang.statusKetepatan : '') + '</td>' +
          '<td>' + (kegiatanParts.length ? SHARED.escapeHtml(kegiatanParts.join(' | ')) : '-') + '</td>' +
          '<td>' + (gpsNotes.length ? SHARED.escapeHtml(gpsNotes.join(' / ')) : '-') + '</td>';
        el.adminSummaryBody.appendChild(tr);
      });
    }

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
          '<td>' + SHARED.escapeHtml(r.tanggal) + '</td>' +
          '<td>' + SHARED.escapeHtml(r.nama) + '</td>' +
          '<td>' + SHARED.categoryBadgeHtml(r.kategori) + '</td>' +
          '<td>' + SHARED.escapeHtml(r.jenisAbsen) + '</td>' +
          '<td>' + SHARED.escapeHtml(r.waktuWib) + '</td>' +
          '<td>' + SHARED.statusBadgeHtml(r.statusKetepatan) + '</td>' +
          '<td>' + SHARED.escapeHtml(r.jarakMeter + ' m / ±' + r.akurasiMeter + ' m') + '</td>' +
          '<td>' + SHARED.statusBadgeHtml(r.statusGps) + (r.catatanAnomali ? '<br><small>' + SHARED.escapeHtml(r.catatanAnomali) + '</small>' : '') + '</td>' +
          '<td>' + SHARED.escapeHtml(r.kegiatan) + '</td>';
        el.adminLogBody.appendChild(tr);
      });
    }

    el.participantsTableBody.innerHTML = '';
    state.adminParticipants.forEach(function (p) {
      var tr = document.createElement('tr');
      var aktif = p.aktif !== false;
      var hasDevice = Boolean(p.hasDevice || p.deviceId);
      var deviceBadge = hasDevice
        ? '<span class="badge badge-hub">Terkunci (' +
          SHARED.escapeHtml(p.deviceHint || ('...' + String(p.deviceId).slice(-6))) +
          ')</span>' +
          (p.deviceBoundAt ? '<br><small>' + SHARED.escapeHtml(p.deviceBoundAt) + '</small>' : '')
        : '<span class="badge badge-neutral">Belum terikat</span>';
      var resetBtn = hasDevice
        ? '<button type="button" class="btn btn-secondary reset-device-btn" data-id="' +
          SHARED.escapeHtml(p.id) +
          '" data-name="' +
          SHARED.escapeHtml(p.nama) +
          '">Reset Perangkat</button>'
        : '';

      tr.innerHTML =
        '<td>' + SHARED.escapeHtml(p.id) + '</td>' +
        '<td><strong>' + SHARED.escapeHtml(p.nama) + '</strong></td>' +
        '<td>' + SHARED.categoryBadgeHtml(p.kategori) + '<br><small>' + SHARED.escapeHtml(p.posisi || '-') + '</small></td>' +
        '<td>' + (aktif ? '<span class="badge badge-ok">Aktif</span>' : '<span class="badge badge-neutral">Nonaktif</span>') + '</td>' +
        '<td>' + deviceBadge + '</td>' +
        '<td><div style="display:flex; gap:6px; flex-wrap:wrap;">' +
        '<button type="button" class="btn btn-secondary toggle-part-btn" data-id="' + SHARED.escapeHtml(p.id) + '" data-next="' + (!aktif) + '">' +
        (aktif ? 'Nonaktifkan' : 'Aktifkan') +
        '</button>' +
        resetBtn +
        '</div></td>';
      el.participantsTableBody.appendChild(tr);
    });
  }

  async function handleAddParticipant(e) {
    e.preventDefault();
    var nama = el.newParticipantName.value.trim();
    var kategori = el.newParticipantCategory.value;
    var posisi = el.newParticipantRole.value.trim();
    el.addParticipantMsg.classList.add('hidden');

    try {
      if (state.demoMode) {
        var demo = SHARED.loadDemoData();
        if (demo.participants.some(function (p) { return p.nama.toLowerCase() === nama.toLowerCase(); })) {
          SHARED.setBanner(el.addParticipantMsg, 'danger', 'Peserta dengan nama tersebut sudah ada.');
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
        SHARED.saveDemoParticipants(demo.participants);
        state.adminParticipants = demo.participants;
      } else {
        var res = await SHARED.apiPost(state.apiUrl, {
          action: 'addParticipant',
          pin: state.adminPin,
          nama: nama,
          kategori: kategori,
          posisi: posisi
        });
        if (!res.ok) {
          SHARED.setBanner(el.addParticipantMsg, 'danger', res.error || 'Gagal menambah peserta.');
          return;
        }
        await loadAdminData();
      }

      SHARED.setBanner(el.addParticipantMsg, 'ok', 'Peserta "' + nama + '" berhasil ditambahkan.');
      el.newParticipantName.value = '';
      el.newParticipantRole.value = '';
      renderAdminDashboard();
    } catch (err) {
      SHARED.setBanner(el.addParticipantMsg, 'danger', 'Error: ' + err.message);
    }
  }

  async function handleToggleParticipant(id, nextAktif) {
    try {
      if (state.demoMode) {
        var demo = SHARED.loadDemoData();
        demo.participants = demo.participants.map(function (p) {
          if (p.id === id) p.aktif = nextAktif;
          return p;
        });
        SHARED.saveDemoParticipants(demo.participants);
        state.adminParticipants = demo.participants;
        renderAdminDashboard();
        return;
      }

      var res = await SHARED.apiPost(state.apiUrl, {
        action: 'toggleParticipant',
        pin: state.adminPin,
        id: id,
        aktif: nextAktif
      });
      if (!res.ok) {
        alert(res.error || 'Gagal memperbarui status peserta.');
        return;
      }
      await loadAdminData();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async function handleResetDevice(id, nama) {
    if (!confirm('Reset kunci perangkat untuk ' + nama + '? Peserta bisa mendaftarkan HP baru saat absen berikutnya.')) {
      return;
    }
    try {
      if (state.demoMode) {
        var demo = SHARED.loadDemoData();
        demo.participants = demo.participants.map(function (p) {
          if (p.id === id) {
            p.deviceId = '';
            p.deviceBoundAt = '';
          }
          return p;
        });
        SHARED.saveDemoParticipants(demo.participants);
        state.adminParticipants = demo.participants;
        renderAdminDashboard();
        return;
      }

      var res = await SHARED.apiPost(state.apiUrl, {
        action: 'resetDevice',
        pin: state.adminPin,
        id: id
      });
      if (!res.ok) {
        alert(res.error || 'Gagal mereset perangkat.');
        return;
      }
      await loadAdminData();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  function sanitizeCsvCell(v) {
    var str = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }
    return '"' + str.replace(/"/g, '""') + '"';
  }

  function exportAdminCsv() {
    var headers = ['Tanggal', 'Hari', 'ID_Peserta', 'Nama', 'Kategori', 'Posisi', 'Jenis_Absen', 'Jam_WIB', 'Status_Ketepatan', 'Kegiatan', 'Jarak_Meter', 'Akurasi_Meter', 'Status_GPS', 'Catatan_Anomali'];
    var lines = [headers.join(',')];
    state.adminRecords.forEach(function (r) {
      var row = [
        r.tanggal, r.hari, r.idPeserta, r.nama, r.kategori, r.posisi,
        r.jenisAbsen, r.waktuWib, r.statusKetepatan, r.kegiatan,
        r.jarakMeter, r.akurasiMeter, r.statusGps, r.catatanAnomali
      ].map(sanitizeCsvCell);
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
    var toggleBtn = e.target.closest('.toggle-part-btn');
    if (toggleBtn) {
      handleToggleParticipant(
        toggleBtn.getAttribute('data-id'),
        toggleBtn.getAttribute('data-next') === 'true'
      );
      return;
    }
    var resetBtn = e.target.closest('.reset-device-btn');
    if (resetBtn) {
      handleResetDevice(resetBtn.getAttribute('data-id'), resetBtn.getAttribute('data-name') || 'peserta ini');
    }
  });
  el.saveApiUrlBtn.addEventListener('click', function () {
    var url = el.apiUrlOverrideInput.value.trim();
    SHARED.setApiUrlOverride(url);
    initAdminConnection().then(function () {
      if (state.adminPin) loadAdminData();
    });
  });

  setInterval(updateClock, 1000);
  initAdminConnection();
})();
