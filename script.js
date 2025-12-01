const form = document.querySelector("#attendance-form");
const currentDate = document.querySelector("#current-date");
const recordsList = document.querySelector("#records-list");
const summary = document.querySelector("#attendance-summary");
const counters = {
  onsite: document.querySelector("#onsite-count"),
  online: document.querySelector("#online-count"),
  event: document.querySelector("#event-count"),
};
const startCameraBtn = document.querySelector("#start-camera");
const verifyFaceBtn = document.querySelector("#verify-face");
const faceVideo = document.querySelector("#face-video");
const faceCanvas = document.querySelector("#face-canvas");
const facePlaceholder = document.querySelector("#face-placeholder");
const faceStatus = document.querySelector("#face-status");
const nimField = form?.querySelector('input[name="nim"]');
const nameField = form?.querySelector('input[name="nama"]');
const kelasField = form?.querySelector('input[name="kelas"]');
const scrollHistoryBtn = document.querySelector("#scroll-history");
const scrollAbsenBtn = document.querySelector("#scroll-absen");
const recordsSection = document.querySelector("#records-card");
const exportAttendanceBtn = document.querySelector("#export-attendance");
const exportEnrollBtn = document.querySelector("#export-enroll");
const enrollForm = document.querySelector("#enroll-form");
const enrollStartBtn = document.querySelector("#enroll-start-camera");
const enrollSubmitBtn = document.querySelector("#enroll-submit");
const enrollVideo = document.querySelector("#enroll-video");
const enrollCanvas = document.querySelector("#enroll-canvas");
const enrollPlaceholder = document.querySelector("#enroll-placeholder");
const enrollStatus = document.querySelector("#enroll-status");
const enrolledList = document.querySelector("#enrolled-list");
const deleteSelectedEnrollBtn = document.querySelector("#delete-selected-enroll");
const deleteAllEnrollBtn = document.querySelector("#delete-all-enroll");

// GitHub inline configuration
// Edit these values directly in `script.js` to configure GitHub sync.
// WARNING: Storing a Personal Access Token (PAT) in source code is insecure.
// Prefer to leave `token` empty and set it in sessionStorage during testing.
const githubInlineConfig = {
  owner: "PatrickMager", // repository owner
  repo: "absensi-biometic", // repository name
  branch: "main",
  enrolledPath: "data/enrolledFaces.json",
  attendancePath: "data/attendanceRecords.json",
  token: "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", // optional: fill only for quick local testing (not recommended)
  autoSyncEnrolled: true,
  autoSyncAttendance: true,
};

let mediaStream;
let enrollStream;

const formatTime = (date) =>
  date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

