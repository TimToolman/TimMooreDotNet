/**
 * Main JavaScript for Tim Moore's Personal Website
 * Handles general website functionality
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize smooth scrolling for anchor links
    initSmoothScroll();
    
    // Initialize header scroll behavior
    initHeaderScroll();
});

/**
 * Initialize smooth scrolling for anchor links
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (!targetElement) return;
            
            const headerOffset = 80; // Account for fixed header
            const elementPosition = targetElement.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
            
            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        });
    });
}

/**
 * Initialize header scroll behavior
 * Adds a shadow and changes opacity when scrolling down
 */
function initHeaderScroll() {
    const header = document.querySelector('header');
    if (!header) return;
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
    
    // Trigger scroll event on page load to set initial state
    window.dispatchEvent(new Event('scroll'));
}

/**
 * Utility function to check if an element is in viewport
 * @param {HTMLElement} element - The element to check
 * @param {number} offset - Optional offset value
 * @returns {boolean} - Whether the element is in viewport
 */
function isInViewport(element, offset = 0) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top <= (window.innerHeight - offset || document.documentElement.clientHeight - offset) &&
        rect.left <= (window.innerWidth || document.documentElement.clientWidth) &&
        rect.bottom >= offset &&
        rect.right >= 0
    );
}

/**
 * Utility function to add animation when elements come into view
 * @param {string} selector - CSS selector for elements to animate
 * @param {string} animationClass - CSS class to add for animation
 */
function animateOnScroll(selector, animationClass) {
    const elements = document.querySelectorAll(selector);
    
    function checkAnimation() {
        elements.forEach(element => {
            if (isInViewport(element, 50) && !element.classList.contains(animationClass)) {
                element.classList.add(animationClass);
            }
        });
    }
    
    // Check on scroll
    window.addEventListener('scroll', checkAnimation);
    
    // Check on page load
    checkAnimation();
}

// Add CSS class to header when scrolled
document.addEventListener('scroll', () => {
    const header = document.querySelector('header');
    if (window.scrollY > 10) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
});

// Add scrolled class to header on page load if needed
window.addEventListener('load', () => {
    const header = document.querySelector('header');
    if (window.scrollY > 10) {
        header.classList.add('scrolled');
    }
});
