import { translate, updateTranslate, initI18n, getLanguageFromLocalStorage } from './i18n.js';
import { getThemeFromLocalStorage, setThemeInLocalStorage } from './theme.js';

let lang = "en-US"; // Default language
// let theme = getThemeFromLocalStorage(); // Default theme


/**
 * Handles the initialization of the status page once the DOM is fully loaded.
 * 
 * - Loads language dictionaries for supported languages.
 * - Detects the browser's language and sets the current language.
 * - Updates the language dropdown UI to reflect the selected language.
 * - Provides a translation function for UI elements.
 * - Updates all elements with the `data-i18n` attribute using the current language.
 * - Fetches the server status and updates the UI accordingly.
 * - Initializes and manages a WebSocket connection to receive real-time updates from the server.
 * - Appends messages to a web-based console with timestamps.
 * 
 * @event DOMContentLoaded
 * @async
 */

document.addEventListener("DOMContentLoaded", async () => {

    const themeItems = document.querySelectorAll('.theme-item');
    
    themeItems.forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            const currentTheme = document.documentElement.getAttribute('data-bs-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-bs-theme', newTheme);
            setThemeInLocalStorage(newTheme);

            if (item) {
                item.classList.remove('bi-brightness-high', 'bi-moon', 'bi-circle-half');
                item.classList.add(newTheme === 'dark' ? 'bi-moon' : 'bi-brightness-high');
                item.alt = newTheme === 'dark' ? 'Dark Theme' : 'Light Theme';
            }
        });
    });

    const themeIcons = document.querySelectorAll('.icon-theme');
    themeIcons.forEach(themeIcon => {
        const updateIconTheme = () => {
            const theme = document.documentElement.getAttribute('data-bs-theme');
            themeIcon.classList.toggle('text-light', theme === 'dark');
            themeIcon.classList.toggle('text-dark', theme === 'light');
        };
        updateIconTheme();
        const observer = new MutationObserver(updateIconTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });
    });

    const applyThemeFromLocalStorage = () => {
        const storedTheme = getThemeFromLocalStorage();
        document.documentElement.setAttribute('data-bs-theme', storedTheme);

        document.querySelectorAll('.theme-item').forEach(icon => {
            icon.classList.remove('bi-brightness-high', 'bi-moon', 'bi-circle-half');
            icon.classList.add(storedTheme === 'dark' ? 'bi-moon' : 'bi-brightness-high');
            icon.alt = storedTheme === 'dark' ? 'Dark Theme' : 'Light Theme';
        });

        console.log("Apply theme: " + storedTheme);
    };

    const loginBtn = document.getElementById('loginBtn');
    loginBtn.addEventListener('click', async () => {
        // Handle login button click
        const username = document.getElementById('floatingInput').value;
        const password = document.getElementById('floatingPassword').value;

        console.log(`Attempting login with username: ${username} and password: ${password}`);
        // Perform login logic here (e.g., send credentials to the server)

        try {
            const headers = {
                'Content-Type': 'application/json'
            };
            const token = localStorage.getItem('authToken');
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const response = await fetch('/api/login', {
                method: 'POST',
                headers,
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();
            if (response.ok) {
                console.log('Login successful:', result);
                // Redirect or update UI as needed
                if (result.token) {
                    localStorage.setItem('authToken', result.token);
                    // Redirect to dashboard or main page
                    // Token is already stored in localStorage; no need to pass via URL
                    window.location.href = '/?token=' + result.token;
                }
            } else {
                console.error('Login failed:', result);
                // Show error message to user
            }
        } catch (error) {
            console.error('Error during login request:', error);
            // Show error message to user
        }
    });

    lang = await initI18n();
    applyThemeFromLocalStorage();

    await updateTranslate();

    if (localStorage.getItem('authToken')) {
        // headers['Authorization'] = `Bearer ${localStorage.getItem('authToken')}`;
        console.log(`Using token: ${localStorage.getItem('authToken')}`);
        try {
            const response = await fetch('/api/verify-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            // console.log(`Token verification response: }`, response);
            const result = await response.json();
            if (!response.ok || !result.valid) {
                localStorage.removeItem('authToken');
                console.error('Token non valido, rimosso da localStorage.');
                return;
            }
            // Token valido, continua con il redirect
            window.location.href = '/?token=' + localStorage.getItem('authToken');
        } catch (error) {
            localStorage.removeItem('authToken');
            console.error('Errore durante la verifica del token:', error);
            return;
        }
    }

});