const updateDate = () => {
  const now = new Date();
  currentDate.textContent = now.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const stopCamera = () => {
  if (!mediaStream) return;
  mediaStream.getTracks().forEach((track) => track.stop());
  mediaStream = undefined;
  state.faceImage = null;
  state.faceSignature = null;
  state.lastVerifiedProfile = null;
  if (faceVideo) {
    faceVideo.srcObject = null;
    faceVideo.classList.remove("active");
  }
  if (faceCanvas) {
    faceCanvas.classList.remove("active");
    faceCanvas.hidden = true;
  }
  if (facePlaceholder) {
    facePlaceholder.hidden = false;
  }
};

const setFaceStatus = (text, variant) => {
  if (!faceStatus) return;
  faceStatus.textContent = text;
  faceStatus.classList.remove("success", "error");
  if (variant) {
    faceStatus.classList.add(variant);
  }
};

const generateFaceCode = (signature = "") => {
  if (!signature) return null;
  let hash = 0;
  for (let i = 0; i < signature.length; i += 1) {
    hash = (hash * 31 + signature.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").toUpperCase();
};

const loadEnrolledFaces = () => {
  try {
    const stored = localStorage.getItem("enrolledFaces");
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.map((face) => ({
          ...face,
          id:
            face.id ||
            `f${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`,
          signature: face.signature || null,
          faceCode:
            face.faceCode ||
            (face.signature ? generateFaceCode(face.signature) : null),
        }))
      : [];
  } catch {
    return [];
  }
};

const loadAttendanceRecords = () => {
  try {
    const stored = localStorage.getItem("attendanceRecords");
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((record) => ({
      ...record,
      faceCode: record.faceCode || null,
    }));
  } catch {
    return [];
  }
};

const persistAttendanceRecords = () => {
  try {
    localStorage.setItem(
      "attendanceRecords",
      JSON.stringify(state.records.slice(0, 200))
    );
    // optionally auto-sync attendance to GitHub if configured
    maybeAutoSyncToGitHub();
  } catch (error) {
    console.warn("Unable to persist attendance data", error);
  }
};

const persistEnrolledFaces = () => {
  try {
    localStorage.setItem(
      "enrolledFaces",
      JSON.stringify(state.enrolledFaces.slice(0, 20))
    );
    // optionally auto-sync to GitHub if configured
    maybeAutoSyncToGitHub();
  } catch (error) {
    console.warn("Unable to persist enrolled faces", error);
  }
};

// GitHub helper functions
const readGithubConfig = () => {
  try {
    const stored = localStorage.getItem("githubConfig");
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore parse errors
  }
  // fallback to inline config
  return githubInlineConfig;
};

// saveGithubConfig removed: configuration is provided inline via `githubInlineConfig`

const getSessionToken = () => sessionStorage.getItem("githubToken") || githubInlineConfig.token || null;

let lastGithubStatus = null;
const updateGithubStatus = (text, isError) => {
  lastGithubStatus = { text, isError: !!isError, at: new Date().toISOString() };
  // not shown on landing page per user request — log to console for debugging
  if (isError) console.error("GitHub:", text);
  else console.info("GitHub:", text);
};

const b64EncodeUnicode = (str) => {
  return btoa(unescape(encodeURIComponent(str)));
};

const githubPutFile = async ({ owner, repo, path, branch = "main", token, contentStr, message }) => {
  if (!owner || !repo || !path || !token) throw new Error("Konfigurasi GitHub tidak lengkap.");
  const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;

  const attemptUpdate = async (sha) => {
    const body = {
      message: message || `Update ${path}`,
      content: b64EncodeUnicode(contentStr),
      branch,
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(apiBase, {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      if (putRes.status === 409) {
        // SHA mismatch, fetch latest SHA and retry
        try {
          const res = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, {
            headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" },
          });
          if (res.ok) {
            const data = await res.json();
            return await attemptUpdate(data.sha);
          }
        } catch (e) {
          // ignore and throw original error
        }
      }
      throw new Error(`GitHub API error: ${putRes.status} ${errText}`);
    }
    return await putRes.json();
  };

  // Initial attempt: check if file exists to obtain sha
  let sha = null;
  try {
    const res = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, {
      headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" },
    });
    if (res.ok) {
      const data = await res.json();
      sha = data.sha;
    }
  } catch (e) {
    // ignore; we'll try to create
  }

  return await attemptUpdate(sha);
};

const maybeAutoSyncToGitHub = () => {
  const cfg = readGithubConfig();
  const token = getSessionToken();
  if (!cfg || !token) return;
  if (cfg.autoSyncEnrolled) {
    saveEnrolledToGitHub().catch((e) => updateGithubStatus(`Auto-sync enrolled gagal: ${e.message}`, true));
  }
  if (cfg.autoSyncAttendance) {
    saveAttendanceToGitHub().catch((e) => updateGithubStatus(`Auto-sync attendance gagal: ${e.message}`, true));
  }
};

const saveEnrolledToGitHub = async () => {
  const cfg = readGithubConfig();
  const token = getSessionToken();
  if (!cfg || !token) throw new Error("GitHub belum dikonfigurasi.");
  const path = cfg.enrolledPath || "data/enrolledFaces.json";
  const owner = cfg.owner;
  const repo = cfg.repo;
  const branch = cfg.branch || "main";
  const contentStr = JSON.stringify(state.enrolledFaces, null, 2);
  updateGithubStatus("Mengirim enrolledFaces ke GitHub...");
  const res = await githubPutFile({ owner, repo, path, branch, token, contentStr, message: "Update enrolledFaces" });
  updateGithubStatus("enrolledFaces tersinkronisasi ke GitHub.");
  return res;
};

const saveAttendanceToGitHub = async () => {
  const cfg = readGithubConfig();
  const token = getSessionToken();
  if (!cfg || !token) throw new Error("GitHub belum dikonfigurasi.");
  const path = cfg.attendancePath || "data/attendanceRecords.json";
  const owner = cfg.owner;
  const repo = cfg.repo;
  const branch = cfg.branch || "main";
  const contentStr = JSON.stringify(state.records, null, 2);
  updateGithubStatus("Mengirim attendanceRecords ke GitHub...");
  const res = await githubPutFile({ owner, repo, path, branch, token, contentStr, message: "Update attendanceRecords" });
  updateGithubStatus("attendanceRecords tersinkronisasi ke GitHub.");
  return res;
};

// CSV generation helpers (safe quoting)
const csvEscape = (value) => {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // escape double quotes by doubling them
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const rowsToCsv = (headers, rows) => {
  const headerLine = headers.map(csvEscape).join(',');
  const dataLines = rows.map((r) => r.map(csvEscape).join(','));
  return [headerLine, ...dataLines].join('\n');
};

// Convert enrolledFaces to CSV rows
const enrolledFacesToCsv = (faces) => {
  const headers = ['NIM', 'Nama', 'Program Studi', 'Tanggal Pendaftaran', 'Kode Wajah'];
  const rows = faces.map((f) => [f.nim || '', f.nama || '', f.prodi || f.kelas || '', f.createdAt || '', f.faceCode || '']);
  return rowsToCsv(headers, rows);
};

// Convert attendanceRecords to CSV rows
const attendanceRecordsToCsv = (records) => {
  const headers = ['Tanggal', 'Waktu', 'NIM', 'Nama', 'Kelas / Prodi', 'ModeLabel', 'Mode', 'Kode Wajah', 'TimestampISO'];
  const rows = records.map((r) => {
    const dateObj = r.timestamp ? new Date(r.timestamp) : null;
    const tanggal = dateObj
      ? dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
      : '-';
    const waktu = dateObj ? formatTime(dateObj) : r.time ?? '-';
    return [tanggal, waktu, r.nim || '', r.nama || '', r.kelas || r.prodi || '', r.modeLabel || '', r.mode || '', r.faceCode || '', r.timestamp || ''];
  });
  return rowsToCsv(headers, rows);
};

// Save CSV variants to GitHub (derive CSV path if JSON path is set)
const saveCsvToGitHub = async ({ which = 'enrolled' } = {}) => {
  const cfg = readGithubConfig();
  const token = getSessionToken();
  if (!cfg || !token) throw new Error('GitHub belum dikonfigurasi.');
  const owner = cfg.owner;
  const repo = cfg.repo;
  const branch = cfg.branch || 'main';
  let path = which === 'enrolled' ? (cfg.enrolledPath || 'data/enrolledFaces.json') : (cfg.attendancePath || 'data/attendanceRecords.json');
  // replace .json with .csv or append .csv
  if (path.endsWith('.json')) path = path.replace(/\.json$/i, '.csv');
  else if (!path.toLowerCase().endsWith('.csv')) path = `${path}.csv`;

  const contentStr = which === 'enrolled' ? enrolledFacesToCsv(state.enrolledFaces) : attendanceRecordsToCsv(state.records);
  updateGithubStatus(`Mengirim ${which} CSV ke GitHub...`);
  const res = await githubPutFile({ owner, repo, path, branch, token, contentStr, message: `Update ${path}` });
  updateGithubStatus(`${which} CSV tersinkronisasi ke GitHub.`);
  return res;
};

const setEnrollStatus = (text, variant) => {
  if (!enrollStatus) return;
  enrollStatus.textContent = text;
  enrollStatus.classList.remove("success", "error");
  if (variant) {
    enrollStatus.classList.add(variant);
  }
};

const stopEnrollCamera = () => {
  if (!enrollStream) return;
  enrollStream.getTracks().forEach((track) => track.stop());
  enrollStream = undefined;
  state.pendingEnrollImage = null;
  state.pendingEnrollSignature = null;
  if (enrollVideo) {
    enrollVideo.srcObject = null;
    enrollVideo.classList.remove("active");
  }
  if (enrollCanvas) {
    enrollCanvas.classList.remove("active");
    enrollCanvas.hidden = true;
  }
  if (enrollPlaceholder) {
    enrollPlaceholder.hidden = false;
  }
};

const signatureCanvas = document.createElement("canvas");
const signatureCtx = signatureCanvas.getContext("2d");
const SIGNATURE_SIZE = 32;
const MATCH_THRESHOLD = 0.78;

const createSignature = (dataUrl) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      signatureCanvas.width = SIGNATURE_SIZE;
      signatureCanvas.height = SIGNATURE_SIZE;
      signatureCtx.clearRect(0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE);
      signatureCtx.drawImage(img, 0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE);
      const { data } = signatureCtx.getImageData(
        0,
        0,
        SIGNATURE_SIZE,
        SIGNATURE_SIZE
      );
      let bits = "";
      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
        bits += gray > 128 ? "1" : "0";
      }
      resolve(bits);
    };
    img.onerror = () => reject(new Error("Gagal memuat snapshot."));
    img.src = dataUrl;
  });

