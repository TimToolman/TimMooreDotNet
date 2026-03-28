/**
 * Photos JavaScript - loads photos from local images/photos/ folder
 */

const PHOTOS_DIR = 'images/photos/';
const MANIFEST = PHOTOS_DIR + 'manifest.json';

let galleryImages = [];

document.addEventListener('DOMContentLoaded', () => {
    loadPhotos();
    initLightbox();
});

async function loadPhotos() {
    const loading = document.getElementById('gallery-loading');
    const errorEl = document.getElementById('gallery-error');
    const grid = document.getElementById('gallery-grid');

    try {
        const res = await fetch(MANIFEST);
        if (!res.ok) throw new Error('Could not load photo manifest.');

        const files = await res.json();

        if (files.length === 0) {
            loading.style.display = 'none';
            errorEl.style.display = 'block';
            errorEl.textContent = 'No photos found. Add photos to images/photos/ and run generate-photos-manifest.sh.';
            return;
        }

        galleryImages = files.map(filename => ({
            name: filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
            url: PHOTOS_DIR + filename
        }));

        loading.style.display = 'none';

        galleryImages.forEach((img, index) => {
            const div = document.createElement('div');
            div.className = 'gallery-item visible';
            div.innerHTML = `
                <div class="gallery-image">
                    <img src="${img.url}" alt="${img.name}" loading="lazy">
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
        lightboxImage.src = img.url;
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
