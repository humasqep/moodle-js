(() => {

'use strict';
console.log("ANTI CHEAT STARTED");
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
          <h1>⛔ Pengerjaan Dihentikan</h1>
          <p>Anda telah melebihi batas pelanggaran yang diperbolehkan.</p>
          <p>Pilih "Submit all and finish" untuk lanjut ke subtes berikutnya</p>
        </div>
      </div>`;

    setTimeout(function () {
      window.location.href = "/mod/quiz/summary.php?attempt=" + attemptId;
    }, 2500);

    return;
  }

  // ==================================================
  // STATE / DATA SESI
  // ==================================================
  let violationCount = parseInt(storageGet(storageKey), 10) || 0;
  let lastViolationTime = 0;
  let lastReason = "";

  let mouseOutsidePage = false;

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
    // Dipertahankan sebagai fallback instan (biasanya "Unknown" di
    // halaman attempt/summary karena Moodle memang tidak menampilkan
    // email di sana), sambil menunggu hasil dari getCachedEmailPrefix().
    const emailLink = document.querySelector(
      '.usermenu a[href^="mailto:"], .logininfo a[href^="mailto:"]'
    );
    if (!emailLink) return "Unknown";
    const address = emailLink.getAttribute("href").replace("mailto:", "").trim();
    return decodeEmailHref(address).split("@")[0] || "Unknown";
  }

  function decodeEmailHref(rawAddress) {
    try {
      return decodeURIComponent(rawAddress);
    } catch (e) {
      return rawAddress;
    }
  }

  function extractProfileEmailLink(doc) {
    // Prioritas 1: cari khusus di area konten utama halaman profil,
    // supaya tidak salah tangkap link mailto header/footer situs
    // (yang sama muncul di semua halaman, seperti email humas/kontak).
    const scopedLink = doc.querySelector(
      '#region-main a[href^="mailto:"], .userprofile a[href^="mailto:"], #page-content a[href^="mailto:"]'
    );
    if (scopedLink) return scopedLink;

    // Prioritas 2: cari lewat label "Email address" (pola dt/dd khas
    // halaman profil Moodle), lebih tahan terhadap perbedaan tema.
    const dtElements = Array.from(doc.querySelectorAll("dt"));
    const emailDt = dtElements.find(function (dt) {
      return /email/i.test(dt.textContent);
    });
    if (emailDt && emailDt.nextElementSibling) {
      const link = emailDt.nextElementSibling.querySelector('a[href^="mailto:"]');
      if (link) return link;
    }

    return null;
  }

  // ==================================================
  // AMBIL EMAIL DARI HALAMAN PROFIL (async, di-cache)
  // Halaman attempt/summary biasanya tidak menampilkan email siswa,
  // tapi halaman profil siswa sendiri menampilkannya (walau
  // di-obfuscate). Kita ambil sekali lewat fetch, lalu simpan cache
  // supaya tidak perlu request ulang setiap kali ada event.
  // ==================================================
  let emailPrefixCache = null;
  let emailPrefixPromise = null;

  function getCachedEmailPrefix() {
    if (emailPrefixCache !== null) return Promise.resolve(emailPrefixCache);
    if (emailPrefixPromise) return emailPrefixPromise;

    const userId = getMoodleUserId();
    if (userId === "Unknown") {
      emailPrefixCache = getEmailPrefix();
      return Promise.resolve(emailPrefixCache);
    }

    const cacheKey = "moodle_email_prefix_v2_" + userId;
    const cachedLocal = storageGet(cacheKey);
    if (cachedLocal) {
      emailPrefixCache = cachedLocal;
      return Promise.resolve(emailPrefixCache);
    }

    emailPrefixPromise = fetch("/user/profile.php?id=" + encodeURIComponent(userId), {
      credentials: "same-origin"
    })
      .then(function (res) {
        return res.text();
      })
      .then(function (html) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const link = extractProfileEmailLink(doc);
        if (!link) return getEmailPrefix(); // fallback ke hasil scan halaman saat ini

        const rawAddress = link.getAttribute("href").replace(/^mailto:/, "");
        const decoded = decodeEmailHref(rawAddress);
        const prefix = decoded.split("@")[0] || "Unknown";

        storageSet(cacheKey, prefix);
        return prefix;
      })
      .catch(function () {
        return getEmailPrefix();
      })
      .then(function (result) {
        emailPrefixCache = result;
        return result;
      });

    return emailPrefixPromise;
  }

  function getCourseName() {
    // Prioritas 1: cari link breadcrumb yang benar-benar menuju halaman course
    // (lebih andal daripada menebak posisi, karena posisi breadcrumb bisa
    // berbeda-beda tergantung kategori/tema Moodle yang dipakai)
    const courseLink = document.querySelector(
      '.breadcrumb a[href*="/course/view.php"], .breadcrumb-item a[href*="/course/view.php"]'
    );
    if (courseLink && courseLink.innerText.trim() !== "") {
      return courseLink.innerText.trim();
    }

    // Prioritas 2: fallback ke posisi breadcrumb (perilaku lama, kurang akurat)
    const breadcrumbItems = document.querySelectorAll(".breadcrumb li, .breadcrumb-item");
    if (breadcrumbItems.length >= 2) {
      return breadcrumbItems[breadcrumbItems.length - 2].innerText.trim() || "Unknown";
    }
    return "Unknown";
  }

  function getMoodleUserId() {
    // Coba beberapa pola yang umum dipakai berbagai tema Moodle,
    // dari yang paling spesifik ke yang paling umum.
    const linkSelectors = [
      '.usermenu a[href*="/user/view.php"]',
      '.usermenu a[href*="/user/profile.php"]',
      '.logininfo a[href*="/user/view.php"]',
      '.logininfo a[href*="/user/profile.php"]',
      'a[href*="/user/profile.php?id="]',
      'a[href*="/user/view.php?id="]'
    ];

    for (let i = 0; i < linkSelectors.length; i++) {
      const link = document.querySelector(linkSelectors[i]);
      const id = extractIdFromHref(link);
      if (id) return id;
    }

    // Fallback: elemen foto profil (userpicture) hampir selalu ada
    // di semua tema Moodle dan biasanya dibungkus tag <a> menuju profil.
    const avatarEl = document.querySelector(".userpicture, .usermenu img");
    const avatarLink = avatarEl ? avatarEl.closest("a") : null;
    const avatarId = extractIdFromHref(avatarLink);
    if (avatarId) return avatarId;

    return "Unknown";
  }

  function extractIdFromHref(linkEl) {
    if (!linkEl) return null;
    try {
      const url = new URL(linkEl.getAttribute("href"), window.location.origin);
      return url.searchParams.get("id");
    } catch (e) {
      return null;
    }
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
  // THROTTLE LOG INFO (bukan pelanggaran)
  // Mencegah spam ke spreadsheet untuk event yang bisa
  // terjadi berkali-kali dalam waktu singkat, seperti
  // kursor keluar-masuk, klik kanan berulang, dll.
  // Pelanggaran resmi (lewat addViolation) sudah punya
  // cooldown-nya sendiri dan tidak terpengaruh ini.
  // ==================================================
  const INFO_LOG_COOLDOWN_MS = 4000;
  const lastInfoLogTime = {};

  function shouldThrottleInfoLog(reason) {
    const now = Date.now();
    const last = lastInfoLogTime[reason] || 0;
    if (now - last < INFO_LOG_COOLDOWN_MS) return true;
    lastInfoLogTime[reason] = now;
    return false;
  }

  // ==================================================
  // KIRIM LOG AKTIVITAS KE GOOGLE SHEET
  // ==================================================
  function sendActivityLog(reason, type) {
    type = type || "warning";

    // Hanya throttle log bertipe "warning" (info), bukan
    // "violation" atau "terminate" yang memang harus selalu tercatat.
    if (type === "warning" && shouldThrottleInfoLog(reason)) return;

    // Email diambil secara async (lihat getCachedEmailPrefix), jadi
    // pengiriman log ditunda sedikit sampai hasilnya siap. Untuk log
    // pertama di sesi ini biasanya butuh 1x fetch (beberapa ratus ms),
    // setelah itu langsung dari cache.
    getCachedEmailPrefix().then(function (emailPrefix) {
      sendActivityLogWithEmail(reason, type, emailPrefix);
    });
  }

  function sendActivityLogWithEmail(reason, type, emailPrefix) {

    const data = {
      timestamp: new Date().toLocaleString(),
      type: type,
      attemptId: attemptId,
      userId: getMoodleUserId(),
      username: emailPrefix,
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

    sendActivityLog("⛔ Tes dihentikan (batas pelanggaran tercapai)", "terminate");

    showToast("⛔ Batas pelanggaran tercapai<br>Tes akan dihentikan", "#000");

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

  // Refresh (F5, Ctrl+R, tombol reload browser) atau menutup
  // tab/window juga memicu blur/visibilitychange sesaat sebelum
  // halaman benar-benar berpindah. Tandai sebagai navigasi resmi
  // supaya tidak salah dianggap "meninggalkan halaman ujian".
  window.addEventListener("beforeunload", function () {
    internalNavigation = true;
  });

  // ==================================================
  // DETEKSI PINDAH TAB (visibilitychange)
  // ==================================================
  let visibilityTimeout = null;

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (internalNavigation) return;

      // Diberi jeda toleransi (sama seperti deteksi blur). Kalau ini
      // ternyata refresh/reload, halaman akan hancur/berpindah SEBELUM
      // jeda ini selesai, sehingga pelanggaran tidak pernah tercatat.
      // Kalau ini benar pindah tab (halaman lama tetap hidup di
      // background), jeda ini akan selesai normal dan tetap tercatat.
      clearTimeout(visibilityTimeout);
      visibilityTimeout = setTimeout(function () {
        if (!document.hidden || internalNavigation) return;

        visibilityViolation = true;
        showToast("⚠️ Meninggalkan tab ujian", "#d32f2f", true);
        addViolation("⚠️ Meninggalkan tab ujian");
      }, CONFIG.blurGraceMs);
    } else {
      clearTimeout(visibilityTimeout);
      if (visibilityViolation) {
        visibilityViolation = false;
        hidePersistentToast();
      }
    }
  });

  // ==================================================
  // BERSIHKAN STATUS BLUR/OVERLAY SECARA TERPUSAT
  // Dipanggil dari beberapa event (mouseenter, mousemove, focus)
  // supaya overlay & notifikasi blur tidak pernah "nyangkut" hanya
  // karena window tidak benar-benar refocus (butuh klik), padahal
  // kursor sudah aktif kembali di halaman.
  // ==================================================
  function clearBlurState() {
    windowFocused = true;
    clearTimeout(blurTimeout);
    focusOverlay.style.display = "none";

    if (blurViolation) {
      blurViolation = false;
      hidePersistentToast();
    }
  }

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
        showToast("⚠️ Meninggalkan halaman ujian", "#d32f2f", true);
        addViolation("⚠️ Meninggalkan halaman ujian");
      }
    }, CONFIG.blurGraceMs);
  });

  window.addEventListener("focus", function () {
    clearBlurState();
    if (mouseOutsidePage) {
      // Window fokus lagi tapi kursor masih di luar -> overlay
      // tetap ditampilkan untuk kasus ini saja.
      focusOverlay.style.display = "block";
    }
  });

  // ==================================================
  // DETEKSI KURSOR KELUAR / MASUK HALAMAN
  // ==================================================
  document.addEventListener("mouseout", function (e) {
    if (e.relatedTarget || e.toElement) return;
    if (mouseOutsidePage) return;
    mouseOutsidePage = true;

    focusOverlay.style.display = "block";
    showToast("ℹ️ Cursor keluar dari halaman ujian", "#42a5f5");
    // Pengiriman log tetap dibatasi lewat shouldThrottleInfoLog()
    // di dalam sendActivityLog, jadi overlay boleh merespons instan
    // tanpa membuat spreadsheet kebanjiran data.
    sendActivityLog("ℹ️ Cursor keluar dari halaman ujian", "warning");
  });

  document.addEventListener("mouseenter", function () {
    mouseOutsidePage = false;
    // Kursor kembali ke halaman = anggap siswa sudah kembali,
    // bersihkan juga status blur meski window belum "focus" resmi
    // (mis. karena cuma gerak mouse tanpa klik).
    clearBlurState();
  });

  // Jaring pengaman tambahan: gerakan mouse apa pun di dalam halaman
  // memastikan overlay/notifikasi blur tidak pernah nyangkut, apa pun
  // urutan event yang terjadi sebelumnya.
  let lastMouseMoveClear = 0;
  document.addEventListener("mousemove", function () {
    const now = Date.now();
    if (now - lastMouseMoveClear < 500) return; // dibatasi, cukup ringan
    lastMouseMoveClear = now;

    if (mouseOutsidePage || blurViolation || !windowFocused) {
      mouseOutsidePage = false;
      clearBlurState();
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

  // Mulai ambil email siswa di awal (background), supaya saat ada
  // pelanggaran pertama datanya sudah siap tanpa harus menunggu.
  getCachedEmailPrefix();

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