const compareSignatures = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;
  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) matches += 1;
  }
  return matches / a.length;
};

const formatDateTimeLabel = (date) =>
  date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const escapeXml = (text) => {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const exportToExcel = (filename, headers, rows) => {
  if (!rows.length) {
    window.alert("Belum ada data untuk diekspor.");
    return;
  }

  const headerRow = `<Row>${headers
    .map(
      (cell) =>
        `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`
    )
    .join("")}</Row>`;

  const dataRows = rows
    .map(
      (row) =>
        `<Row>${row
          .map(
            (cell) =>
              `<Cell><Data ss:Type="String">${escapeXml(
                cell === null || cell === undefined ? "" : cell
              )}</Data></Cell>`
          )
          .join("")}</Row>`
    )
    .join("");

  const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <Worksheet ss:Name="Data">
    <Table>
      ${headerRow}
      ${dataRows}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([workbookXml], {
    type: "application/vnd.ms-excel",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const state = {
  records: loadAttendanceRecords(),
  faceVerified: false,
  faceImage: null,
  faceSignature: null,
  lastVerifiedProfile: null,
  enrolledFaces: loadEnrolledFaces(),
  pendingEnrollImage: null,
  pendingEnrollSignature: null,
};

const renderRecords = () => {
  if (!state.records.length) {
    recordsList.innerHTML =
      '<p class="empty-state">Belum ada data hari ini. Mulai dari mengisi formulir di kanan atas.</p>';
    summary.textContent = "0 Mahasiswa hadir";
    Object.values(counters).forEach((el) => (el.textContent = "0"));
    persistAttendanceRecords();
    return;
  }

  recordsList.innerHTML = state.records
    .map((entry) => {
      const recordDate = entry.timestamp
        ? new Date(entry.timestamp).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "—";
      const recordTime = entry.timestamp
        ? formatTime(new Date(entry.timestamp))
        : entry.time ?? "-";
      const kelasLabel = entry.kelas || entry.prodi || "-";
      const faceCode = entry.faceCode ? `<span class="badge">${entry.faceCode}</span>` : "";
      return `
        <div class="record">
          <div>
            <strong>${entry.nama}</strong>
            <span>${entry.nim} • ${kelasLabel}</span>
          </div>
          <div>
            <span>${entry.modeLabel}</span>
            ${faceCode}
            <p class="metric-label">${recordDate} • ${recordTime}</p>
          </div>
        </div>
      `;
    })
    .join("");

  summary.textContent = `${state.records.length} Mahasiswa hadir`;
  counters.onsite.textContent = state.records.filter(
    (r) => r.mode === "onsite"
  ).length;
  counters.online.textContent = state.records.filter(
    (r) => r.mode === "online"
  ).length;
  counters.event.textContent = state.records.filter(
    (r) => r.mode === "event"
  ).length;
  persistAttendanceRecords();
};


form?.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!state.faceVerified) {
    setFaceStatus(
      "Silakan verifikasi wajah sebelum menandai kehadiran.",
      "error"
    );
    verifyFaceBtn?.classList.add("shake");
    setTimeout(() => verifyFaceBtn?.classList.remove("shake"), 600);
    return;
  }

  const formData = new FormData(form);
  const now = new Date();
  const record = {
    nim: formData.get("nim"),
    nama: formData.get("nama"),
    kelas: formData.get("kelas"),
    mode: formData.get("mode"),
    modeLabel: {
      onsite: "On-site",
      online: "Online",
      event: "Event Kampus",
    }[formData.get("mode")],
    timestamp: now.toISOString(),
    faceCode: state.lastVerifiedProfile?.faceCode || null,
  };

  state.records = [record, ...state.records].slice(0, 50);
  renderRecords();
  form.reset();
  state.faceVerified = false;
  state.faceImage = null;
  state.faceSignature = null;
  state.lastVerifiedProfile = null;
  if (verifyFaceBtn) {
    verifyFaceBtn.disabled = true;
    verifyFaceBtn.textContent = "Verifikasi Wajah";
  }
  setFaceStatus("Kamera belum aktif.");
  stopCamera();
});

enrollStartBtn?.addEventListener("click", async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    setEnrollStatus("Perangkat tidak mendukung akses kamera.", "error");
    return;
  }
  try {
    enrollStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    if (enrollVideo) {
      enrollVideo.srcObject = enrollStream;
      enrollVideo.classList.add("active");
    }
    if (enrollPlaceholder) {
      enrollPlaceholder.hidden = true;
    }
    setEnrollStatus("Kamera aktif. Tekan 'Daftarkan Wajah' untuk menangkap dan mendaftar.");
    if (enrollSubmitBtn) {
      enrollSubmitBtn.disabled = false;
    }
    state.pendingEnrollImage = null;
    state.pendingEnrollSignature = null;
  } catch (error) {
    setEnrollStatus("Gagal mengakses kamera. Periksa izin browser.", "error");
  }
});

