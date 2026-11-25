(function (root) {
  'use strict';

  var CFG = root.ABSEN_CONFIG;
  var LOGIC = root.AbsenLogic;

  var STORAGE_API_URL = 'absen1507_api_url';
  var STORAGE_DEMO_PARTICIPANTS = 'absen1507_demo_participants';
  var STORAGE_DEMO_RECORDS = 'absen1507_demo_records';
  var DEMO_PIN = '15072026';

  function getApiUrl() {
    return localStorage.getItem(STORAGE_API_URL) || CFG.API_URL || '';
  }

  function setApiUrlOverride(url) {
    if (url) {
      localStorage.setItem(STORAGE_API_URL, url);
    } else {
      localStorage.removeItem(STORAGE_API_URL);
    }
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

  async function apiGet(apiUrl, params) {
    var qs = new URLSearchParams(params).toString();
    var res = await fetch(apiUrl + '?' + qs, { method: 'GET', redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function apiPost(apiUrl, payload) {
    // Memakai text/plain agar terhindar dari CORS preflight OPTIONS pada Google Apps Script
    var res = await fetch(apiUrl, {
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

  function createClockSync() {
    var anchorMs = Date.now();
    var perfAnchorMs = performance.now();
    var synced = false;

    return {
      syncFromServer: function (serverTimestampMs) {
        if (typeof serverTimestampMs === 'number' && isFinite(serverTimestampMs)) {
          anchorMs = serverTimestampMs;
          perfAnchorMs = performance.now();
          synced = true;
        }
      },
      markLocal: function () {
        synced = false;
      },
      isSynced: function () {
        return synced;
      },
      nowMs: function () {
        return anchorMs + (performance.now() - perfAnchorMs);
      },
      getWibParts: function () {
        return LOGIC.getWibDateParts(anchorMs + (performance.now() - perfAnchorMs));
      }
    };
  }

  root.AbsenShared = {
    DEMO_PIN: DEMO_PIN,
    getApiUrl: getApiUrl,
    setApiUrlOverride: setApiUrlOverride,
    escapeHtml: escapeHtml,
    statusBadgeHtml: statusBadgeHtml,
    categoryBadgeHtml: categoryBadgeHtml,
    setBanner: setBanner,
    apiGet: apiGet,
    apiPost: apiPost,
    loadDemoData: loadDemoData,
    saveDemoParticipants: saveDemoParticipants,
    saveDemoRecords: saveDemoRecords,
    createClockSync: createClockSync
  };
})(window);
