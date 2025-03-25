/**
 * Photos JavaScript for Tim Moore's Personal Website
 * Handles photo gallery functionality
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize gallery filtering
    initGalleryFilter();
    
    // Initialize lightbox functionality
    initLightbox();
});

/**
 * Initialize gallery filtering functionality
 */
function initGalleryFilter() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const galleryItems = document.querySelectorAll('.gallery-item');
    
    if (!filterButtons.length || !galleryItems.length) return;
    
    // Set all items as visible initially
    galleryItems.forEach(item => {
        item.classList.add('visible');
    });
    
    // Add click event to filter buttons
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            filterButtons.forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            button.classList.add('active');
            
            // Get filter value
            const filterValue = button.getAttribute('data-filter');
            
            // Filter gallery items
            galleryItems.forEach(item => {
                // Remove previous classes
                item.classList.remove('visible', 'hidden');
                
                // Add appropriate class based on filter
                if (filterValue === 'all' || item.getAttribute('data-category') === filterValue) {
                    item.classList.add('visible');
                } else {
                    item.classList.add('hidden');
                }
            });
        });
    });
}

/**
 * Initialize lightbox functionality
 */
function initLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightbox-image');
    const lightboxTitle = document.getElementById('lightbox-title');
    const lightboxDescription = document.getElementById('lightbox-description');
    const lightboxClose = document.querySelector('.lightbox-close');
    const lightboxPrev = document.querySelector('.lightbox-prev');
    const lightboxNext = document.querySelector('.lightbox-next');
    const galleryItems = document.querySelectorAll('.gallery-item');
    
    if (!lightbox || !galleryItems.length) return;
    
    let currentIndex = 0;
    const galleryImages = [];
    
    // Collect all gallery images and their info
    galleryItems.forEach((item, index) => {
        const img = item.querySelector('img');
        const title = item.querySelector('h3').textContent;
        const description = item.querySelector('p').textContent;
        
        galleryImages.push({
            src: img.src,
            alt: img.alt,
            title: title,
            description: description
        });
        
        // Add click event to open lightbox
        item.addEventListener('click', (e) => {
            e.preventDefault();
            openLightbox(index);
        });
    });
    
    /**
     * Open lightbox with specified image index
     * @param {number} index - Index of the image to display
     */
    function openLightbox(index) {
        if (index < 0 || index >= galleryImages.length) return;
        
        currentIndex = index;
        const image = galleryImages[currentIndex];
        
        lightboxImage.src = image.src;
        lightboxImage.alt = image.alt;
        lightboxTitle.textContent = image.title;
        lightboxDescription.textContent = image.description;
        
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent scrolling when lightbox is open
    }
    
    /**
     * Close the lightbox
     */
    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = ''; // Restore scrolling
    }
    
    /**
     * Navigate to the previous image
     */
    function prevImage() {
        let newIndex = currentIndex - 1;
        if (newIndex < 0) newIndex = galleryImages.length - 1; // Loop to the end
        openLightbox(newIndex);
    }
    
    /**
     * Navigate to the next image
     */
    function nextImage() {
        let newIndex = currentIndex + 1;
        if (newIndex >= galleryImages.length) newIndex = 0; // Loop to the beginning
        openLightbox(newIndex);
    }
    
    // Add event listeners for lightbox controls
    lightboxClose.addEventListener('click', closeLightbox);
    lightboxPrev.addEventListener('click', prevImage);
    lightboxNext.addEventListener('click', nextImage);
    
    // Close lightbox when clicking outside the content
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;
        
        switch (e.key) {
            case 'Escape':
                closeLightbox();
                break;
            case 'ArrowLeft':
                prevImage();
                break;
            case 'ArrowRight':
                nextImage();
                break;
        }
    });
}