// enrollCaptureBtn removed: enroll form will capture snapshot automatically when submitted

enrollForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  // If no pending snapshot, capture directly from live enroll video
  if (!state.pendingEnrollImage) {
    if (!enrollStream || !enrollVideo) {
      setEnrollStatus("Aktifkan kamera terlebih dahulu.", "error");
      return;
    }
    if (!enrollVideo.videoWidth) {
      setEnrollStatus("Video belum siap, coba lagi.", "error");
      return;
    }
    if (enrollSubmitBtn) enrollSubmitBtn.disabled = true;
    try {
      enrollCanvas.width = enrollVideo.videoWidth;
      enrollCanvas.height = enrollVideo.videoHeight;
      const ctx = enrollCanvas.getContext("2d");
      ctx.drawImage(enrollVideo, 0, 0);
      const snapshot = enrollCanvas.toDataURL("image/png");
      state.pendingEnrollImage = snapshot;
      state.pendingEnrollSignature = await createSignature(snapshot);
      enrollCanvas.classList.add("active");
      enrollCanvas.hidden = false;
    } catch (err) {
      setEnrollStatus("Gagal mengambil atau memproses snapshot, coba ulang.", "error");
      if (enrollSubmitBtn) enrollSubmitBtn.disabled = false;
      return;
    }
  }
  const formData = new FormData(enrollForm);
  const faceProfile = {
    nim: formData.get("enroll-nim"),
    nama: formData.get("enroll-nama"),
    prodi: formData.get("enroll-prodi"),
    face: state.pendingEnrollImage,
    signature: state.pendingEnrollSignature,
    faceCode: generateFaceCode(state.pendingEnrollSignature),
    id: `f${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`,
    createdAt: new Date().toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
  };

  state.enrolledFaces = [faceProfile, ...state.enrolledFaces].slice(0, 12);
  persistEnrolledFaces();
  renderEnrolledFaces();
  setEnrollStatus("Wajah berhasil terdaftar!", "success");
  enrollForm.reset();
  state.pendingEnrollImage = null;
  state.pendingEnrollSignature = null;
  if (enrollSubmitBtn) {
    enrollSubmitBtn.disabled = true;
  }
  if (enrollCaptureBtn) {
    enrollCaptureBtn.disabled = true;
  }
  stopEnrollCamera();
});

