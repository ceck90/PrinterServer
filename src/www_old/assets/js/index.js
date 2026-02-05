import { translate, updateTranslate, initI18n, getLanguageFromLocalStorage } from './i18n.js';
import { applyThemeFromLocalStorage, setupThemeHandlers } from './theme.js';
import { spawnToast } from './utility.js';

// import { flatpickr } from '../flatpickr/js/flatpickr.js';

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

    const btnLogout = document.getElementById('logout-button');

    btnLogout.addEventListener('click', () => {
        // Handle logout logic here
        localStorage.removeItem("authToken");
        window.location.href = "/";
        console.log("[LOGOUT] User logged out");
    });

        

    const addEventListeners = () => {
        
    }

    /**
     * Initializes a WebSocket connection to the server and handles incoming messages, connection events, and errors.
     * 
     * - Logs connection attempts and status updates to the console.
     * - Updates the DOM with incoming data based on message type.
     * - Automatically attempts to reconnect if the connection is closed.
     * 
     * @function
     * @name startWebSocket
     */
    const startWebSocket = () => {
        console.log(translate('serverConnecting') + `${window.location.hostname}:${window.location.port}`);
        const socket = new WebSocket(`ws://${window.location.hostname}:${window.location.port}/api/ws`);
        appendToConsole(translate('serverConnecting'));

        setServerStatus('connecting');

        socket.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            if (data.type === "event") {
                appendToConsole(`${data.type}: ${data.message}`);
            } else if (data.type === "update" && data.id && data.value !== undefined) {
                appendToConsole(`Updated LastValue for ID ${data.id} to ${data.value}`);
            } else if (data.type === "heartbeat") {
                updateServerStatus(data);
            }
        };

        socket.onopen = () => {
            setServerStatus('connected');
            updateServerStatus();
            appendToConsole(translate('serverConnected'));
        };

        socket.onerror = (error) => {
            setServerStatus('error');
            appendToConsole(translate('serverError'));
        };

        socket.onclose = () => {
            setServerStatus('disconnected');
            appendToConsole(translate('serverClosed'));
            setTimeout(startWebSocket, 5000); // Attempt to reconnect after 5 seconds
        };
    };

    lang =await initI18n();
    applyThemeFromLocalStorage();
    setupThemeHandlers();

    await updateTranslate();

    // startWebSocket();
});