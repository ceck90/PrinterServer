import { translate, updateTranslate, initI18n, getLanguageFromLocalStorage } from './i18n.js';
import { applyThemeFromLocalStorage, setupThemeHandlers } from './theme.js';
import { byId } from './utility.js';

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

    async function handleLogin() {
        // Handle login button click
        const username = document.getElementById('floatingInput').value;
        const password = document.getElementById('floatingPassword').value;

        // console.log(`Attempting login with username: ${username} and password: ${password}`);
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

            console.log(response);

            if (response.ok) {
                const result = await response.json();
                console.log('Login successful:', result);
                // Redirect or update UI as needed
                if (result.token) {
                    if (document.getElementById('checkRememberMe').checked) {
                        localStorage.setItem('authToken', result.token);
                        localStorage.setItem('rememberMe', 'true');
                    }
                    else {
                        localStorage.removeItem('authToken');
                        localStorage.removeItem('rememberMe');
                    }
                    // Redirect to dashboard or main page
                    // Token is already stored in localStorage; no need to pass via URL
                    window.location.href = '/?token=' + result.token;
                }
            } else {
                console.error('Login failed:');
                document.getElementById('error-message').textContent = translate("login.failed") + ": " + response.statusText;
                // Show error message to user
            }
        } catch (error) {
            console.error('Error during login request:', error);
            // Show error message to user
        }
    }

    byId('loginBtn').addEventListener('click', async () => {
        await handleLogin();
    });

    byId('floatingPassword').addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            await handleLogin();
        }
    });

    lang = await initI18n();
    applyThemeFromLocalStorage();
    setupThemeHandlers();

    await updateTranslate();

    if(localStorage.getItem('rememberMe') === 'true'){
        document.getElementById('checkRememberMe').checked = true;
    }

    if (localStorage.getItem('authToken') && localStorage.getItem('rememberMe') === 'true') {
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
                localStorage.removeItem('rememberMe');
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
