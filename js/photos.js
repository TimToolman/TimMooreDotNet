/**
 * Photos JavaScript - loads photos from OneDrive shared folder
 */

const SHARE_URL = 'https://1drv.ms/f/c/ac0b1765bdd9ddbd/IgB7H-73RelQT4hx1O02eiRlAUK4Ab45ZVk3JCmSIVZi5-Y?e=qtUVIU';

let galleryImages = [];

document.addEventListener('DOMContentLoaded', () => {
    loadPhotos();
    initLightbox();
});

function getShareToken(url) {
    return btoa('u!' + url).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}

async function loadPhotos() {
    const loading = document.getElementById('gallery-loading');
    const errorEl = document.getElementById('gallery-error');
    const grid = document.getElementById('gallery-grid');

    try {
        const token = getShareToken(SHARE_URL);
        const apiUrl = `https://graph.microsoft.com/v1.0/shares/${token}/driveItem/children?$expand=thumbnails&$top=100`;

        const res = await fetch(apiUrl);
        if (!res.ok) throw new Error(`API returned ${res.status}`);

        const data = await res.json();
        const images = (data.value || []).filter(item => item.file && item.file.mimeType && item.file.mimeType.startsWith('image/'));

        if (images.length === 0) {
            throw new Error('No images found in the shared folder.');
        }

        galleryImages = images.map(item => {
            const thumb = item.thumbnails && item.thumbnails[0];
            return {
                name: item.name.replace(/\.[^.]+$/, ''),
                thumbUrl: thumb ? thumb.large.url : item['@microsoft.graph.downloadUrl'],
                fullUrl: item['@microsoft.graph.downloadUrl']
            };
        });

        loading.style.display = 'none';

        galleryImages.forEach((img, index) => {
            const div = document.createElement('div');
            div.className = 'gallery-item visible';
            div.innerHTML = `
                <div class="gallery-image">
                    <img src="${img.thumbUrl}" alt="${img.name}" loading="lazy">
                    <div class="gallery-overlay">
                        <div class="gallery-info">
                            <h3>${img.name}</h3>
                        </div>
                    </div>
                </div>`;
            div.addEventListener('click', () => openLightbox(index));
            grid.appendChild(div);
        });

    } catch (err) {
        loading.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = 'Could not load photos: ' + err.message;
        console.error(err);
    }
}

function initLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightbox-image');
    const lightboxTitle = document.getElementById('lightbox-title');
    const lightboxDescription = document.getElementById('lightbox-description');
    const lightboxClose = document.querySelector('.lightbox-close');
    const lightboxPrev = document.querySelector('.lightbox-prev');
    const lightboxNext = document.querySelector('.lightbox-next');

    let currentIndex = 0;

    window.openLightbox = function(index) {
        if (!galleryImages.length) return;
        currentIndex = index;
        const img = galleryImages[currentIndex];
        lightboxImage.src = img.fullUrl || img.thumbUrl;
        lightboxImage.alt = img.name;
        lightboxTitle.textContent = img.name;
        lightboxDescription.textContent = '';
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
    }

    function prevImage() {
        currentIndex = (currentIndex - 1 + galleryImages.length) % galleryImages.length;
        window.openLightbox(currentIndex);
    }

    function nextImage() {
        currentIndex = (currentIndex + 1) % galleryImages.length;
        window.openLightbox(currentIndex);
    }

    lightboxClose.addEventListener('click', closeLightbox);
    lightboxPrev.addEventListener('click', prevImage);
    lightboxNext.addEventListener('click', nextImage);

    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') prevImage();
        if (e.key === 'ArrowRight') nextImage();
    });
}
