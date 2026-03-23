/**
 * Dashboard JavaScript for Tim Moore's Personal Website
 */

document.addEventListener('DOMContentLoaded', function() {
    // Tab switching functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Get the tab to activate
            const tabToActivate = this.getAttribute('data-tab');
            
            // Remove active class from all buttons and panes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            // Add active class to the clicked button
            this.classList.add('active');
            
            // Add active class to the corresponding pane
            document.getElementById(tabToActivate).classList.add('active');
        });
    });
    
    // Store the active tab in session storage
    function saveActiveTab() {
        const activeTab = document.querySelector('.tab-button.active').getAttribute('data-tab');
        sessionStorage.setItem('activeTab', activeTab);
    }
    
    // Restore the active tab from session storage
    function restoreActiveTab() {
        const activeTab = sessionStorage.getItem('activeTab');
        if (activeTab) {
            const tabToActivate = document.querySelector(`.tab-button[data-tab="${activeTab}"]`);
            if (tabToActivate) {
                tabToActivate.click();
            }
        }
    }
    
    // Save active tab when changing
    tabButtons.forEach(button => {
        button.addEventListener('click', saveActiveTab);
    });
    
    // Restore active tab on page load
    restoreActiveTab();
});

document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("posterModal");
    const modalImg = document.getElementById("modalPosterImage");
    const modalCaption = document.getElementById("modalCaption");
    const closeModal = document.querySelector(".modal-close");

    // Add click event to all poster images within posters-card elements
    document.querySelectorAll(".posters-card .poster-image img").forEach((img) => {
        img.addEventListener("click", () => {
            const card = img.closest(".posters-card");
            const title = card.querySelector(".poster-info h3").textContent;
            
            modal.style.display = "flex"; // Use flex for better centering
            modalImg.src = img.src;
            modalCaption.textContent = title;
            document.body.style.overflow = "hidden"; // Disable background scrolling
        });
    });

    // Close modal when the close button is clicked
    closeModal.addEventListener("click", () => {
        modal.style.display = "none";
        document.body.style.overflow = ""; // Re-enable background scrolling
    });

    // Close modal when clicking outside the image
    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            modal.style.display = "none";
            document.body.style.overflow = ""; // Re-enable background scrolling
        }
    });

    // Close modal with Escape key
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modal.style.display === "flex") {
            modal.style.display = "none";
            document.body.style.overflow = ""; // Re-enable background scrolling
        }
    });

    // Make entire poster card clickable
    document.addEventListener('DOMContentLoaded', function() {
         const posterCards = document.querySelectorAll('.poster-card, .poster-card-red');
         posterCards.forEach(function(card) {
            card.addEventListener('click', function(e) {
                // Find the img element within this card
                const img = this.querySelector('.poster-image img');
                 if (img) {
                    // Trigger the click on the image (which should open the modal)
                    img.click();
                    }
                });
            });
        });

});