// Render enrolled faces with checkboxes for selection
const renderEnrolledFaces = () => {
  if (!enrolledList) return;
  if (!state.enrolledFaces.length) {
    enrolledList.innerHTML =
      '<p class="empty-state">Belum ada wajah terdaftar. Selesaikan registrasi pertama Anda.</p>';
    return;
  }

  enrolledList.innerHTML = state.enrolledFaces
    .map(
      (entry) => `
    <div class="record enrolled-record-item" data-id="${entry.id}">
      <label class="enroll-row">
        <input type="checkbox" class="enroll-checkbox" data-id="${entry.id}" />
        <div style="flex:1;margin-left:8px;">
          <strong>${entry.nama} (${entry.nim})</strong>
          <span>${entry.prodi || "-"} • Terdaftar ${entry.createdAt}</span>
        </div>
        ${entry.faceCode ? `<span class="badge">Kode: ${entry.faceCode}</span>` : ""}
      </label>
    </div>
  `
    )
    .join("");
};

// Handler: Hapus terpilih
deleteSelectedEnrollBtn?.addEventListener("click", () => {
  if (!enrolledList) return;
  const checked = Array.from(enrolledList.querySelectorAll(".enroll-checkbox:checked")).map(
    (cb) => cb.dataset.id
  );
  if (!checked.length) {
    setEnrollStatus("Pilih minimal satu wajah untuk dihapus.", "error");
    return;
  }
  if (!confirm(`Hapus ${checked.length} wajah terpilih? Tindakan ini tidak dapat dibatalkan.`)) return;
  state.enrolledFaces = state.enrolledFaces.filter((f) => !checked.includes(f.id));
  persistEnrolledFaces();
  renderEnrolledFaces();
  setEnrollStatus(`${checked.length} wajah dihapus.`, "success");
});

