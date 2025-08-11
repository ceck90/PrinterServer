
import { translate, updateTranslate, initI18n, getLanguageFromLocalStorage } from './i18n.js';
import { getThemeFromLocalStorage, setThemeInLocalStorage } from './theme.js';
// import { Toast } from 'bootstrap';

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

    // Funzione per mostrare un toast Bootstrap
    function showToast(message, options = {}) {
        // Cerca o crea il contenitore dei toast
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(toastContainer);
        }

        // Crea il markup del toast
        const toastElem = document.createElement('div');
        toastElem.className = 'toast align-items-center text-bg-primary border-0';
        toastElem.setAttribute('role', 'alert');
        toastElem.setAttribute('aria-live', 'assertive');
        toastElem.setAttribute('aria-atomic', 'true');
        toastElem.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;

        toastContainer.appendChild(toastElem);

        
        // Opzioni di default
        const toastOptions = {
            delay: options.delay || 3000,
            autohide: options.autohide !== undefined ? options.autohide : true
        };
        // $('.toast').toast(toastOptions);

        // Inizializza e mostra il toast
        // const toast = new Toast(toastElem, toastOptions);
        // toast.show();

        // Rimuovi il toast dal DOM quando viene nascosto
        toastElem.addEventListener('hidden.bs.toast', () => {
            toastElem.remove();
        });
    }

    // Esempio d'uso:
    // showToast('Hello, this is a Bootstrap toast!');

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

    const languageDropdown = document.getElementById('languageDropdown');
    if (languageDropdown) {
        const dropdownItems = document.querySelectorAll('.dropdown-item');
        const dropdownToggle = document.getElementById('languageDropdown');
        dropdownItems.forEach(item => {
            if (item.dataset.lang === currentLang) {
                dropdownToggle.textContent = item.textContent;
                dropdownToggle.setAttribute('aria-label', item.textContent);
            }
        });
    }

    const handleScannerInput = (event) => {
        const input = event.target.value;
        // Do something with the scanned input
        console.log("Scanned input: " + input);
        // check pattern matching
        const pattern = /^MFO-\w{24}$/;
        if (!pattern.test(input)) {
            console.log("Input does not match required format (MFO- followed by 24 alphanumeric characters)");
            return;
        }
        else {
            console.log("Valid input:", input);
            const id = input.replace(/^MFO-/, '');
            console.log("Extracted ID:", id);
            // Add the scanned result to the table
            const resultsTable = document.getElementById('scanner-results');
            const newRow = resultsTable.insertRow();
            newRow.innerHTML = `
            <td>${input}</td>
            <td>${id}</td>
            <td>${new Date().toLocaleString()}</td>
            <td><span class="badge bg-success">Scanned</span></td>
            `;
        }
        // Clear the input field after processing
        event.target.value = '';
        event.target.focus();
    };

    const addEventListeners = async () => {
        const scannerInput = document.getElementById('scanner-input');
        if (scannerInput) {
            scannerInput.addEventListener('keypress', function(event) {
                if (event.key === 'Enter') {
                    handleScannerInput(event);
                }
            });
        }
    };

    setInterval(() => {
        const scannerInput = document.getElementById('scanner-input');
        if (scannerInput && document.activeElement !== scannerInput) {
            scannerInput.focus();
        }
    }, 2000);

    lang = await initI18n();
    applyThemeFromLocalStorage();

    await updateTranslate();

    await addEventListeners();
});