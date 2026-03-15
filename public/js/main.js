// Base JS for all pages (e.g., handling auth state in navbar)

document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in
    const token = localStorage.getItem('token');
    
    // If not on login/register and token exists, try to show correct navbar
    const authLinks = document.querySelectorAll('.nav-link[href="login.html"], .nav-link[href="register.html"]');
    if (token && authLinks.length > 0) {
        // We are on index.html but logged in
        const navbarNav = document.querySelector('#navbarNav ul');
        if (navbarNav) {
            navbarNav.innerHTML = `
                <li class="nav-item">
                    <a class="nav-link btn btn-primary text-white ms-2 px-3 fw-bold rounded-pill" href="dashboard.html">Go to Dashboard</a>
                </li>
            `;
        }
        
        // Update hero buttons
        const heroBtns = document.querySelector('.hero-content div.animate-up.delay-2');
        if (heroBtns) {
            heroBtns.innerHTML = `
                <a href="dashboard.html" class="btn btn-light btn-lg rounded-pill px-5 py-3 fw-bold shadow-sm hero-btn">Go to Dashboard</a>
            `;
        }
    }
});