// Handler: Hapus semua
deleteAllEnrollBtn?.addEventListener("click", () => {
  if (!state.enrolledFaces.length) {
    setEnrollStatus("Tidak ada wajah terdaftar.", "error");
    return;
  }
  if (!confirm(`Hapus semua (${state.enrolledFaces.length}) wajah terdaftar?`)) return;
  state.enrolledFaces = [];
  persistEnrolledFaces();
  renderEnrolledFaces();
  setEnrollStatus("Semua wajah terhapus.", "success");
});

// GitHub UI removed; configuration comes from `githubInlineConfig` in source code.

startCameraBtn?.addEventListener("click", async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    setFaceStatus("Perangkat tidak mendukung akses kamera.", "error");
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    if (faceVideo) {
      faceVideo.srcObject = mediaStream;
      faceVideo.classList.add("active");
    }
    if (facePlaceholder) {
      facePlaceholder.hidden = true;
    }
    setFaceStatus("Kamera aktif. Tekan 'Verifikasi Wajah' untuk menangkap dan memproses.");
    if (verifyFaceBtn) {
      verifyFaceBtn.disabled = false;
    }
    state.faceVerified = false;
    state.faceImage = null;
    state.faceSignature = null;
    state.lastVerifiedProfile = null;
  } catch (error) {
    setFaceStatus("Gagal mengakses kamera. Periksa izin browser.", "error");
  }
});

// captureFaceBtn removed: verify button will capture snapshot from live video when pressed

