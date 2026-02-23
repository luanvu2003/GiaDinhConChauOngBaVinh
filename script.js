document.addEventListener("DOMContentLoaded", () => {
    let allData = [];
    
    // CÁC ELEMENT
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

    // Lightbox Elements
    const lightbox = document.querySelector('.lightbox');
    const lbImg = document.querySelector('#lb-img');
    const closeLb = document.querySelector('.close-lb');
    const scrollTopBtn = document.getElementById('scrollToTop');

    // --- 1. XỬ LÝ NÚT KHÁM PHÁ ---
    if(scrollHintBtn && eventsHeader) {
        scrollHintBtn.onclick = () => {
            eventsHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
    }

    // --- 2. FETCH DATA ---
    fetch('data.json')
        .then(res => res.json())
        .then(data => {
            allData = data.sort((a, b) => b.year - a.year);
            initMenu();
            
            if(allData.length > 0) {
                renderGrid(allData[0].year);
                setTimeout(() => eventsGrid.classList.add('active'), 100);
            }
        })
        .catch(err => {
            console.error("Lỗi đọc data.json:", err);
            eventsGrid.innerHTML = '<p style="color:white; text-align:center;">Vui lòng chạy bằng Live Server để đọc được data.</p>';
        });

    function initMenu() {
        navYear.innerHTML = '';
        allData.forEach((item, index) => {
            const btn = document.createElement('button');
            btn.className = index === 0 ? 'year-btn active' : 'year-btn';
            btn.innerText = item.year;
            btn.onclick = () => {
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
        
        if(yearData) {
            yearData.events.forEach((event, index) => {
                const card = document.createElement('div');
                card.className = 'card';
                card.style.transitionDelay = `${index * 0.1}s`;

                card.onclick = () => openDetail(event);
                card.innerHTML = `
                    <img src="${event.cover}" loading="lazy">
                    <div class="card-content">
                        <div class="card-date">${event.date}</div>
                        <h3 class="card-title">${event.title}</h3>
                    </div>
                `;
                eventsGrid.appendChild(card);
                setTimeout(() => card.classList.add('show'), 50);
            });
        }
    }

    function openDetail(event) {
        detailHero.style.backgroundImage = `url('${event.cover}')`;
        detailTitle.innerText = event.title;
        detailDesc.innerText = event.description;

        // Video
        if(event.videoId) {
            videoContainer.innerHTML = `
                <div class="video-frame">
                    <iframe src="https://www.youtube.com/embed/${event.videoId}?autoplay=1&mute=0" allowfullscreen></iframe>
                </div>`;
            videoContainer.style.display = 'block';
        } else {
            videoContainer.style.display = 'none';
        }

        // Groups
        groupsContainer.innerHTML = '';
        if(event.groups && event.groups.length > 0) {
            groupsContainer.innerHTML = `<h2 class="section-title" style="color:var(--gold); font-family:var(--font-serif); font-style:italic; font-size:2.5rem; text-align:center; margin-bottom:40px">Đại Gia Đình</h2>`;
            event.groups.forEach(group => {
                let photosHtml = '';
                group.photos.forEach(url => {
                    photosHtml += `<img src="${url}" onclick="viewImage('${url}')">`;
                });
                const groupBlock = document.createElement('div');
                groupBlock.innerHTML = `
                    <h3 class="group-name">${group.name}</h3>
                    <div class="group-scroll">${photosHtml}</div>
                `;
                groupsContainer.appendChild(groupBlock);
            });
        }

        // Gallery
        galleryContainer.innerHTML = '';
        if(event.general_photos && event.general_photos.length > 0) {
            galleryContainer.innerHTML = `<h2 class="section-title" style="color:var(--gold); font-family:var(--font-serif); font-style:italic; font-size:2.5rem; text-align:center; margin-bottom:40px">Khoảnh Khắc Chung</h2>`;
            event.general_photos.forEach(url => {
                const item = document.createElement('div');
                item.className = 'gallery-item';
                item.innerHTML = `<img src="${url}" onclick="viewImage('${url}')">`;
                galleryContainer.appendChild(item);
            });
        }

        detailView.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    // --- LOGIC SCROLL TOP THÔNG MINH ---
    function toggleScrollBtn(position) {
        if (position > 500) scrollTopBtn.classList.add('show');
        else scrollTopBtn.classList.remove('show');
    }

    // Scroll trang chủ
    window.addEventListener('scroll', () => {
        if(detailView.style.display !== 'block') toggleScrollBtn(window.scrollY);
    });

    // Scroll trang detail
    detailView.addEventListener('scroll', () => {
        if(detailView.style.display === 'block') toggleScrollBtn(detailView.scrollTop);
    });

    scrollTopBtn.onclick = () => {
        if (detailView.style.display === 'block') {
            detailView.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Close & Lightbox
    document.querySelector('.back-btn').onclick = () => {
        detailView.style.display = 'none';
        document.body.style.overflow = 'auto';
        videoContainer.innerHTML = '';
    };

    window.viewImage = (url) => {
        lbImg.src = url;
        lightbox.style.display = 'flex';
    };
    closeLb.onclick = () => lightbox.style.display = 'none';
    lightbox.onclick = (e) => { if (e.target === lightbox) lightbox.style.display = 'none'; };
});