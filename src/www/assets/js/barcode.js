import { translate, updateTranslate, initI18n, getLanguageFromLocalStorage } from './i18n.js';
import { getThemeFromLocalStorage, setThemeInLocalStorage } from './theme.js';
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

    // Esempio d'uso:
    // spawnToast('Hello, this is a Bootstrap toast!');

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

    const applyRoleFromLocalStorage = () => {
        const storedRole = localStorage.getItem('role') || 'none';
        document.body.setAttribute('data-role', storedRole);

        const pass_role = document.getElementById('role-pass');
        if (pass_role) {
            pass_role.checked = storedRole === 'pass';
        }

        const kitchen_role = document.getElementById('role-kitchen');
        if (kitchen_role) {
            kitchen_role.checked = storedRole === 'kitchen';
        }

        console.log("Apply role: " + storedRole);
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

    const handleScannerInput = async (event) => {
        const input = event.target.value;
        // Do something with the scanned input
        console.log("Scanned input: " + input);
        // check pattern matching
        const pattern = /^MFO\w{24}$/;
        if (!pattern.test(input)) {
            console.log("Input does not match required format (MFO followed by 24 alphanumeric characters)");
            return;
        }
        else {
            console.log("Valid input:", input);
            const id = input.replace(/^MFO/, '');
            console.log("Extracted ID:", id);
            // Add the scanned result to the table
            const resultsTable = document.getElementById('scanner-results');
            const newRow = resultsTable.insertRow();
            let response = null;
            newRow.innerHTML = `
                <td>${input}</td>
                <td>${id}</td>
                <td>${new Date().toLocaleString()}</td>
                <td><span class="badge bg-success">Scanned</span></td>
            `;
            try {
                const role = localStorage.getItem('role') || 'none';
                response = await saveScannedBarcode(input, id, role);

                let timerInterval;
                console.log(response)
                spawnToast("ID: " + id, { title: "Processing barcode", icon: true });
                // Swal.fire({
                //     theme: "auto",
                //     title: "Processing...",
                //     // html: "I will close in <b></b> milliseconds.",
                //     timer: 1000,
                //     icon: "success",
                //     // timerProgressBar: true,
                //     didOpen: () => {
                //         // Swal.showLoading();
                //         // const timer = Swal.getPopup().querySelector("b");
                //         // timerInterval = setInterval(() => {
                //             // timer.textContent = `${Swal.getTimerLeft()}`;
                //         // }, 100);
                //     },
                //     willClose: () => {
                //         clearInterval(timerInterval);
                //     }
                // }).then((result) => {
                //     /* Read more about handling dismissals below */
                //     if (result.dismiss === Swal.DismissReason.timer) {
                //         // console.log("I was closed by the timer");
                //     }
                // });
            } catch (error) {
                console.error("Failed to save scanned barcode:", error);
                spawnToast("Error saving scanned barcode.", { title: "Error", icon: true });
                // Swal.fire({
                //     theme: "auto",
                //     title: "Error",
                //     text: "Failed to save scanned barcode.",
                //     icon: "error",
                //     confirmButtonText: "OK"
                // });
                // spawnToast("Error saving scanned barcode.", { delay: 4000, autohide: true });
            }

        }
        // Clear the input field after processing
        event.target.value = '';
        event.target.focus();
    };

    const saveScannedBarcode = async (input, id, role) => {
        try {
            const response = await fetch(`/api/barcodes/add/${id}?role=${encodeURIComponent(role)}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ code: id, timestamp: new Date().toISOString(), success: true })
            });
            if (!response.ok) throw new Error("Network response was not ok");
            console.log("Saved scanned barcode:", response);
        } catch (error) {
            console.error("Error saving scanned barcode:", error);
            throw error; // Rethrow the error to handle it in the calling function
        }
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

        const codeReloadButton = document.getElementById('code-reload-button');
        if (codeReloadButton) {
            codeReloadButton.addEventListener('click', async () => {
                await fillBarcodeTable();
            });
        }

        const toggleBtn = document.getElementById('toggle-barcode-table');
        const tableContainer = document.getElementById('barcode-table-container');
        let isVisible = tableContainer.style.display !== 'none';
        toggleBtn.classList.toggle('bi-eye-slash', isVisible);
        toggleBtn.classList.toggle('bi-eye', !isVisible);

        toggleBtn.addEventListener('click', () => {
            isVisible = !isVisible;
            tableContainer.style.display = isVisible ? '' : 'none';
            toggleBtn.classList.toggle('bi-eye-slash', isVisible);
            toggleBtn.classList.toggle('bi-eye', !isVisible);
        });

        document.getElementById('role-kitchen').addEventListener('change', function() {
            // Handle kitchen role selection
            document.body.setAttribute('data-role', 'kitchen');
            localStorage.setItem('role', 'kitchen');
        });
        document.getElementById('role-pass').addEventListener('change', function() {
            // Handle pass role selection
            document.body.setAttribute('data-role', 'pass');
            localStorage.setItem('role', 'pass');
        });
    };

    setInterval(() => {
        const scannerInput = document.getElementById('scanner-input');
        if (scannerInput && document.activeElement !== scannerInput) {
            scannerInput.focus();
        }
    }, 2000);

    const fetchBarcodes = async () => {
        try {
            const response = await fetch("/api/barcodes/getAll");
            if (!response.ok) throw new Error("Network response was not ok");
            const data = await response.json();
            return data; // Return the fetched barcodes
            // console.log("Fetched barcodes:", data);
        } catch (error) {
            console.error("Error fetching barcodes:", error);
        }
    };

    const fillBarcodeTable = async () => { // Accept barcodes as a parameter
        const tableBody = document.getElementById('scanner-results');
        tableBody.innerHTML = ''; // Clear existing rows
        const barcodes = await fetchBarcodes();
        // console.log("Fetched barcodes:", barcodes);
        barcodes.forEach(barcode => {
            // console.log("Processing barcode:", barcode);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>MFO${barcode.code}</td>
                <td>${barcode.code}</td>
                <td>${barcode.timestamp.toLocaleString()}</td>
                <td><span class="badge bg-success">${barcode.success ? 'Scanned' : 'Error'}</span></td>
            `;
            tableBody.appendChild(row);
        });
    };

    lang = await initI18n();
    applyThemeFromLocalStorage();

    applyRoleFromLocalStorage();

    await updateTranslate();

    await fillBarcodeTable();

    await addEventListeners();
});