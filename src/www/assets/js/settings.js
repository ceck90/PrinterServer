import { translate, updateTranslate, initI18n, getLanguageFromLocalStorage } from './i18n.js';
import { getThemeFromLocalStorage, setThemeInLocalStorage } from './theme.js';

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
                <td><input type="text" class="form-control" id="printer-name-${printer.name}" value="${printer.name}"></td>
                <td><input type="text" class="form-control" id="printer-ip-${printer.name}" value="${printer.ip}"></td>
                <td><input type="number" class="form-control" id="printer-port-${printer.name}" value="${printer.port}"></td>
                <td><input type="text" class="form-control" id="printer-destination-${printer.name}" value="${printer.destination}"></td>
                <td>
                    <input type="checkbox" class="form-check-input printer-active-checkbox" id="printer-active-${printer.name}" ${printer.active ? 'checked' : ''}>
                </td>
                <td><input type="text" class="form-control" id="printer-description-${printer.name}" value="${printer.description}"></td>
                <td>
                    <button class="btn btn-danger btn-sm btn-delete" id="btn-delete-${printer.name}" data-printer="${printer.name}" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;

            // Make cells editable except for the action buttons
            const cells = row.querySelectorAll('td');
            // name, ip, port, destination, active, description
            // cells[0] = name, cells[1] = ip, cells[2] = port, cells[3] = destination, cells[4] = active, cells[5] = description

            // Make editable except for action buttons (cells[6])
            [0, 1, 2, 3, 5].forEach(idx => {
                cells[idx].setAttribute('contenteditable', 'true');
            });

            // Replace 'active' cell with a checkbox
            const activeCell = cells[4];
            activeCell.innerHTML = `
                <input type="checkbox" class="form-check-input printer-active-checkbox" ${printer.active ? 'checked' : ''}>
            `;
            printerTableBody.appendChild(row);
        });
    };

    const addEventListeners = async () => {
        const addPrinterBtn = document.getElementById('add-printer-btn');
        if (addPrinterBtn) {
            addPrinterBtn.addEventListener('click', async () => {
                const newPrinterName = prompt("Enter printer name:");
                if (newPrinterName) {
                    const newRow = document.createElement('tr');
                    newRow.innerHTML = `
                        <td><input type="text" class="form-control" id="printer-name-${newPrinterName}" value="${newPrinterName}"></td>
                        <td><input type="text" class="form-control" id="printer-ip-${newPrinterName}" value=""></td>
                        <td><input type="number" class="form-control" id="printer-port-${newPrinterName}" value=""></td>
                        <td><input type="text" class="form-control" id="printer-destination-${newPrinterName}" value=""></td>
                        <td><input type="checkbox" class="form-check-input printer-active-checkbox" id="printer-active-${newPrinterName}"></td>
                        <td><input type="text" class="form-control" id="printer-description-${newPrinterName}" value=""></td>
                        <td>
                            <button class="btn btn-danger btn-sm btn-delete" id="btn-delete-${newPrinterName}" data-printer="${newPrinterName}" title="Delete">
                                <i class="bi bi-trash"></i>
                            </button> 
                        </td>
                    `;
                    const printerTableBody = document.getElementById('printers-table-body');
                    if (printerTableBody) {
                        printerTableBody.appendChild(newRow);
                    }
                    // Add event listeners for the new row's buttons
                    const deleteButton = newRow.querySelector('.btn-delete');
                    if (deleteButton) {
                        deleteButton.addEventListener('click', async () => {
                            const printerName = deleteButton.dataset.printer;
                            if (printerName) {
                                await deletePrinter(printerName);
                            }
                        });
                    }
                }
            });
        }

        const deleteButtons = document.querySelectorAll('.btn-delete');
        deleteButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const printerName = button.dataset.printer;
                if (printerName) {
                    console.log("Deleting printer:", printerName);
                    await deletePrinter(printerName);
                }
            });
        });

        const saveButtons = document.querySelectorAll('#save-printers-btn');
        saveButtons.forEach(button => {
            button.addEventListener('click', async () => {
                await saveAllPrinters();
            });
        });
    };
    

    lang = await initI18n();
    applyThemeFromLocalStorage();

    await updateTranslate();

    await fillPrinterTable();

    await addEventListeners();
});