verifyFaceBtn?.addEventListener("click", async () => {
  // If no snapshot/signature available, try to capture directly from the live video
  if ((!state.faceImage || !state.faceSignature) && faceVideo && mediaStream) {
    if (!faceVideo.videoWidth) {
      setFaceStatus("Video belum siap, coba lagi sebentar.", "error");
      return;
    }
    try {
      faceCanvas.width = faceVideo.videoWidth;
      faceCanvas.height = faceVideo.videoHeight;
      const ctx = faceCanvas.getContext("2d");
      ctx.drawImage(faceVideo, 0, 0);
      const snapshot = faceCanvas.toDataURL("image/png");
      state.faceImage = snapshot;
      state.faceSignature = null;
      faceCanvas.classList.add("active");
      faceCanvas.hidden = false;
      setFaceStatus("Memproses pola wajah...");
      if (verifyFaceBtn) verifyFaceBtn.disabled = true;
      state.faceSignature = await createSignature(snapshot);
      setFaceStatus("Snapshot tersimpan. Lanjutkan verifikasi wajah.");
      if (verifyFaceBtn) verifyFaceBtn.disabled = false;
      state.faceVerified = false;
      state.lastVerifiedProfile = null;
    } catch (error) {
      setFaceStatus("Gagal memproses snapshot, coba ulangi.", "error");
      state.faceSignature = null;
      if (verifyFaceBtn) verifyFaceBtn.disabled = false;
      return;
    }
  }

  if (!state.faceImage || !state.faceSignature) {
    setFaceStatus("Ambil snapshot wajah yang valid terlebih dahulu.", "error");
    return;
  }

  const nimValue = nimField?.value?.trim();
  let enrolledProfile = null;
  let similarity = 0;
  let nimLookupFailed = false;

  if (nimValue) {
    enrolledProfile = state.enrolledFaces.find((face) => face.nim === nimValue);
    if (!enrolledProfile) {
      nimLookupFailed = true;
    } else if (!enrolledProfile.signature) {
      setFaceStatus(
        "Data wajah lama belum kompatibel. Registrasi ulang diperlukan.",
        "error"
      );
      return;
    }
  }

  setFaceStatus("Memverifikasi wajah terhadap basis data kampus...");
  if (verifyFaceBtn) {
    verifyFaceBtn.disabled = true;
  }
  await new Promise((resolve) => setTimeout(resolve, 900));

  if (!enrolledProfile) {
    let bestMatch = null;
    for (const face of state.enrolledFaces) {
      if (!face.signature) continue;
      const compare = compareSignatures(state.faceSignature, face.signature);
      if (!bestMatch || compare > bestMatch.similarity) {
        bestMatch = { face, similarity: compare };
      }
    }
    if (bestMatch && bestMatch.similarity >= MATCH_THRESHOLD) {
      enrolledProfile = bestMatch.face;
      similarity = bestMatch.similarity;
    }
  } else {
    similarity = compareSignatures(
      state.faceSignature,
      enrolledProfile.signature
    );
  }

  if (enrolledProfile && similarity >= MATCH_THRESHOLD) {
    state.faceVerified = true;
    state.lastVerifiedProfile = enrolledProfile;
    const percent = Math.round(similarity * 100);
    setFaceStatus(
      `Wajah cocok ${percent}%. Silakan lanjutkan absensi.`,
      "success"
    );
    if (verifyFaceBtn) {
      verifyFaceBtn.textContent = "Terverifikasi";
    }
    if (nimLookupFailed) {
      setFaceStatus(
        `Wajah cocok ${percent}%. NIM diperbarui otomatis.`,
        "success"
      );
    }
    if (nimField) {
      nimField.value = enrolledProfile.nim;
    }
    if (nameField) {
      nameField.value = enrolledProfile.nama;
    }
    if (kelasField && (enrolledProfile.prodi || enrolledProfile.kelas)) {
      kelasField.value = enrolledProfile.prodi || enrolledProfile.kelas;
    }
  } else {
    state.faceVerified = false;
    state.lastVerifiedProfile = null;
    if (verifyFaceBtn) {
      verifyFaceBtn.disabled = false;
    }
    if (nimLookupFailed) {
      setFaceStatus(
        "NIM ini belum terdaftar dan tidak ditemukan kecocokan wajah.",
        "error"
      );
    } else {
      setFaceStatus("Wajah tidak cocok dengan data tersimpan.", "error");
    }
  }
});

scrollHistoryBtn?.addEventListener("click", () => {
  recordsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
});

scrollAbsenBtn?.addEventListener("click", () => {
  recordsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
});

exportAttendanceBtn?.addEventListener("click", () => {
  const rows = state.records.map((entry) => {
    const dateObj = entry.timestamp ? new Date(entry.timestamp) : null;
    const tanggal = dateObj
      ? dateObj.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "-";
    const waktu = dateObj ? formatTime(dateObj) : entry.time ?? "-";
    return [
      tanggal,
      waktu,
      entry.nim,
      entry.nama,
      entry.kelas || entry.prodi || "-",
      entry.modeLabel,
      entry.mode,
      entry.faceCode || "",
      entry.timestamp || "",
    ];
  });
  exportToExcel(
    "riwayat-absensi-kampus.xls",
    [
      "Tanggal",
      "Waktu",
      "NIM",
      "Nama",
      "Kelas / Prodi",
      "Mode",
      "Jenis",
      "Kode Wajah",
      "Timestamp ISO",
    ],
    rows
  );
});

exportEnrollBtn?.addEventListener("click", () => {
  const rows = state.enrolledFaces.map((entry) => [
    entry.nim,
    entry.nama,
    entry.prodi || "-",
    entry.createdAt || "-",
    entry.faceCode || "",
  ]);
  exportToExcel(
    "riwayat-wajah-terdaftar.xls",
    ["NIM", "Nama", "Program Studi", "Tanggal Pendaftaran", "Kode Wajah"],
    rows
  );
});

