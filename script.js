document.addEventListener("DOMContentLoaded", () => {
    // =========================================
    // 1. CẤU HÌNH GITHUB REPO & CƠ SỞ DỮ LIỆU
    // =========================================
    const GITHUB_CONFIG = {
        owner: "luanvu2003",
        repo: "GiaDinhConChauOngBaVinh",
        branch: "main",
        tokenStorageKey: "gdv_github_token"
    };

    const DEFAULT_GROUPS = [
        "Gia Đình Ông Bà",
        "Gia Đình Bác Quang",
        "Gia Đình Bác Hòa",
        "Gia Đình Bác Hợp",
        "Gia Đình Bác Thọ",
        "Gia Đình Bác Thông",
        "Gia Đình Dì Nga",
        "Gia Đình Cậu Thắng",
        "Gia Đình Cậu Thành Út"
    ];

    let allData = [];
    let activeYear = null;
    let currentEvent = null;
    let selectedUploadFiles = [];
    let selectedCoverFile = null;

    // CÁC ELEMENT CHÍNH
    const eventsGrid = document.querySelector('.grid-events');
    const navYear = document.querySelector('.nav-year');
    const scrollHintBtn = document.getElementById('scrollHintBtn');
    const eventsHeader = document.querySelector('.events-header-container');

    // Detail View Elements
    const detailView = document.querySelector('.detail-view');
    const detailHero = document.querySelector('.detail-hero');
    const detailTitle = document.querySelector('.hero-title');
    const detailDesc = document.querySelector('.hero-desc');
    const videoContainer = document.querySelector('#video-container');
    const groupsContainer = document.querySelector('#groups-container');
    const galleryContainer = document.querySelector('#gallery-container');
    const detailUploadBtn = document.getElementById('detailUploadBtn');

    // Lightbox & Scroll
    const lightbox = document.querySelector('.lightbox');
    const lbImg = document.querySelector('#lb-img');
    const closeLb = document.querySelector('.close-lb');
    const scrollTopBtn = document.getElementById('scrollToTop');

    // Modal Elements
    const adminModalOverlay = document.getElementById('adminModalOverlay');
    const modalUpload = document.getElementById('modalUpload');
    const modalCreateEvent = document.getElementById('modalCreateEvent');
    const modalAddYear = document.getElementById('modalAddYear');
    const modalToken = document.getElementById('modalToken');

    // Toolbar Buttons
    const addYearBtn = document.getElementById('addYearBtn');
    const createEventBtn = document.getElementById('createEventBtn');
    const globalUploadBtn = document.getElementById('globalUploadBtn');
    const tokenConfigBtn = document.getElementById('tokenConfigBtn');

    // Toast Container
    const toastContainer = document.getElementById('toastContainer');

    // =========================================
    // 2. TIỆN ÍCH CHUNG & TOAST NOTIFICATION
    // =========================================
    function showToast(message, type = 'info', duration = 3800) {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast-item ${type}`;

        let icon = 'fa-info-circle';
        if (type === 'success') icon = 'fa-check-circle';
        if (type === 'error') icon = 'fa-circle-exclamation';

        toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    function utf8ToBase64(str) {
        const bytes = new TextEncoder().encode(str);
        const binString = Array.from(bytes, b => String.fromCharCode(b)).join('');
        return btoa(binString);
    }

    function base64ToUtf8(b64) {
        const clean = b64.replace(/\s/g, '');
        const binString = atob(clean);
        const bytes = Uint8Array.from(binString, m => m.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    }

    function sanitizeFilename(name) {
        return name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .toLowerCase();
    }

    function slugify(text) {
        return text
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-');
    }

    // Nén ảnh bằng Canvas để tải lên siêu nhanh và không tốn dung lượng
    function compressImage(file, maxWidth = 1920, maxHeight = 1920, quality = 0.85) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;
                    if (width > maxWidth || height > maxHeight) {
                        if (width / height > maxWidth / maxHeight) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        } else {
                            width = Math.round((width * maxHeight) / height);
                            height = maxHeight;
                        }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const dataUrl = canvas.toDataURL('image/jpeg', quality);
                    const base64 = dataUrl.split(',')[1];
                    resolve({
                        base64,
                        dataUrl,
                        originalName: file.name,
                        size: Math.round((base64.length * 3) / 4)
                    });
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    }

    // =========================================
    // 3. GITHUB REST API SERVICE
    // =========================================
    function getGitHubToken() {
        return localStorage.getItem(GITHUB_CONFIG.tokenStorageKey) || '';
    }

    function saveGitHubToken(token) {
        localStorage.setItem(GITHUB_CONFIG.tokenStorageKey, token.trim());
        updateTokenBadge();
    }

    function clearGitHubToken() {
        localStorage.removeItem(GITHUB_CONFIG.tokenStorageKey);
        updateTokenBadge();
    }

    function hasValidToken() {
        const token = getGitHubToken();
        return token && token.length > 10;
    }

    function updateTokenBadge() {
        const badge = document.getElementById('tokenStatusText');
        if (!badge) return;
        if (hasValidToken()) {
            badge.textContent = "Đã kết nối";
            badge.className = "token-badge configured";
        } else {
            badge.textContent = "Chưa cấu hình";
            badge.className = "token-badge unconfigured";
        }
    }

    async function uploadFileToGitHub(path, base64Content, commitMessage) {
        const token = getGitHubToken();
        if (!token) throw new Error("Chưa cấu hình GitHub Token");

        const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}`;
        const bodyData = {
            message: commitMessage || `Upload ${path}`,
            content: base64Content,
            branch: GITHUB_CONFIG.branch
        };

        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyData)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || `Lỗi tải lên file (${res.status})`);
        }
        return await res.json();
    }

    // =========================================
    // 3.1. MOBILE SCREEN WAKE LOCK & PREVENT SLEEP
    // =========================================
    let screenWakeLock = null;

    async function acquireWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                screenWakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (e) {
            console.log("Wake Lock không khả dụng hoặc bị từ chối:", e);
        }
    }

    function releaseWakeLock() {
        if (screenWakeLock) {
            screenWakeLock.release().catch(() => {});
            screenWakeLock = null;
        }
    }

    // =========================================
    // 3.2. THEO DÕI TIẾN TRÌNH DEPLOY & AUTO-RELOAD
    // =========================================
    const deployTrackerWidget = document.getElementById('deployTrackerWidget');
    const deploySpinner = document.getElementById('deploySpinner');
    const deployCheck = document.getElementById('deployCheck');
    const deployStatusTitle = document.getElementById('deployStatusTitle');
    const deployStatusDesc = document.getElementById('deployStatusDesc');
    const deployProgressBarFill = document.getElementById('deployProgressBarFill');
    const btnMinimizeDeployTracker = document.getElementById('btnMinimizeDeployTracker');

    if (btnMinimizeDeployTracker && deployTrackerWidget) {
        btnMinimizeDeployTracker.onclick = () => {
            deployTrackerWidget.classList.remove('active');
        };
    }

    let isDeployTrackingActive = false;

    async function trackDeploymentProgress() {
        if (!deployTrackerWidget) return;

        // Bật widget theo dõi
        deployTrackerWidget.classList.remove('success');
        deployTrackerWidget.classList.add('active');
        deploySpinner.style.display = 'inline-block';
        deployCheck.style.display = 'none';
        deployStatusTitle.textContent = 'Đang tự động xuất bản (Deploy)...';
        deployStatusDesc.textContent = 'GitHub Pages đang cập nhật website cho cả nhà.';
        deployProgressBarFill.style.width = '30%';

        const token = getGitHubToken();
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        let checkCount = 0;
        const maxChecks = 35; // Tối đa 35 lần x 3s = ~105s

        if (isDeployTrackingActive) return;
        isDeployTrackingActive = true;

        const intervalId = setInterval(async () => {
            checkCount++;

            // Hiệu ứng tăng dần thanh tiến trình trong lúc chờ GitHub
            const fakePct = Math.min(88, 30 + checkCount * 2);
            deployProgressBarFill.style.width = `${fakePct}%`;

            try {
                const res = await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/actions/runs?branch=${GITHUB_CONFIG.branch}&per_page=4&_t=${Date.now()}`, {
                    headers: headers
                });

                if (res.ok) {
                    const data = await res.json();
                    const runs = data.workflow_runs || [];
                    const pagesRun = runs.find(r => r.name && r.name.toLowerCase().includes('pages'));

                    if (pagesRun) {
                        if (pagesRun.status === 'in_progress' || pagesRun.status === 'queued') {
                            deployStatusDesc.textContent = `Đang xây dựng trên máy chủ GitHub (${checkCount * 3}s)...`;
                        } else if (pagesRun.status === 'completed') {
                            if (pagesRun.conclusion === 'success') {
                                clearInterval(intervalId);
                                isDeployTrackingActive = false;

                                // Hoàn thành deploy!
                                deployTrackerWidget.classList.add('success');
                                deploySpinner.style.display = 'none';
                                deployCheck.style.display = 'inline-block';
                                deployStatusTitle.textContent = 'Xuất bản thành công 100%! 🎉';
                                deployStatusDesc.textContent = 'Đang tự động làm mới trang...';
                                deployProgressBarFill.style.width = '100%';

                                // Tự động làm mới dữ liệu mới toanh
                                setTimeout(async () => {
                                    await reloadFreshData();
                                    showToast("Website đã được xuất bản trực tuyến thành công!", "success", 4000);
                                    setTimeout(() => {
                                        deployTrackerWidget.classList.remove('active');
                                    }, 4500);
                                }, 1500);

                                return;
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn("Lỗi kiểm tra tiến trình deploy:", err);
            }

            if (checkCount >= maxChecks) {
                clearInterval(intervalId);
                isDeployTrackingActive = false;
                deployTrackerWidget.classList.add('success');
                deploySpinner.style.display = 'none';
                deployCheck.style.display = 'inline-block';
                deployStatusTitle.textContent = 'Hoàn tất! Cả nhà có thể vào xem';
                deployStatusDesc.textContent = 'Đang làm mới dữ liệu...';
                await reloadFreshData();
                setTimeout(() => deployTrackerWidget.classList.remove('active'), 3500);
            }
        }, 3000);
    }

    async function reloadFreshData() {
        try {
            const res = await fetch(`data.json?v=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const freshData = await res.json();
                allData = freshData.sort((a, b) => b.year - a.year);
                initMenu();
                renderGrid(activeYear || (allData.length > 0 ? allData[0].year : null));
                if (currentEvent) {
                    openDetail(currentEvent.id);
                }
            }
        } catch (e) {
            console.error("Lỗi làm mới dữ liệu:", e);
        }
    }

    // =========================================
    // 3.3. CẬP NHẬT DATA.JSON VỚI AUTO-RETRY
    // =========================================
    async function updateDataJsonOnGitHub(updaterFn, commitMessage, maxRetries = 5) {
        const token = getGitHubToken();
        if (!token) throw new Error("Chưa cấu hình GitHub Token");

        const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/data.json?ref=${GITHUB_CONFIG.branch}`;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // 1. Lấy dữ liệu và SHA mới nhất từ GitHub
                const resGet = await fetch(`${url}&_t=${Date.now()}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    cache: 'no-store'
                });

                if (!resGet.ok) {
                    const err = await resGet.json().catch(() => ({}));
                    throw new Error(err.message || `Không thể đọc data.json từ GitHub (${resGet.status})`);
                }

                const resData = await resGet.json();
                const currentSha = resData.sha;
                const currentContent = base64ToUtf8(resData.content);
                let parsedData = JSON.parse(currentContent);

                // 2. Chạy hàm cập nhật dữ liệu (gộp dữ liệu mới vào bản mới nhất)
                parsedData = updaterFn(parsedData);

                // 3. Đẩy lại data.json đã cập nhật lên GitHub
                const updatedJsonStr = JSON.stringify(parsedData, null, 2);
                const encodedContent = utf8ToBase64(updatedJsonStr);

                const resPut = await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/data.json`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: commitMessage || "Cập nhật data.json từ Website",
                        content: encodedContent,
                        sha: currentSha,
                        branch: GITHUB_CONFIG.branch
                    })
                });

                if (!resPut.ok) {
                    const errData = await resPut.json().catch(() => ({}));
                    // Nếu gặp 409 Conflict (xung đột do người khác vừa sửa cùng lúc) -> Thử lại!
                    if (resPut.status === 409 && attempt < maxRetries) {
                        console.warn(`Phát hiện xung đột dữ liệu (409 Conflict) lần ${attempt}. Đang tự động thử lại sau ít giây...`);
                        showToast(`Nhiều người đang lưu cùng lúc, đang tự động đồng bộ lần ${attempt}...`, "info", 2000);
                        const backoffTime = 1000 * attempt + Math.floor(Math.random() * 600);
                        await new Promise(res => setTimeout(res, backoffTime));
                        continue;
                    }
                    throw new Error(errData.message || `Không thể lưu data.json (${resPut.status})`);
                }

                return parsedData;
            } catch (err) {
                if (err.message && (err.message.includes('409') || err.message.includes('sha') || err.message.includes('conflict')) && attempt < maxRetries) {
                    console.warn(`Thử lại lần ${attempt} do xung đột: ${err.message}`);
                    const backoffTime = 1200 * attempt + Math.floor(Math.random() * 500);
                    await new Promise(res => setTimeout(res, backoffTime));
                    continue;
                }
                throw err;
            }
        }
    }

    // =========================================
    // 4. QUẢN LÝ MODAL TRÌNH CHIẾU
    // =========================================
    function openModal(modalEl) {
        // Đóng các modal khác nếu đang mở
        [modalUpload, modalCreateEvent, modalAddYear, modalToken].forEach(m => {
            if (m) m.classList.remove('active');
        });

        adminModalOverlay.classList.add('active');
        modalEl.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        adminModalOverlay.classList.remove('active');
        [modalUpload, modalCreateEvent, modalAddYear, modalToken].forEach(m => {
            if (m) m.classList.remove('active');
        });
        if (detailView.style.display !== 'block') {
            document.body.style.overflow = 'auto';
        }
    }

    // Đóng khi bấm nút X hoặc click ngoài modal
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal());
    });

    adminModalOverlay.addEventListener('click', (e) => {
        if (e.target === adminModalOverlay) closeModal();
    });

    // =========================================
    // 5. XỬ LÝ NÚT KHÁM PHÁ & LOAD DỮ LIỆU
    // =========================================
    if (scrollHintBtn && eventsHeader) {
        scrollHintBtn.onclick = () => {
            eventsHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
    }

    fetch(`data.json?v=${Date.now()}`, { cache: 'no-store' })
        .then(res => res.json())
        .then(data => {
            allData = data.sort((a, b) => b.year - a.year);
            initMenu();
            
            if (allData.length > 0) {
                activeYear = allData[0].year;
                renderGrid(activeYear);
                setTimeout(() => eventsGrid.classList.add('active'), 100);
            }
        })
        .catch(err => {
            console.error("Lỗi đọc data.json:", err);
            eventsGrid.innerHTML = '<p style="color:white; text-align:center;">Vui lòng chạy bằng Live Server.</p>';
        });

    function initMenu() {
        navYear.innerHTML = '';
        allData.forEach((item, index) => {
            const btn = document.createElement('button');
            btn.className = (activeYear === item.year || (!activeYear && index === 0)) ? 'year-btn active' : 'year-btn';
            btn.innerText = item.year;
            btn.onclick = () => {
                activeYear = item.year;
                document.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderGrid(item.year);
            };
            navYear.appendChild(btn);
        });
    }

    function renderGrid(year) {
        eventsGrid.innerHTML = '';
        const yearData = allData.find(d => d.year === year);
        
        if (yearData && yearData.events && yearData.events.length > 0) {
            yearData.events.forEach((event, index) => {
                const card = document.createElement('div');
                card.className = 'card';
                card.style.transitionDelay = `${index * 0.12}s`;

                card.onclick = () => openDetail(event);

                card.innerHTML = `
                    <img src="${event.cover}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1513151233558-d860c5398176?q=80&w=800'">
                    <div class="card-content">
                        <div class="card-date">${event.date}</div>
                        <h3 class="card-title">${event.title}</h3>
                    </div>
                `;
                eventsGrid.appendChild(card);
                setTimeout(() => card.classList.add('show'), 50);
            });
        } else {
            eventsGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; color: #888; padding: 60px 20px;">
                    <p style="font-size: 1.1rem; margin-bottom: 15px;">Chưa có sự kiện nào trong năm ${year}.</p>
                    <button class="btn-primary" onclick="document.getElementById('createEventBtn').click()">
                        <i class="fas fa-plus-circle"></i> Tạo khoảnh khắc cho năm ${year}
                    </button>
                </div>
            `;
        }
    }

    function openDetail(eventOrId) {
        let event = null;
        if (typeof eventOrId === 'string') {
            for (const y of allData) {
                const found = (y.events || []).find(e => e.id === eventOrId);
                if (found) { event = found; break; }
            }
        } else if (eventOrId && eventOrId.id) {
            for (const y of allData) {
                const found = (y.events || []).find(e => e.id === eventOrId.id);
                if (found) { event = found; break; }
            }
        }
        if (!event) event = eventOrId;
        currentEvent = event;
        detailHero.style.backgroundImage = `url('${event.cover}')`;
        detailTitle.innerText = event.title;
        detailDesc.innerText = event.description || '';

        // Video
        if (event.videoId) {
            let vid = event.videoId;
            if (vid.includes('v=')) vid = vid.split('v=')[1].split('&')[0];
            if (vid.includes('youtu.be/')) vid = vid.split('youtu.be/')[1].split('?')[0];

            videoContainer.innerHTML = `
                <div class="video-frame">
                    <iframe src="https://www.youtube.com/embed/${vid}?autoplay=1&mute=0" allowfullscreen></iframe>
                </div>`;
            videoContainer.style.display = 'block';
        } else {
            videoContainer.style.display = 'none';
        }

        // Groups (Đại gia đình)
        renderDetailGroups(event);

        // Gallery (Khoảnh khắc chung)
        renderDetailGallery(event);

        detailView.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    function renderDetailGroups(event) {
        groupsContainer.innerHTML = '';
        if (event.groups && event.groups.length > 0) {
            groupsContainer.innerHTML = `<h2 class="section-title" style="color:var(--gold); font-family:var(--font-serif); font-style:italic; font-size:2.5rem; text-align:center; margin-bottom:40px">Đại Gia Đình</h2>`;
            event.groups.forEach(group => {
                let photosHtml = '';
                if (group.photos && group.photos.length > 0) {
                    group.photos.forEach(url => {
                        photosHtml += `<img src="${url}" onclick="viewImage('${url}')" loading="lazy">`;
                    });
                } else {
                    photosHtml = `<div style="color:#666; font-size:0.85rem; padding: 20px; font-style:italic;">Chưa có ảnh (tối đa 4 ảnh)</div>`;
                }

                const groupBlock = document.createElement('div');
                groupBlock.innerHTML = `
                    <h3 class="group-name">${group.name} <span style="font-size:0.75rem; color:#888; font-family:var(--font-sans); font-weight:normal;">(${group.photos ? group.photos.length : 0}/4 ảnh)</span></h3>
                    <div class="group-scroll">${photosHtml}</div>
                `;
                groupsContainer.appendChild(groupBlock);
            });
        }
    }

    function renderDetailGallery(event) {
        galleryContainer.innerHTML = '';
        if (event.general_photos && event.general_photos.length > 0) {
            galleryContainer.innerHTML = `<h2 class="section-title" style="color:var(--gold); font-family:var(--font-serif); font-style:italic; font-size:2.5rem; text-align:center; margin-bottom:40px">Khoảnh Khắc Chung</h2>`;
            event.general_photos.forEach(url => {
                const item = document.createElement('div');
                item.className = 'gallery-item';
                item.innerHTML = `<img src="${url}" onclick="viewImage('${url}')" loading="lazy">`;
                galleryContainer.appendChild(item);
            });
        }
    }

    // Scroll Top Button
    function toggleScrollBtn(pos) {
        if (pos > 500) scrollTopBtn.classList.add('show');
        else scrollTopBtn.classList.remove('show');
    }

    window.addEventListener('scroll', () => {
        if (detailView.style.display !== 'block') toggleScrollBtn(window.scrollY);
    });

    detailView.addEventListener('scroll', () => {
        if (detailView.style.display === 'block') toggleScrollBtn(detailView.scrollTop);
    });

    scrollTopBtn.onclick = () => {
        if (detailView.style.display === 'block') {
            detailView.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Close Detail View
    document.querySelector('.back-btn').onclick = () => {
        detailView.style.display = 'none';
        document.body.style.overflow = 'auto';
        videoContainer.innerHTML = '';
        currentEvent = null;
    };

    // Lightbox
    window.viewImage = (url) => {
        lbImg.src = url;
        lightbox.style.display = 'flex';
    };
    closeLb.onclick = () => lightbox.style.display = 'none';
    lightbox.onclick = (e) => { if (e.target === lightbox) lightbox.style.display = 'none'; };

    // =========================================
    // 6. XỬ LÝ CÀI ĐẶT GITHUB TOKEN
    // =========================================
    const githubTokenInput = document.getElementById('githubTokenInput');
    const btnSaveToken = document.getElementById('btnSaveToken');
    const btnClearToken = document.getElementById('btnClearToken');
    const btnToggleTokenVisible = document.getElementById('btnToggleTokenVisible');

    tokenConfigBtn.onclick = () => {
        githubTokenInput.value = getGitHubToken();
        updateTokenBadge();
        openModal(modalToken);
    };

    btnSaveToken.onclick = () => {
        const val = githubTokenInput.value.trim();
        if (!val) {
            showToast("Vui lòng nhập GitHub Token", "error");
            return;
        }
        saveGitHubToken(val);
        showToast("Đã lưu GitHub Token thành công!", "success");
        closeModal();
    };

    btnClearToken.onclick = () => {
        clearGitHubToken();
        githubTokenInput.value = '';
        showToast("Đã xóa GitHub Token", "info");
    };

    if (btnToggleTokenVisible) {
        btnToggleTokenVisible.onclick = () => {
            const isPassword = githubTokenInput.type === 'password';
            githubTokenInput.type = isPassword ? 'text' : 'password';
            btnToggleTokenVisible.innerHTML = isPassword ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
        };
    }

    function ensureTokenBeforeAction() {
        if (!hasValidToken()) {
            showToast("Vui lòng cấu hình GitHub Token trước khi thao tác!", "info");
            githubTokenInput.value = '';
            updateTokenBadge();
            openModal(modalToken);
            return false;
        }
        return true;
    }

    // =========================================
    // 7. XỬ LÝ MODAL THÊM NĂM MỚI
    // =========================================
    const newYearInput = document.getElementById('newYearInput');
    const btnDoAddYear = document.getElementById('btnDoAddYear');
    const addYearAlert = document.getElementById('addYearAlert');

    addYearBtn.onclick = () => {
        if (!ensureTokenBeforeAction()) return;
        newYearInput.value = new Date().getFullYear();
        addYearAlert.style.display = 'none';
        openModal(modalAddYear);
    };

    btnDoAddYear.onclick = async () => {
        const yearVal = parseInt(newYearInput.value, 10);
        if (!yearVal || yearVal < 1900 || yearVal > 2100) {
            addYearAlert.className = 'alert-box error';
            addYearAlert.textContent = 'Vui lòng nhập năm hợp lệ (1900 - 2100).';
            addYearAlert.style.display = 'block';
            return;
        }

        if (allData.some(d => d.year === yearVal)) {
            addYearAlert.className = 'alert-box error';
            addYearAlert.textContent = `Năm ${yearVal} đã tồn tại trong danh sách.`;
            addYearAlert.style.display = 'block';
            return;
        }

        btnDoAddYear.disabled = true;
        btnDoAddYear.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang thêm...';

        try {
            const updatedData = await updateDataJsonOnGitHub((currentJson) => {
                currentJson.push({
                    year: yearVal,
                    events: []
                });
                return currentJson.sort((a, b) => b.year - a.year);
            }, `Thêm năm mới ${yearVal}`);

            allData = updatedData;
            activeYear = yearVal;
            initMenu();
            renderGrid(yearVal);

            showToast(`Đã thêm thành công năm ${yearVal}!`, "success");
            closeModal();
            trackDeploymentProgress();
        } catch (err) {
            console.error(err);
            addYearAlert.className = 'alert-box error';
            addYearAlert.textContent = `Lỗi: ${err.message}`;
            addYearAlert.style.display = 'block';
        } finally {
            btnDoAddYear.disabled = false;
            btnDoAddYear.innerHTML = '<i class="fas fa-check"></i> Thêm năm';
        }
    };

    // =========================================
    // 8. XỬ LÝ MODAL TẠO KHOẢNH KHẮC MỚI
    // =========================================
    const eventYearSelect = document.getElementById('eventYearSelect');
    const eventTitleInput = document.getElementById('eventTitleInput');
    const eventIdInput = document.getElementById('eventIdInput');
    const eventDateInput = document.getElementById('eventDateInput');
    const eventDescInput = document.getElementById('eventDescInput');
    const eventVideoIdInput = document.getElementById('eventVideoIdInput');
    const eventCoverFileInput = document.getElementById('eventCoverFileInput');
    const btnSelectCoverFile = document.getElementById('btnSelectCoverFile');
    const coverFileName = document.getElementById('coverFileName');
    const btnDoCreateEvent = document.getElementById('btnDoCreateEvent');
    const createEventAlert = document.getElementById('createEventAlert');

    createEventBtn.onclick = () => {
        if (!ensureTokenBeforeAction()) return;

        // Điền danh sách năm
        eventYearSelect.innerHTML = '';
        allData.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.year;
            opt.textContent = `Năm ${item.year}`;
            if (item.year === activeYear) opt.selected = true;
            eventYearSelect.appendChild(opt);
        });

        // Reset inputs
        eventTitleInput.value = '';
        eventIdInput.value = '';
        eventDateInput.value = '';
        eventDescInput.value = '';
        eventVideoIdInput.value = '';
        coverFileName.textContent = 'Chưa chọn ảnh';
        selectedCoverFile = null;
        createEventAlert.style.display = 'none';

        openModal(modalCreateEvent);
    };

    // Tự động sinh ID khi gõ tiêu đề
    eventTitleInput.addEventListener('input', () => {
        const year = eventYearSelect.value;
        const slug = slugify(eventTitleInput.value);
        if (slug) {
            eventIdInput.value = `${slug}-${year}`;
        }
    });

    btnSelectCoverFile.onclick = () => eventCoverFileInput.click();
    eventCoverFileInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
            selectedCoverFile = e.target.files[0];
            coverFileName.textContent = selectedCoverFile.name;
        }
    };

    btnDoCreateEvent.onclick = async () => {
        const year = parseInt(eventYearSelect.value, 10);
        const title = eventTitleInput.value.trim();
        const id = (eventIdInput.value.trim() || slugify(title)).replace(/[^a-zA-Z0-9_-]/g, '-');
        const date = eventDateInput.value.trim();
        const desc = eventDescInput.value.trim();
        const videoId = eventVideoIdInput.value.trim();

        if (!title || !id || !date) {
            createEventAlert.className = 'alert-box error';
            createEventAlert.textContent = 'Vui lòng điền đủ Tên sự kiện, Mã định danh và Thời gian.';
            createEventAlert.style.display = 'block';
            return;
        }

        if (!selectedCoverFile) {
            createEventAlert.className = 'alert-box error';
            createEventAlert.textContent = 'Vui lòng chọn ảnh bìa cho khoảnh khắc.';
            createEventAlert.style.display = 'block';
            return;
        }

        btnDoCreateEvent.disabled = true;
        btnDoCreateEvent.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo...';

        try {
            // 1. Tải ảnh bìa lên GitHub
            const compressedCover = await compressImage(selectedCoverFile, 1920, 1080, 0.85);
            const coverExt = 'jpg';
            const coverPath = `images/${year}/${id}/cover_${Date.now()}.${coverExt}`;

            await uploadFileToGitHub(coverPath, compressedCover.base64, `Upload cover cho khoảnh khắc ${title}`);
            const repoCoverUrl = `./${coverPath}`;

            // 2. Tạo đối tượng sự kiện mới với 9 nhóm gia đình chuẩn
            const newEventObj = {
                id: id,
                title: title,
                date: date,
                cover: repoCoverUrl,
                description: desc,
                videoId: videoId,
                groups: DEFAULT_GROUPS.map(name => ({
                    name: name,
                    photos: []
                })),
                general_photos: []
            };

            // 3. Lưu vào data.json trên GitHub
            const updatedData = await updateDataJsonOnGitHub((currentJson) => {
                let targetYear = currentJson.find(y => y.year === year);
                if (!targetYear) {
                    targetYear = { year: year, events: [] };
                    currentJson.push(targetYear);
                    currentJson.sort((a, b) => b.year - a.year);
                }
                targetYear.events.unshift(newEventObj);
                return currentJson;
            }, `Tạo sự kiện mới: ${title} (${year})`);

            allData = updatedData;
            activeYear = year;
            initMenu();
            renderGrid(year);

            showToast(`Đã tạo khoảnh khắc "${title}" thành công!`, "success");
            closeModal();
            trackDeploymentProgress();
        } catch (err) {
            console.error(err);
            createEventAlert.className = 'alert-box error';
            createEventAlert.textContent = `Lỗi: ${err.message}`;
            createEventAlert.style.display = 'block';
        } finally {
            btnDoCreateEvent.disabled = false;
            btnDoCreateEvent.innerHTML = '<i class="fas fa-plus-circle"></i> Tạo khoảnh khắc';
        }
    };

    // =========================================
    // 9. XỬ LÝ MODAL TẢI ẢNH LÊN (THEO YÊU CẦU NGƯỜI DÙNG)
    // =========================================
    const uploadYearSelect = document.getElementById('uploadYearSelect');
    const uploadEventSelect = document.getElementById('uploadEventSelect');
    const targetGeneral = document.getElementById('targetGeneral');
    const targetGroup = document.getElementById('targetGroup');
    const targetGeneralLabel = document.getElementById('targetGeneralLabel');
    const targetGroupLabel = document.getElementById('targetGroupLabel');
    const groupSelectContainer = document.getElementById('groupSelectContainer');
    const uploadGroupSelect = document.getElementById('uploadGroupSelect');
    const groupPhotoBadge = document.getElementById('groupPhotoBadge');

    const uploadDropzone = document.getElementById('uploadDropzone');
    const photoFileInput = document.getElementById('photoFileInput');
    const uploadPreviewContainer = document.getElementById('uploadPreviewContainer');
    const uploadPreviewGrid = document.getElementById('uploadPreviewGrid');
    const previewCount = document.getElementById('previewCount');
    const btnClearPreview = document.getElementById('btnClearPreview');

    const uploadAlert = document.getElementById('uploadAlert');
    const uploadProgressBox = document.getElementById('uploadProgressBox');
    const uploadProgressBar = document.getElementById('uploadProgressBar');
    const uploadStatusText = document.getElementById('uploadStatusText');
    const btnDoUpload = document.getElementById('btnDoUpload');

    // Mở modal tải lên từ Toolbar hoặc Detail View
    function openUploadModalWithEvent(year, eventId) {
        if (!ensureTokenBeforeAction()) return;

        // Điền danh sách năm
        uploadYearSelect.innerHTML = '';
        allData.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.year;
            opt.textContent = `Năm ${item.year}`;
            if (year && item.year === year) opt.selected = true;
            else if (!year && item.year === activeYear) opt.selected = true;
            uploadYearSelect.appendChild(opt);
        });

        // Điền danh sách sự kiện
        populateUploadEvents(uploadYearSelect.value, eventId);

        // Reset target radio
        targetGeneral.checked = true;
        targetGeneralLabel.classList.add('active');
        targetGroupLabel.classList.remove('active');
        groupSelectContainer.style.display = 'none';

        // Reset preview
        selectedUploadFiles = [];
        renderUploadPreviews();

        uploadAlert.style.display = 'none';
        uploadProgressBox.style.display = 'none';

        openModal(modalUpload);
    }

    globalUploadBtn.onclick = () => {
        openUploadModalWithEvent(activeYear);
    };

    if (detailUploadBtn) {
        detailUploadBtn.onclick = () => {
            if (currentEvent) {
                const eventYearData = allData.find(y => y.events && y.events.some(e => e.id === currentEvent.id));
                const year = eventYearData ? eventYearData.year : activeYear;
                openUploadModalWithEvent(year, currentEvent.id);
            } else {
                openUploadModalWithEvent(activeYear);
            }
        };
    }

    uploadYearSelect.onchange = () => {
        populateUploadEvents(uploadYearSelect.value);
    };

    function populateUploadEvents(yearVal, preselectId) {
        uploadEventSelect.innerHTML = '';
        const yData = allData.find(d => d.year == yearVal);
        if (yData && yData.events && yData.events.length > 0) {
            yData.events.forEach(ev => {
                const opt = document.createElement('option');
                opt.value = ev.id;
                opt.textContent = ev.title;
                if (preselectId && ev.id === preselectId) opt.selected = true;
                uploadEventSelect.appendChild(opt);
            });
            populateUploadGroups();
        } else {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '-- Chưa có sự kiện --';
            uploadEventSelect.appendChild(opt);
            uploadGroupSelect.innerHTML = '';
        }
    }

    uploadEventSelect.onchange = () => {
        populateUploadGroups();
        checkFamilyPhotoLimit();
    };

    // Chuyển đổi vị trí: Khoảnh khắc chung vs Ảnh từng gia đình
    targetGeneral.onchange = () => {
        targetGeneralLabel.classList.add('active');
        targetGroupLabel.classList.remove('active');
        groupSelectContainer.style.display = 'none';
        uploadAlert.style.display = 'none';
    };

    targetGroup.onchange = () => {
        targetGroupLabel.classList.add('active');
        targetGeneralLabel.classList.remove('active');
        groupSelectContainer.style.display = 'block';
        populateUploadGroups();
        checkFamilyPhotoLimit();
    };

    function getCurrentlySelectedEvent() {
        const year = parseInt(uploadYearSelect.value, 10);
        const eventId = uploadEventSelect.value;
        const yData = allData.find(d => d.year === year);
        if (!yData) return null;
        return yData.events.find(e => e.id === eventId) || null;
    }

    function populateUploadGroups() {
        uploadGroupSelect.innerHTML = '';
        const ev = getCurrentlySelectedEvent();
        if (!ev) return;

        const groups = (ev.groups && ev.groups.length > 0) 
            ? ev.groups 
            : DEFAULT_GROUPS.map(n => ({ name: n, photos: [] }));

        groups.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.name;
            const count = g.photos ? g.photos.length : 0;
            opt.textContent = `${g.name} (${count}/4 ảnh)`;
            uploadGroupSelect.appendChild(opt);
        });

        checkFamilyPhotoLimit();
    }

    uploadGroupSelect.onchange = () => {
        checkFamilyPhotoLimit();
    };

    // Kiểm tra giới hạn MAX 4 ẢNH CHO TỪNG GIA ĐÌNH
    function checkFamilyPhotoLimit() {
        if (!targetGroup.checked) {
            uploadAlert.style.display = 'none';
            return true;
        }

        const ev = getCurrentlySelectedEvent();
        if (!ev) return true;

        const groupName = uploadGroupSelect.value;
        const group = (ev.groups || []).find(g => g.name === groupName);
        const currentCount = group && group.photos ? group.photos.length : 0;
        const remaining = 4 - currentCount;

        if (currentCount >= 4) {
            groupPhotoBadge.textContent = `Hiện có: ${currentCount}/4 ảnh (ĐÃ ĐỦ)`;
            groupPhotoBadge.className = 'count-badge limit-reached';
            uploadAlert.className = 'alert-box error';
            uploadAlert.innerHTML = `<i class="fas fa-triangle-exclamation"></i> <strong>${groupName}</strong> đã đạt tối đa 4 ảnh. Không thể thêm ảnh vào gia đình này nữa!`;
            uploadAlert.style.display = 'block';
            return false;
        } else {
            groupPhotoBadge.textContent = `Hiện có: ${currentCount}/4 ảnh (Còn ${remaining} chỗ)`;
            groupPhotoBadge.className = 'count-badge';
            
            if (selectedUploadFiles.length > remaining) {
                uploadAlert.className = 'alert-box error';
                uploadAlert.innerHTML = `<i class="fas fa-triangle-exclamation"></i> Bạn đã chọn <strong>${selectedUploadFiles.length} ảnh</strong>, nhưng <strong>${groupName}</strong> chỉ còn <strong>${remaining} chỗ</strong> (tối đa 4 ảnh). Vui lòng bớt ảnh!`;
                uploadAlert.style.display = 'block';
                return false;
            } else {
                uploadAlert.style.display = 'none';
                return true;
            }
        }
    }

    // Dropzone events
    uploadDropzone.onclick = () => photoFileInput.click();
    
    uploadDropzone.ondragover = (e) => {
        e.preventDefault();
        uploadDropzone.classList.add('dragover');
    };

    uploadDropzone.ondragleave = () => {
        uploadDropzone.classList.remove('dragover');
    };

    uploadDropzone.ondrop = (e) => {
        e.preventDefault();
        uploadDropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleSelectedFiles(e.dataTransfer.files);
        }
    };

    photoFileInput.onchange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleSelectedFiles(e.target.files);
            photoFileInput.value = '';
        }
    };

    async function handleSelectedFiles(filesList) {
        uploadDropzone.style.opacity = '0.6';
        uploadDropzone.style.pointerEvents = 'none';

        for (let i = 0; i < filesList.length; i++) {
            const f = filesList[i];
            if (!f.type.startsWith('image/')) continue;
            try {
                const compressed = await compressImage(f, 1920, 1920, 0.85);
                selectedUploadFiles.push(compressed);
            } catch (err) {
                console.error("Lỗi nén ảnh:", err);
            }
        }

        uploadDropzone.style.opacity = '1';
        uploadDropzone.style.pointerEvents = 'auto';

        renderUploadPreviews();
        checkFamilyPhotoLimit();
    }

    function renderUploadPreviews() {
        uploadPreviewGrid.innerHTML = '';
        previewCount.textContent = selectedUploadFiles.length;

        if (selectedUploadFiles.length > 0) {
            uploadPreviewContainer.style.display = 'block';
            selectedUploadFiles.forEach((fileObj, idx) => {
                const item = document.createElement('div');
                item.className = 'preview-item';
                item.innerHTML = `
                    <img src="${fileObj.dataUrl}">
                    <button type="button" class="btn-remove-preview" data-index="${idx}">&times;</button>
                `;
                uploadPreviewGrid.appendChild(item);
            });

            uploadPreviewGrid.querySelectorAll('.btn-remove-preview').forEach(btn => {
                btn.onclick = (e) => {
                    const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
                    selectedUploadFiles.splice(idx, 1);
                    renderUploadPreviews();
                    checkFamilyPhotoLimit();
                };
            });
        } else {
            uploadPreviewContainer.style.display = 'none';
        }
    }

    btnClearPreview.onclick = () => {
        selectedUploadFiles = [];
        renderUploadPreviews();
        checkFamilyPhotoLimit();
    };

    // =========================================
    // HÀNH ĐỘNG NÚT "TẢI LÊN"
    // =========================================
    btnDoUpload.onclick = async () => {
        if (!ensureTokenBeforeAction()) return;

        const year = parseInt(uploadYearSelect.value, 10);
        const eventId = uploadEventSelect.value;

        if (!eventId) {
            showToast("Vui lòng chọn hoặc tạo sự kiện trước!", "error");
            return;
        }

        if (selectedUploadFiles.length === 0) {
            uploadAlert.className = 'alert-box error';
            uploadAlert.textContent = 'Vui lòng chọn ít nhất 1 ảnh để tải lên.';
            uploadAlert.style.display = 'block';
            return;
        }

        // Kiểm tra giới hạn 4 ảnh cho từng gia đình
        const isGroupTarget = targetGroup.checked;
        const selectedGroupName = uploadGroupSelect.value;

        if (isGroupTarget) {
            const ev = getCurrentlySelectedEvent();
            const group = ev && ev.groups ? ev.groups.find(g => g.name === selectedGroupName) : null;
            const currentCount = group && group.photos ? group.photos.length : 0;
            const remaining = 4 - currentCount;

            if (currentCount >= 4) {
                uploadAlert.className = 'alert-box error';
                uploadAlert.textContent = `Gia đình ${selectedGroupName} đã có đủ 4 ảnh. Không thể thêm tiếp.`;
                uploadAlert.style.display = 'block';
                return;
            }

            if (selectedUploadFiles.length > remaining) {
                uploadAlert.className = 'alert-box error';
                uploadAlert.textContent = `Chỉ còn ${remaining} chỗ cho gia đình ${selectedGroupName} (tối đa 4 ảnh). Bạn đã chọn ${selectedUploadFiles.length} ảnh.`;
                uploadAlert.style.display = 'block';
                return;
            }
        }

        // Kích hoạt giữ màn hình sáng & bảo vệ không tắt trình duyệt
        await acquireWakeLock();
        window.onbeforeunload = () => "Ảnh đang được tải lên, vui lòng không rời khỏi trang.";

        // Bắt đầu tiến trình tải lên
        btnDoUpload.disabled = true;
        uploadProgressBox.style.display = 'flex';
        uploadAlert.style.display = 'none';

        const totalFiles = selectedUploadFiles.length;
        const uploadedPaths = [];

        try {
            // Bước 1: Upload từng ảnh lên GitHub
            for (let i = 0; i < totalFiles; i++) {
                const fileObj = selectedUploadFiles[i];
                const pct = Math.round(((i) / (totalFiles + 1)) * 100);
                uploadProgressBar.style.width = `${pct}%`;
                uploadStatusText.textContent = `Đang tải ảnh ${i + 1}/${totalFiles}...`;

                const cleanName = sanitizeFilename(fileObj.originalName.replace(/\.[^/.]+$/, ""));
                const filename = `img_${Date.now()}_${i}_${cleanName}.jpg`;
                const folder = isGroupTarget ? 'anhgiadinh' : 'general';
                const repoFilePath = `images/${year}/${eventId}/${folder}/${filename}`;

                await uploadFileToGitHub(
                    repoFilePath,
                    fileObj.base64,
                    `Upload photo: ${filename} cho ${eventId}`
                );

                uploadedPaths.push(`./${repoFilePath}`);
            }

            // Bước 2: Cập nhật data.json trên GitHub
            uploadProgressBar.style.width = '85%';
            uploadStatusText.textContent = 'Đang lưu dữ liệu vào hệ thống...';

            const updatedData = await updateDataJsonOnGitHub((currentJson) => {
                const yearObj = currentJson.find(y => y.year === year);
                if (!yearObj) throw new Error(`Không tìm thấy năm ${year} trong data.json`);

                const eventObj = yearObj.events.find(e => e.id === eventId);
                if (!eventObj) throw new Error(`Không tìm thấy sự kiện ${eventId}`);

                if (isGroupTarget) {
                    if (!eventObj.groups) {
                        eventObj.groups = DEFAULT_GROUPS.map(n => ({ name: n, photos: [] }));
                    }
                    let grp = eventObj.groups.find(g => g.name === selectedGroupName);
                    if (!grp) {
                        grp = { name: selectedGroupName, photos: [] };
                        eventObj.groups.push(grp);
                    }
                    if (!grp.photos) grp.photos = [];

                    // Kiểm tra một lần nữa số lượng trước khi append
                    if (grp.photos.length + uploadedPaths.length > 4) {
                        throw new Error(`Gia đình ${selectedGroupName} đã vượt quá giới hạn 4 ảnh.`);
                    }

                    grp.photos.push(...uploadedPaths);
                } else {
                    if (!eventObj.general_photos) eventObj.general_photos = [];
                    eventObj.general_photos.push(...uploadedPaths);
                }

                return currentJson;
            }, `Cập nhật ảnh cho sự kiện ${eventId}`);

            // Bước 3: Hoàn thành! Cập nhật state nội bộ
            uploadProgressBar.style.width = '100%';
            uploadStatusText.textContent = 'Hoàn tất! Trang web sẽ tự động xuất bản trong 1–2 phút.';

            allData = updatedData;
            renderGrid(activeYear || year);

            // Nếu đang mở trang chi tiết sự kiện này -> re-render ngay lập tức!
            if (currentEvent && currentEvent.id === eventId) {
                openDetail(eventId);
            }

            showToast(`Đã tải lên thành công ${totalFiles} ảnh!`, "success", 4500);

            setTimeout(() => {
                closeModal();
                selectedUploadFiles = [];
                renderUploadPreviews();
                uploadProgressBox.style.display = 'none';
                uploadProgressBar.style.width = '0%';
                // Bắt đầu theo dõi tiến trình deploy tự động
                trackDeploymentProgress();
            }, 1000);

        } catch (err) {
            console.error(err);
            uploadAlert.className = 'alert-box error';
            uploadAlert.textContent = `Lỗi trong quá trình tải: ${err.message}`;
            uploadAlert.style.display = 'block';
            uploadProgressBox.style.display = 'none';
        } finally {
            btnDoUpload.disabled = false;
            releaseWakeLock();
            window.onbeforeunload = null;
        }
    };
});