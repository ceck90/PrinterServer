
import { translate, updateTranslate, initI18n, getLanguageFromLocalStorage } from './i18n.js';
import { getThemeFromLocalStorage, setThemeInLocalStorage } from './theme.js';
// import { Toast } from 'bootstrap';

// import { flatpickr } from '../flatpickr/js/flatpickr.js';

let lang = "en-US"; // Default language
// let theme = getThemeFromLocalStorage(); // Default theme

/* 
    Shorthand functions to avoid verbose
*/
const byId = (id) => document.getElementById(id)

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

    /* 
        Spawn toast div to show messages
        Auto hides itself after 5 seconds
        Close on click
    */
    const spawnToast = (message, options = { title: "", icon: false }) => {

        const id = Math.floor((Math.random() * 10000000000) + 1)
        const toast = document.createElement("div")
        toast.id = id
        toast.classList.add("toast")
        toast.setAttribute("role", "alert")
        toast.setAttribute("aria-live", "assertive")
        toast.setAttribute("aria-atomic", "true")

        const header = document.createElement("div")
        header.classList.add("toast-header")

        const img = document.createElement("img")
        if (options) {
            if (options.icon === true) {
                img.src = "assets/img/favicon/favicon-32x32.png"
                img.classList.add("rounded", "me-2")
            }
        }

        const strong = document.createElement("strong")
        strong.classList.add("me-auto")
        strong.textContent = options.title || "Barcode"

        header.append(img, strong)

        const body = document.createElement("div")
        body.classList.add("toast-body")
        body.textContent = message
        toast.append(header, body)

        byId("toast-container").insertBefore(toast, byId("toast-container").firstChild)
        const toast_bootstrap = new bootstrap.Toast(byId(id))
        toast_bootstrap.show()
        toast.addEventListener("click", e => byId("toast-container").removeChild(toast))
        setTimeout(() => {
            try {
                byId("toast-container").removeChild(toast)
            } catch (e) {
                //
            }
        }, 5000)
    }

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
    
    const fetchPrinters = async () => {
        try {
            const response = await fetch('/api/printers/getAll');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const printers = await response.json();
            console.log("Fetched printers:", printers);
            return printers;
        } catch (error) {
            console.error("Error fetching printers:", error);
        }
    };

    const addPrinter = async (printer) => {
        try {
            const response = await fetch('/api/printers/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(printer)
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            console.log("Add printer result:", result);
            if (result.success) {
                alert(translate('Printer added successfully'));
                await fillPrinterTable(); // Refresh the table after adding
            } else {
                alert(translate('Error adding printer: ') + result.message);
            }
        } catch (error) {
            console.error("Error adding printer:", error);
            spawnToast(translate('Error adding printer: ') + error.message);
        }
    };

    const deletePrinter = async (printerKey) => {
        try {
            const response = await fetch(`/api/printers/delete/${printerKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            console.log("Delete printer result:", response);
            if (response) {
                // alert(translate('Printer deleted successfully'));
                spawnToast('Printer deleted successfully');
                await fillPrinterTable(); // Refresh the table after deletion
            } else {
                spawnToast(translate('Error deleting printer: ') + response);
            }
        } catch (error) {
            console.error("Error deleting printer:", error);
            spawnToast(translate('Error deleting printer: ') + error.message);
        }
    };

    const saveAllPrinters = async () => {
        const printerTableBody = document.getElementById('printers-table-body');
        if (!printerTableBody) {
            console.error("Printer table body not found");
            return;
        }
        const printers = [];
        const rows = printerTableBody.querySelectorAll('tr');
        rows.forEach(row => {
            const key = row.querySelector('input[id^="printer-key-"]');
            const nameInput = row.querySelector('input[id^="printer-name-"]');
            const ipInput = row.querySelector('input[id^="printer-ip-"]');
            const portInput = row.querySelector('input[id^="printer-port-"]');
            const destinationInput = row.querySelector('input[id^="printer-destination-"]');
            const activeCheckbox = row.querySelector('input[id^="printer-active-"]');
            const upsideDownCheckbox = row.querySelector('input[id^="printer-upside-down-"]');
            const beepEnableCheckbox = row.querySelector('input[id^="printer-beep-enable-"]');
            const descriptionInput = row.querySelector('input[id^="printer-description-"]');
            if (nameInput && ipInput && portInput && destinationInput && activeCheckbox && descriptionInput) {
                const printer = {
                    key: key.value.trim(),
                    name: nameInput.value.trim(),
                    ip: ipInput.value.trim(),
                    port: parseInt(portInput.value.trim(), 10),
                    destination: destinationInput.value.trim(),
                    active: activeCheckbox.checked,
                    upsideDown: upsideDownCheckbox ? upsideDownCheckbox.checked : false, // Handle upside down checkbox
                    beepEnable: beepEnableCheckbox ? beepEnableCheckbox.checked : false,
                    description: descriptionInput.value.trim()
                };
                printers.push(printer);
            }
        });
        try {
            const response = await fetch('/api/printers/saveAll', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(printers)
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            console.log("Save result:", response);
            if (response) {
                // alert(translate('Printers saved successfully'));
                spawnToast(translate('Printers saved successfully'));
                await fillPrinterTable(); // Refresh the table after saving
            } else {
                // alert(translate('Error saving printers: ') + response);
                spawnToast(translate('Error saving printers: ') + response);
            }
        } catch (error) {
            console.error("Error saving printers:", error);
            // alert(translate('Error saving printers: ') + error.message);
            spawnToast(translate('Error saving printers: ') + error.message);
        }
    };

    const fillPrinterTable = async () => {
        const printerTableBody = document.getElementById('printers-table-body');
        if (!printerTableBody) {
            console.error("Printer table body not found");
            return;
        }
        printerTableBody.innerHTML = ''; // Clear existing rows
        const printers = await fetchPrinters();
        printers.forEach(printer => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><input type="text" class="form-control" id="printer-key-${printer.key}" value="${printer.key}"></td>
                <td><input type="text" class="form-control" id="printer-name-${printer.key}" value="${printer.name}"></td>
                <td><input type="text" class="form-control" id="printer-ip-${printer.key}" value="${printer.ip}"></td>
                <td><input type="number" class="form-control" id="printer-port-${printer.key}" value="${printer.port}"></td>
                <td><input type="text" class="form-control" id="printer-destination-${printer.key}" value="${printer.destination}"></td>
                <td>
                    <input type="checkbox" class="form-check-input printer-active-checkbox align-item-center" id="printer-active-${printer.key}" ${printer.active ? 'checked' : ''}>
                </td>
                <td>
                    <input type="checkbox" class="form-check-input printer-upside-down-checkbox align-item-center" id="printer-upside-down-${printer.key}" ${printer.upsideDown ? 'checked' : ''}>
                </td>
                <td>
                    <input type="checkbox" class="form-check-input printer-beep-enable-checkbox align-item-center" id="printer-beep-enable-${printer.key}" ${printer.beepEnable ? 'checked' : ''}>
                </td>
                <td><input type="text" class="form-control" id="printer-description-${printer.key}" value="${printer.description}"></td>
                <td>
                    <div class="d-flex justify-content-center align-items-center">
                        <button class="btn btn-primary btn-sm me-2" id="btn-test-${printer.key}" data-printer="${printer.key}" title="TEST">
                            <i class="bi bi-printer-fill"></i>
                        </button>
                        <button class="btn btn-danger btn-sm btn-delete" id="btn-delete-${printer.key}" data-printer="${printer.key}" title="Delete">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            printerTableBody.appendChild(row);
        });
        await addTableEventListeners(); // Re-add event listeners for new rows
    };

    const addEventListeners = async () => {
        const addPrinterBtn = document.getElementById('add-printer-btn');
        if (addPrinterBtn) {
            addPrinterBtn.addEventListener('click', async () => {
                const newPrinterKey = prompt("Enter printer key:");
                if (newPrinterKey) {
                    const newRow = document.createElement('tr');
                    newRow.innerHTML = `
                        <td><input type="text" class="form-control" id="printer-key-${newPrinterKey}" value="${newPrinterKey}"></td>
                        <td><input type="text" class="form-control" id="printer-name-${newPrinterKey}" value="${newPrinterKey.toUpperCase()}"></td>
                        <td><input type="text" class="form-control" id="printer-ip-${newPrinterKey}" value=""></td>
                        <td><input type="number" class="form-control" id="printer-port-${newPrinterKey}" value="9100"></td>
                        <td><input type="text" class="form-control" id="printer-destination-${newPrinterKey}" value="${newPrinterKey.toUpperCase()}"></td>
                        <td><input type="checkbox" class="form-check-input printer-active-checkbox" id="printer-active-${newPrinterKey}"></td>
                        <td><input type="checkbox" class="form-check-input printer-upside-down-checkbox" id="printer-upside-down-${newPrinterKey}"></td>
                        <td><input type="checkbox" class="form-check-input printer-beep-enable-checkbox" id="printer-beep-enable-${newPrinterKey}"></td>
                        <td><input type="text" class="form-control" id="printer-description-${newPrinterKey}" value=""></td>
                        <td>
                            <div class="d-flex justify-content-center align-items-center">
                                <button class="btn btn-primary btn-sm me-2" id="btn-test-${newPrinterKey}" data-printer="${newPrinterKey}" title="TEST">
                                    <i class="bi bi-printer-fill"></i>
                                </button>
                                <button class="btn btn-danger btn-sm btn-delete" id="btn-delete-${newPrinterKey}" data-printer="${newPrinterKey}" title="Delete">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </td>
                    `;
                    const printerTableBody = document.getElementById('printers-table-body');
                    if (printerTableBody) {
                        printerTableBody.appendChild(newRow);
                    }
                }
            });
        }

        const saveButtons = document.querySelectorAll('#save-printers-btn');
        saveButtons.forEach(button => {
            button.addEventListener('click', async () => {
                await saveAllPrinters();
            });
        });
    };

    const addTableEventListeners = async () => {
        const deleteButtons = document.querySelectorAll('.btn-delete');
        deleteButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const printerKey = button.dataset.printer;
                if (printerKey) {
                    console.log("Deleting printer:", printerKey);
                    if (!confirm(translate('Are you sure you want to delete this printer?'))) {
                        return;
                    }
                    await deletePrinter(printerKey);
                }
            });
        });

        const testButtons = document.querySelectorAll('[id^="btn-test-"]');
        testButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const printerKey = button.dataset.printer;
                if (printerKey) {
                    console.log("Testing printer:", printerKey);
                    const response = await fetch(`/api/printers/test/${printerKey}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    if(response) {
                        alert(translate('Printer test successful: ') + printerKey);
                    }
                    // Implement the test functionality here
                    // alert(translate('Testing printer: ') + printerKey);
                }
            });
        });
    };
    
    // -- Initialize the language and theme

    lang = await initI18n();
    applyThemeFromLocalStorage();

    await updateTranslate();

    await fillPrinterTable();

    await addEventListeners();
});