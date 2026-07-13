(() => {

'use strict';
  console.log("Quiz Guard Actived");
  // ==================================================
  // HANYA JALAN DI HALAMAN ATTEMPT / SUMMARY KUIS
  // ==================================================
  const currentPath = window.location.pathname;
  const isAttemptPage = currentPath.includes("/mod/quiz/attempt.php");
  const isSummaryPage = currentPath.includes("/mod/quiz/summary.php");

  if (!isAttemptPage && !isSummaryPage) return;

  // ==================================================
  // KONFIGURASI
  // Ubah nilai di sini jika perlu menyesuaikan perilaku
  // ==================================================
  const CONFIG = {
    webhookURL:
      "https://script.google.com/macros/s/AKfycbwwsqiq2jFKSNspFPRx-5TpwALKfp7t_4AMG9_UtQOyV69a5kCMzGHbT1uHeKb6De8/exec",
    maxViolation: 5,
    toastDuration: 3000,       // durasi toast biasa (ms)
    violationCooldown: 2000,   // jeda minimal antar pelanggaran (ms)
    duplicateReasonWindow: 5000, // jeda agar alasan sama tidak dobel dihitung (ms)
    blurGraceMs: 1000          // toleransi sebelum "blur" dianggap pelanggaran (ms)
  };

  // ==================================================
  // HELPER: AKSES localStorage YANG AMAN
  // Supaya script tidak crash total jika localStorage
  // diblokir (mis. mode privasi ketat browser)
  // ==================================================
  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // Diamkan: jika gagal simpan, anti-cheat tetap jalan
      // untuk sesi ini, hanya tidak persist saat reload.
    }
  }

  // ==================================================
  // AMBIL ATTEMPT ID
  // ==================================================
  const attemptId =
    new URLSearchParams(window.location.search).get("attempt") ||
    storageGet("current_attempt_id");

  if (attemptId) {
    storageSet("current_attempt_id", attemptId);
  }

  const storageKey = "quiz_violation_" + (attemptId || "unknown");
  const terminatedKey = "quiz_terminated_" + (attemptId || "unknown");

  // ==================================================
  // BLOKIR AKSES JIKA SUDAH DITERMINASI SEBELUMNYA
  // ==================================================
  if (storageGet(terminatedKey) === "1" && isAttemptPage) {
    document.body.innerHTML = `
      <div style="display:flex;justify-content:center;align-items:center;
                  height:100vh;font-family:Arial,sans-serif;text-align:center;padding:30px;">
        <div>
          <h1>⛔ Attempt Dihentikan</h1>
          <p>Anda telah melebihi batas pelanggaran yang diperbolehkan.</p>
          <p>Anda akan dialihkan ke halaman ringkasan ujian.</p>
        </div>
      </div>`;

    setTimeout(function () {
      window.location.href = "/mod/quiz/summary.php?attempt=" + attemptId;
    }, 1500);

    return;
  }

  // ==================================================
  // STATE / DATA SESI
  // ==================================================
  let violationCount = parseInt(storageGet(storageKey), 10) || 0;
  let lastViolationTime = 0;
  let lastReason = "";

  let mouseOutsidePage = false;
  let lastMouseLeave = 0;

  let windowFocused = true;
  let blurTimeout = null;
  let blurViolation = false;      // dulu tidak dideklarasikan -> sudah diperbaiki
  let visibilityViolation = false;
  let internalNavigation = false; // menandai klik tombol navigasi resmi Moodle

  // ==================================================
  // DETEKSI IDENTITAS & KONTEKS (dipakai bersama, tidak duplikat lagi)
  // ==================================================
  function getTextFromSelectors(selectors, minLength) {
    for (let i = 0; i < selectors.length; i++) {
      const el = document.querySelector(selectors[i]);
      const text = el ? el.innerText.trim() : "";
      if (text !== "" && text.length > (minLength || 0)) {
        return text;
      }
    }
    return null;
  }

  function getFullname() {
    // Prioritas 1: alt text avatar (Moodle biasanya taruh nama lengkap di sini)
    const avatarImg = document.querySelector(".usermenu img[alt]");
    const altText = avatarImg ? (avatarImg.getAttribute("alt") || "").trim() : "";
    if (altText) return altText;

    // Prioritas 2: fallback ke elemen teks user, hindari inisial pendek
    return (
      getTextFromSelectors([".usermenu .usertext", ".usertext", ".logininfo a"], 3) ||
      "Unknown"
    );
  }

  function getUsername() {
    return (
      getTextFromSelectors(
        [".usermenu .usertext", ".usertext", ".username", ".logininfo a", ".logininfo"],
        0
      ) || "Unknown"
    );
  }

  function getEmailPrefix() {
    const emailLink = document.querySelector('a[href^="mailto:"]');
    if (!emailLink) return "Unknown";
    const address = emailLink.getAttribute("href").replace("mailto:", "").trim();
    return address.split("@")[0] || "Unknown";
  }

  function getCourseName() {
    const breadcrumbItems = document.querySelectorAll(".breadcrumb li, .breadcrumb-item");
    // Struktur breadcrumb Moodle biasanya: Home > Course > Quiz
    if (breadcrumbItems.length >= 2) {
      return breadcrumbItems[breadcrumbItems.length - 2].innerText.trim() || "Unknown";
    }
    return "Unknown";
  }

  function getQuizName() {
    return (
      getTextFromSelectors(["h1", ".page-header-headings h1", ".activity-header h1"], 0) ||
      "Unknown Quiz"
    );
  }

  // ==================================================
  // UI: KOTAK PENGHITUNG PELANGGARAN
  // ==================================================
  const counterBox = document.createElement("div");
  Object.assign(counterBox.style, {
    position: "fixed",
    top: "10px",
    right: "10px",
    color: "white",
    padding: "10px 15px",
    fontSize: "15px",
    fontWeight: "bold",
    borderRadius: "10px",
    zIndex: "999999",
    boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
    transition: "all 0.3s ease"
  });
  document.body.appendChild(counterBox);

  function updateCounter() {
    counterBox.innerHTML = "Pelanggaran: " + violationCount + "/" + CONFIG.maxViolation;

    if (violationCount <= 1) {
      counterBox.style.background = "#2e7d32"; // hijau
    } else if (violationCount < CONFIG.maxViolation) {
      counterBox.style.background = "#ef6c00"; // oranye
    } else {
      counterBox.style.background = "#d32f2f"; // merah
    }
  }
  updateCounter();

  // ==================================================
  // UI: TOAST NOTIFIKASI
  // ==================================================
  const toastContainer = document.createElement("div");
  Object.assign(toastContainer.style, {
    position: "fixed",
    top: "60px",
    right: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    zIndex: "9999999"
  });
  document.body.appendChild(toastContainer);

  let persistentViolationToast = null;

  function showToast(message, bgColor, persistent) {
    bgColor = bgColor || "#d32f2f";
    persistent = !!persistent;

    // Jangan buat toast permanen dobel
    if (persistent && persistentViolationToast) return;

    const toast = document.createElement("div");
    toast.innerHTML = message;
    Object.assign(toast.style, {
      background: bgColor,
      color: "white",
      padding: "14px 20px",
      borderRadius: "10px",
      fontSize: "14px",
      fontWeight: "bold",
      boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
      opacity: "0",
      transform: "translateY(-10px)",
      transition: "all 0.3s ease",
      maxWidth: "320px",
      wordBreak: "break-word",
      lineHeight: "1.4"
    });

    toastContainer.appendChild(toast);

    setTimeout(function () {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0px)";
    }, 100);

    if (persistent) {
      persistentViolationToast = toast;
      return;
    }

    setTimeout(function () {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-10px)";
      setTimeout(function () {
        toast.remove();
      }, 300);
    }, CONFIG.toastDuration);
  }

  function hidePersistentToast() {
    if (!persistentViolationToast) return;

    const toast = persistentViolationToast;
    persistentViolationToast = null;

    if (!toast || !toast.parentNode) return;

    // Hilangkan 3 detik setelah peserta kembali fokus
    setTimeout(function () {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-10px)";
      setTimeout(function () {
        if (toast.parentNode) toast.remove();
      }, 300);
    }, 3000);
  }

  // ==================================================
  // UI: OVERLAY BLUR (saat window/tab tidak fokus)
  // ==================================================
  const focusOverlay = document.createElement("div");
  Object.assign(focusOverlay.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    background: "rgba(0,0,0,0.35)",
    backdropFilter: "blur(5px)",
    zIndex: "999998",
    display: "none",
    pointerEvents: "none"
  });
  document.body.appendChild(focusOverlay);

  function flashOverlay() {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: "rgba(255,0,0,0.15)",
      zIndex: "999997",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 0.3s ease"
    });
    document.body.appendChild(overlay);

    setTimeout(function () {
      overlay.style.opacity = "1";
    }, 50);

    setTimeout(function () {
      overlay.style.opacity = "0";
      setTimeout(function () {
        overlay.remove();
      }, 300);
    }, 1200);
  }

  // ==================================================
  // KIRIM LOG AKTIVITAS KE GOOGLE SHEET
  // ==================================================
  function sendActivityLog(reason, type) {
    type = type || "warning";

    const data = {
      timestamp: new Date().toLocaleString(),
      type: type,
      attemptId: attemptId,
      username: getEmailPrefix(),
      user: getFullname(),
      course: getCourseName(),
      quiz: getQuizName(),
      violation: reason,
      total: violationCount,
      url: window.location.href,
      device: navigator.userAgent
    };

    console.log("QUIZ LOG:", data);

    const payload = new Blob([JSON.stringify(data)], { type: "text/plain" });

    // sendBeacon lebih andal saat halaman berpindah, tapi ada fallback
    // jika browser tidak mendukungnya atau pengiriman ditolak.
    let sent = false;
    if (navigator.sendBeacon) {
      sent = navigator.sendBeacon(CONFIG.webhookURL, payload);
    }
    if (!sent) {
      fetch(CONFIG.webhookURL, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "text/plain" },
        keepalive: true
      }).catch(function () {
        // Log gagal terkirim; tidak menghentikan jalannya anti-cheat.
        console.warn("QUIZ LOG: gagal mengirim log aktivitas.");
      });
    }
  }

  // ==================================================
  // HENTIKAN KUIS (setelah batas pelanggaran tercapai)
  // ==================================================
  function terminateQuiz() {
    storageSet(terminatedKey, "1");

    sendActivityLog("⛔ Attempt dihentikan karena batas pelanggaran tercapai", "terminate");

    showToast("⛔ Batas pelanggaran tercapai<br>Quiz akan dihentikan", "#000");

    const finishBtn = Array.from(document.querySelectorAll("button,input")).find(function (el) {
      const text = el.innerText || el.value || "";
      return (
        text.includes("Selesaikan") ||
        text.includes("Finish")
      );
    });

    if (finishBtn) {
      setTimeout(function () {
        finishBtn.click();
      }, 1500);
    }
  }

  // ==================================================
  // TAMBAH PELANGGARAN
  // ==================================================
  function addViolation(reason) {
    if (storageGet(terminatedKey) === "1") return;

    const now = Date.now();
    if (now - lastViolationTime < CONFIG.violationCooldown) return;
    if (reason === lastReason) return;

    lastViolationTime = now;
    lastReason = reason;
    setTimeout(function () {
      lastReason = "";
    }, CONFIG.duplicateReasonWindow);

    violationCount++;
    storageSet(storageKey, violationCount);
    updateCounter();

    sendActivityLog(reason, "violation");
    flashOverlay();

    showToast(
      "" + reason + "<br>Pelanggaran: " + violationCount + "/" + CONFIG.maxViolation
    );

    if (violationCount >= CONFIG.maxViolation) {
      terminateQuiz();
    }
  }

  // ==================================================
  // DETEKSI NAVIGASI RESMI MOODLE (agar tidak salah dianggap pelanggaran)
  // ==================================================
  const OFFICIAL_NAV_TEXTS = [
    "Finish attempt",
    "Selesaikan",
    "Submit all and finish",
    "Kirim dan selesai",
    "Return to attempt",
    "Kembali ke pengerjaan",
    "Next page",
    "Halaman berikutnya",
    "Previous page",
    "Halaman sebelumnya"
  ];

  document.addEventListener("click", function (e) {
    const text = e.target.innerText || e.target.value || "";
    if (OFFICIAL_NAV_TEXTS.some(function (t) { return text.includes(t); })) {
      internalNavigation = true;
    }
  });

  window.addEventListener("load", function () {
    internalNavigation = false;
  });

  // ==================================================
  // DETEKSI PINDAH TAB (visibilitychange)
  // ==================================================
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (internalNavigation) return;

      visibilityViolation = true;
      showToast("⚠️ Anda terdeteksi meninggalkan tab ujian", "#d32f2f", true);
      addViolation("⚠️ Anda terdeteksi meninggalkan tab ujian");
    } else if (visibilityViolation) {
      visibilityViolation = false;
      hidePersistentToast();
    }
  });

  // ==================================================
  // DETEKSI WINDOW BLUR / FOCUS
  // ==================================================
  window.addEventListener("blur", function () {
    if (internalNavigation) return;

    windowFocused = false;
    focusOverlay.style.display = "block";

    blurTimeout = setTimeout(function () {
      if (!windowFocused) {
        blurViolation = true;
        showToast("⚠️ Fokus keluar dari halaman ujian", "#d32f2f", true);
        addViolation("⚠️ Fokus keluar dari halaman ujian");
      }
    }, CONFIG.blurGraceMs);
  });

  window.addEventListener("focus", function () {
    windowFocused = true;
    clearTimeout(blurTimeout);

    if (!mouseOutsidePage) {
      focusOverlay.style.display = "none";
    }

    if (blurViolation) {
      blurViolation = false;
      hidePersistentToast();
    }
  });

  // ==================================================
  // DETEKSI KURSOR KELUAR / MASUK HALAMAN
  // ==================================================
  document.addEventListener("mouseout", function (e) {
    if (e.relatedTarget || e.toElement) return;

    const now = Date.now();
    if (now - lastMouseLeave < 3000) return;
    lastMouseLeave = now;

    if (mouseOutsidePage) return;
    mouseOutsidePage = true;

    focusOverlay.style.display = "block";
    showToast("ℹ️ Cursor keluar dari halaman ujian", "#42a5f5");
    sendActivityLog("ℹ️ Cursor keluar dari halaman ujian", "warning");
  });

  document.addEventListener("mouseenter", function () {
    if (mouseOutsidePage) {
      mouseOutsidePage = false;
      focusOverlay.style.display = "none";
    }
  });

  // ==================================================
  // BLOKIR TOMBOL "LANJUTKAN/RESUME" SETELAH TERMINASI
  // ==================================================
  function disableAttemptButtons() {
    if (storageGet(terminatedKey) !== "1") return;

    const BLOCKED_TEXTS = ["Mengerjakan kembali", "Kembali", "Resume", "Continue", "Attempt"];

    Array.from(document.querySelectorAll("button, a, input")).forEach(function (el) {
      const text = (el.innerText || el.value || "").trim();
      if (BLOCKED_TEXTS.some(function (t) { return text.includes(t); })) {
        el.disabled = true;
        el.style.pointerEvents = "none";
        el.style.opacity = "0.5";
      }
    });
  }
  disableAttemptButtons();

  // ==================================================
  // ANTI COPY / PASTE / CUT / KLIK KANAN / SHORTCUT
  // Catatan: ini bukan proteksi mutlak (siswa masih bisa
  // screenshot, foto layar, atau pakai perangkat lain),
  // tapi cukup untuk mencegah copy-paste kasual.
  // ==================================================
  document.body.style.userSelect = "none";

  document.addEventListener("dragstart", function (e) {
    e.preventDefault();
  });

  function blockAndLog(eventName, message) {
    document.addEventListener(eventName, function (e) {
      e.preventDefault();
      showToast(message, "#6a1b9a");
      sendActivityLog(message, "warning");
    });
  }

  blockAndLog("copy", "ℹ️ Copy tidak diizinkan");
  blockAndLog("paste", "ℹ️ Paste tidak diizinkan");
  blockAndLog("cut", "ℹ️ Cut tidak diizinkan");
  blockAndLog("contextmenu", "ℹ️ Klik kanan dinonaktifkan");

  document.addEventListener("keydown", function (e) {
    const key = (e.key || "").toLowerCase();
    const isCtrlCombo = (e.ctrlKey || e.metaKey) && ["c", "v", "x", "a", "u"].includes(key);

    if (isCtrlCombo) {
      e.preventDefault();
      showToast("ℹ️ Shortcut tidak diizinkan", "#6a1b9a");
      sendActivityLog("ℹ️ Shortcut tidak diizinkan", "warning");
    }
  });

  // Bersihkan referensi fungsi yang tidak lagi dipakai langsung
  // (dipertahankan untuk konsistensi/reuse di masa depan)
  void getUsername;
})();
