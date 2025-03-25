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