window.addEventListener("beforeunload", () => {
  stopCamera();
  stopEnrollCamera();
});

updateDate();
renderRecords();
renderEnrolledFaces();

// Expose lightweight helpers for manual sync via browser console (no UI)
// Usage examples (paste in console):
//   sessionStorage.setItem('githubToken', 'ghp_xxx')
//   window.syncToGitHub.saveEnrolled()
//   window.syncToGitHub.saveAttendance()
window.syncToGitHub = {
  saveEnrolled: async () => {
    try {
      const res = await saveEnrolledToGitHub();
      console.info('saveEnrolled result', res);
      return res;
    } catch (e) {
      console.error('saveEnrolled error', e);
      throw e;
    }
  },
  saveAttendance: async () => {
    try {
      const res = await saveAttendanceToGitHub();
      console.info('saveAttendance result', res);
      return res;
    } catch (e) {
      console.error('saveAttendance error', e);
      throw e;
    }
  },
  setToken: (t) => sessionStorage.setItem('githubToken', t),
  clearToken: () => sessionStorage.removeItem('githubToken'),
  config: githubInlineConfig,
  lastStatus: () => lastGithubStatus,
};

// Expose CSV helpers as well
window.syncToGitHub.saveEnrolledCsv = async () => {
  try {
    const res = await saveCsvToGitHub({ which: 'enrolled' });
    console.info('saveEnrolledCsv result', res);
    return res;
  } catch (e) {
    console.error('saveEnrolledCsv error', e);
    throw e;
  }
};

window.syncToGitHub.saveAttendanceCsv = async () => {
  try {
    const res = await saveCsvToGitHub({ which: 'attendance' });
    console.info('saveAttendanceCsv result', res);
    return res;
  } catch (e) {
    console.error('saveAttendanceCsv error', e);
    throw e;
  }
};

// Debug helpers: test token/repo access and token status without writing files
window.syncToGitHub.testAuth = async () => {
  try {
    const cfg = readGithubConfig();
    const token = getSessionToken();
    console.info('GitHub config (from readGithubConfig):', cfg);
    if (!token) {
      console.warn('No GitHub token found. Set it via sessionStorage or window.syncToGitHub.setToken().');
      return { ok: false, error: 'no-token' };
    }
    if (!cfg || !cfg.owner || !cfg.repo) {
      console.warn('GitHub owner/repo not configured. Check githubInlineConfig in script.js');
      return { ok: false, error: 'no-repo-config' };
    }

    // Check authenticated user
    const userUrl = 'https://api.github.com/user';
    const userRes = await fetch(userUrl, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    let userBody = null;
    try {
      userBody = await userRes.json();
    } catch (e) {
      userBody = await userRes.text();
    }
    console.info('/user', userRes.status, userRes.statusText, userBody && userBody.login ? `login=${userBody.login}` : 'no-login');

    // Check repo access
    const repoUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;
    const repoRes = await fetch(repoUrl, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    let repoBody = null;
    try {
      repoBody = await repoRes.json();
    } catch (e) {
      repoBody = await repoRes.text();
    }
    console.info('/repos/:owner/:repo', repoRes.status, repoRes.statusText, repoBody && repoBody.full_name ? `repo=${repoBody.full_name}` : 'no-repo-info');

    return {
      ok: userRes.ok && repoRes.ok,
      user: { status: userRes.status, ok: userRes.ok, body: userBody },
      repo: { status: repoRes.status, ok: repoRes.ok, body: repoBody },
    };
  } catch (e) {
    console.error('testAuth error', e);
    throw e;
  }
};

window.syncToGitHub.tokenStatus = () => {
  const hasSession = !!sessionStorage.getItem('githubToken');
  const hasInline = !!githubInlineConfig.token;
  return {
    tokenInSession: true,
    tokenInlineInSource: hasInline,
    tokenPreview: hasSession ? 'session-token-set' : hasInline ? 'inline-token-present' : 'no-token',
    config: { owner: githubInlineConfig.owner, repo: githubInlineConfig.repo, branch: githubInlineConfig.branch },
  };
};

