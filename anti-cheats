(() => {

'use strict';
console.log("ANTI CHEAT STARTED");
	
    // ==================================================
    // HANYA AKTIF DI QUIZ
    // ==================================================

    if(!window.location.href.includes('/quiz/')){
        return;
    }

    // ==================================================
    // AMBIL ATTEMPT ID
    // ==================================================

    const attemptId =
        new URLSearchParams(window.location.search)
        .get('attempt');

    if(!attemptId){
        return;
    }

    // ==================================================
    // CONFIG
    // ==================================================

	const webhookURL = 
		"https://script.google.com/macros/s/AKfycbwwsqiq2jFKSNspFPRx-5TpwALKfp7t_4AMG9_UtQOyV69a5kCMzGHbT1uHeKb6De8/exec";

    const maxViolation = 5;

    const toastDuration = 3000;

    const violationCooldown = 5000;

    // ==================================================
    // STORAGE
    // ==================================================

    const storageKey =
        "quiz_violation_" + attemptId;

    const terminatedKey =
        "quiz_terminated_" + attemptId;

    // ==================================================
    // DATA
    // ==================================================

    let violationCount =
        parseInt(localStorage.getItem(storageKey)) || 0;

    let lastViolationTime = 0;

    let mouseOutsidePage = false;
	let lastMouseLeave = 0;
	let blurTimeout = null;
	let windowFocused = true;
	let lastReason = "";

	// ==================================================
	// GET USERNAME
	// ==================================================

	function getUsername(){

		const selectors = [

			".usermenu .usertext",
			".usertext",
			".username",
			".logininfo a",
			".logininfo"

		];

		for(let i = 0; i < selectors.length; i++){

			const el =
				document.querySelector(
					selectors[i]
				);

			if(
				el &&
				el.innerText.trim() !== ""
			){

				return el.innerText.trim();

			}

		}

		return "Unknown";

	}

	// ==================================================
	// GET QUIZ NAME
	// ==================================================

	function getQuizName(){

		const selectors = [

			"h1",
			".page-header-headings h1",
			".activity-header h1"

		];

		for(let i = 0; i < selectors.length; i++){

			const el =
				document.querySelector(
					selectors[i]
				);

			if(
				el &&
				el.innerText.trim() !== ""
			){

				return el.innerText.trim();

			}

		}

		return "Unknown Quiz";

	}
	
    // ==================================================
    // COUNTER BOX
    // ==================================================

    const counterBox =
        document.createElement("div");

    counterBox.style.position = "fixed";
    counterBox.style.top = "10px";
    counterBox.style.right = "10px";
    counterBox.style.color = "white";
    counterBox.style.padding = "10px 15px";
    counterBox.style.fontSize = "15px";
    counterBox.style.fontWeight = "bold";
    counterBox.style.borderRadius = "10px";
    counterBox.style.zIndex = "999999";
    counterBox.style.boxShadow =
        "0 4px 10px rgba(0,0,0,0.3)";
    counterBox.style.transition =
        "all 0.3s ease";

    document.body.appendChild(counterBox);

    // ==================================================
    // UPDATE COUNTER
    // ==================================================

    function updateCounter(){

        counterBox.innerHTML =
            "Pelanggaran: " +
            violationCount +
            "/" +
            maxViolation;

        // HIJAU
        if(violationCount <= 1){

            counterBox.style.background =
                "#2e7d32";

        }

        // ORANYE
        else if(
            violationCount >= 2 &&
            violationCount < maxViolation
        ){

            counterBox.style.background =
                "#ef6c00";

        }

        // MERAH
        else{

            counterBox.style.background =
                "#d32f2f";

        }

    }

    updateCounter();
	
	// ==================================================
	// TOAST CONTAINER
	// ==================================================

	const toastContainer =
		document.createElement("div");

	toastContainer.style.position = "fixed";

	toastContainer.style.top = "60px";

	toastContainer.style.right = "10px";

	toastContainer.style.display = "flex";

	toastContainer.style.flexDirection =
		"column";

	toastContainer.style.gap = "10px";

	toastContainer.style.zIndex = "9999999";

	document.body.appendChild(
		toastContainer
	);
	
    // ==================================================
    // TOAST
    // ==================================================

    function showToast(
        message,
        bgColor = "#d32f2f"
    ){

        const toast =
            document.createElement("div");

        toast.innerHTML = message;

        toast.style.background = bgColor;
        toast.style.color = "white";
        toast.style.padding = "14px 20px";
        toast.style.borderRadius = "10px";
        toast.style.fontSize = "14px";
        toast.style.fontWeight = "bold";
        toast.style.zIndex = "9999999";
        toast.style.boxShadow =
            "0 4px 10px rgba(0,0,0,0.3)";
        toast.style.opacity = "0";
        toast.style.transform =
            "translateY(-10px)";
        toast.style.transition =
            "all 0.3s ease";
		toast.style.maxWidth = "320px";
		toast.style.wordBreak =
			"break-word";
		toast.style.lineHeight =
			"1.4";
	
        toastContainer.appendChild(toast);

        // Fade in
        setTimeout(function(){

            toast.style.opacity = "1";

            toast.style.transform =
                "translateY(0px)";

        }, 100);

        // Fade out
        setTimeout(function(){

            toast.style.opacity = "0";

            toast.style.transform =
                "translateY(-10px)";

            setTimeout(function(){

                toast.remove();

            }, 300);

        }, toastDuration);

    }

    // ==================================================
    // BLUR OVERLAY
    // ==================================================

    const focusOverlay =
        document.createElement("div");

    focusOverlay.style.position = "fixed";
    focusOverlay.style.top = "0";
    focusOverlay.style.left = "0";
    focusOverlay.style.width = "100%";
    focusOverlay.style.height = "100%";
    focusOverlay.style.background =
        "rgba(0,0,0,0.35)";
    focusOverlay.style.backdropFilter =
        "blur(5px)";
    focusOverlay.style.zIndex = "999998";
    focusOverlay.style.display = "none";
    focusOverlay.style.pointerEvents = "none";

    document.body.appendChild(focusOverlay);

    // ==================================================
    // FLASH OVERLAY
    // ==================================================

    function flashOverlay(){

        const overlay =
            document.createElement("div");

        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.background =
            "rgba(255,0,0,0.15)";
        overlay.style.zIndex = "999997";
        overlay.style.pointerEvents = "none";
        overlay.style.opacity = "0";
        overlay.style.transition =
            "opacity 0.3s ease";

        document.body.appendChild(overlay);

        setTimeout(function(){

            overlay.style.opacity = "1";

        }, 50);

        setTimeout(function(){

            overlay.style.opacity = "0";

            setTimeout(function(){

                overlay.remove();

            }, 300);

        }, 1200);

    }

    // ==================================================
    // TERMINATE QUIZ
    // ==================================================

    function terminateQuiz(){

        localStorage.setItem(
            terminatedKey,
            "1"
        );

        showToast(
            "⛔ Batas pelanggaran tercapai<br>" +
            "Quiz akan dihentikan",
            "#000"
        );
		sendActivityLog(
			"⛔ Batas pelanggaran tercapai",
		"warning"
		);
		
        // Cari tombol selesai
        let finishBtn =
            Array.from(
                document.querySelectorAll(
                    "button, input"
                )
            ).find(function(el){

                return (

                    el.innerText?.includes("Selesaikan") ||
                    el.value?.includes("Selesaikan") ||

                    el.innerText?.includes("Finish") ||
                    el.value?.includes("Finish")

                );

            });

        // Auto klik
        if(finishBtn){

            setTimeout(function(){

                finishBtn.click();

            }, 2000);

        }

    }

    // ==================================================
    // ADD VIOLATION
    // ==================================================

	// ==================================================
	// SEND LOG TO GOOGLE SHEET
	// ==================================================

	function sendActivityLog(
		reason,
		type = "warning"
	){
		
	// ==========================================
	// FULLNAME USER
	// ==========================================

	let fullname = "Unknown";

	// PRIORITAS 1
	// Moodle biasanya simpan fullname di alt avatar
	const avatarImg =
		document.querySelector(
			'.usermenu img[alt]'
		);

	if(
		avatarImg &&
		avatarImg.getAttribute("alt")
	){

		fullname =
			avatarImg
			.getAttribute("alt")
			.trim();

	}

	// PRIORITAS 2
	// Fallback jika gagal
	if(fullname === "Unknown"){

		const fullnameSelectors = [

			".usermenu .usertext",
			".usertext",
			".logininfo a"

		];

		for(let i = 0; i < fullnameSelectors.length; i++){

			const el =
				document.querySelector(
					fullnameSelectors[i]
				);

			if(
				el &&
				el.textContent.trim() !== ""
			){

				// Hindari inisial seperti SK
				if(
					el.textContent.trim().length > 3
				){

					fullname =
						el.textContent.trim();

					break;

				}

			}

		}

	}

	// ==========================================
	// EMAIL USER
	// ==========================================

	let username = "Unknown";

	// Cari email dari link mailto:
	const emailLink =
		document.querySelector(
			'a[href^="mailto:"]'
		);

	if(emailLink){

		username =
			emailLink
			.getAttribute("href")
			.replace("mailto:", "")
			.trim()
			.split("@")[0];

	}

	// ==========================================
	// COURSE NAME
	// ==========================================

	let courseName = "Unknown";

	// Cari breadcrumb Moodle
	const breadcrumbItems =
		document.querySelectorAll(

			".breadcrumb li, .breadcrumb-item"

		);

	// Biasanya:
	// Home > Course > Quiz

	if(breadcrumbItems.length >= 2){

		// Ambil item sebelum quiz
		courseName =
			breadcrumbItems[
				breadcrumbItems.length - 2
			].innerText.trim();

	}

	// ==========================================
	// QUIZ NAME
	// ==========================================

	let quizName = "Unknown";

	const quizEl =
		document.querySelector("h1");

	if(
		quizEl &&
		quizEl.textContent.trim() !== ""
	){

		quizName =
			quizEl.textContent.trim();

	}
    // ==========================================
    // DATA
    // ==========================================

    const data = {
		timestamp:
			new Date().toLocaleString(),
			
		type: type,
		
        attemptId:
            attemptId,

        username:
            username,

        user:
            fullname,

        course:
            courseName,

        quiz:
            quizName,

        violation:
            reason,

        total:
            violationCount,

        url:
            window.location.href,

        device:
            navigator.userAgent

    };

    // ==========================================
    // DEBUG CONSOLE
    // ==========================================

    console.log(
        "QUIZ LOG:",
        data
    );

    // ==========================================
    // SEND TO GOOGLE SHEET
    // ==========================================

    navigator.sendBeacon(

        webhookURL,

        new Blob(

            [JSON.stringify(data)],

            {
                type: "text/plain"
            }

        )

    );

}
    function addViolation(reason){

        // Stop jika terminate
        if(
            localStorage.getItem(terminatedKey)
            === "1"
        ){
            return;
        }

        // Anti double count
        const now = Date.now();

        if(
            now - lastViolationTime
            < violationCooldown
        ){
            return;
        }

		if(reason === lastReason){
			return;
		}
		lastViolationTime = now;
		
		lastReason = reason;
		
		setTimeout(function(){
			lastReason = "";
		}, 5000);

        // Tambah violation
        violationCount++;

        // Simpan
        localStorage.setItem(
            storageKey,
            violationCount
        );

        // Update UI
        updateCounter();
		
		// Kirim log
		sendActivityLog(
			reason,
			"violation"
		);

        // Flash
        flashOverlay();

        // Toast
        showToast(
            "" + reason + "<br>" +
            "Pelanggaran: " +
            violationCount +
            "/" +
            maxViolation
        );

        // Terminate
        if(
            violationCount >= maxViolation
        ){

            terminateQuiz();

        }

    }

    // ==================================================
    // TAB SWITCH
    // ==================================================
document.addEventListener(
    "visibilitychange",
    function(){

        if(document.hidden){

            addViolation(
                "⚠️ Anda terdeteksi meninggalkan tab ujian"
            );
        }

    }
);
window.addEventListener(
    "blur",
    function(){

        windowFocused = false;

        focusOverlay.style.display =
            "block";

        // Tunggu 2 detik
        blurTimeout = setTimeout(function(){

            // Jika masih unfocus
            if(!windowFocused){

                addViolation(
                    "⚠️ Fokus keluar dari halaman ujian"
                );
            }

        }, 2000);

    }
);

    // ==================================================
    // WINDOW FOCUS
    // ==================================================

window.addEventListener(
    "focus",
    function(){

        windowFocused = true;

        // Batalkan violation blur
        clearTimeout(blurTimeout);

        if(!mouseOutsidePage){

            focusOverlay.style.display =
                "none";

        }

    }
);

    // ==================================================
    // MOUSE OUTSIDE WINDOW
    // ==================================================

	document.addEventListener(
		"mouseout",
		function(e){

			// Pastikan benar-benar keluar window
			if(
				!e.relatedTarget &&
				!e.toElement
			){

				const now = Date.now();

				// Cooldown 3 detik
				if(
					now - lastMouseLeave
					< 3000
				){
					return;
				}

				lastMouseLeave = now;

				// Hindari spam
				if(mouseOutsidePage){
					return;
				}

				mouseOutsidePage = true;

				focusOverlay.style.display =
					"block";

				showToast(
					"ℹ️ Cursor keluar dari halaman ujian",
					"#42a5f5"
				);
				sendActivityLog(
					"ℹ️ Cursor keluar dari halaman ujian",
					"warning"
				);
			}

		}
	);

    // ==================================================
    // MOUSE KEMBALI
    // ==================================================

    document.addEventListener(
        "mouseenter",
        function(){

            if(mouseOutsidePage){

                mouseOutsidePage = false;

                // Hilangkan blur
                focusOverlay.style.display =
                    "none";

            }

        }
    );

    // ==================================================
    // BLOK RESUME
    // ==================================================

    function disableAttemptButtons(){

        if(
            localStorage.getItem(terminatedKey)
            !== "1"
        ){
            return;
        }

        Array.from(
            document.querySelectorAll(
                "button, a, input"
            )
        ).forEach(function(el){

            const text =
                el.innerText?.trim() ||
                el.value?.trim() ||
                "";

            if(

                text.includes("Mengerjakan kembali") ||
                text.includes("Kembali") ||
                text.includes("Resume") ||
                text.includes("Continue") ||
                text.includes("Attempt")

            ){

                el.disabled = true;

                el.style.pointerEvents =
                    "none";

                el.style.opacity = "0.5";

            }

        });

    }

    disableAttemptButtons();

    // ==================================================
    // ANTI COPY PASTE
    // ==================================================

    // Disable select text
    document.body.style.userSelect =
        "none";

    // Disable drag
    document.addEventListener(
        "dragstart",
        function(e){

            e.preventDefault();

        }
    );

    // Disable copy
    document.addEventListener(
        "copy",
        function(e){

            e.preventDefault();

            showToast(
                "ℹ️ Copy tidak diizinkan",
                "#6a1b9a"
            );
			sendActivityLog(
				"ℹ️ Copy tidak diizinkan",
				"warning"
			);
        }
    );

    // Disable paste
    document.addEventListener(
        "paste",
        function(e){

            e.preventDefault();

            showToast(
                "ℹ️ Paste tidak diizinkan",
                "#6a1b9a"
            );
			sendActivityLog(
				"ℹ️ Paste tidak diizinkan",
				"warning"
			);
        }
    );

    // Disable cut
    document.addEventListener(
        "cut",
        function(e){

            e.preventDefault();

            showToast(
                "ℹ️ Cut tidak diizinkan",
                "#6a1b9a"
            );
			sendActivityLog(
					"ℹ️ Cut tidak diizinkan",
					"warning"
				);
        }
    );

    // Disable right click
    document.addEventListener(
        "contextmenu",
        function(e){

            e.preventDefault();

            showToast(
				"ℹ️ Klik kanan dinonaktifkan",
				"#6a1b9a"
			);

			sendActivityLog(
				"ℹ️ Klik kanan dinonaktifkan",
				"warning"
			);

        }
    );

    // Disable shortcut
    document.addEventListener(
        "keydown",
        function(e){

            if(

                (e.ctrlKey || e.metaKey)

                &&

                (

                    e.key === "c" ||
                    e.key === "C" ||

                    e.key === "v" ||
                    e.key === "V" ||

                    e.key === "x" ||
                    e.key === "X" ||

                    e.key === "a" ||
                    e.key === "A" ||

                    e.key === "u" ||
                    e.key === "U"

                )

            ){

                e.preventDefault();

                showToast(
                    "ℹ️ Shortcut tidak diizinkan",
                    "#6a1b9a"
                );
				sendActivityLog(
					"ℹ️ Shortcut tidak diizinkan",
					"warning"
				);
            }

        }
    );

})();
