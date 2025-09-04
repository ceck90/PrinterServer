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

    flatpickr("#date-range", {
    mode: "range",
    dateFormat: "Y-m-d",
    locale: {
        firstDayOfWeek: 1
    },
    maxDate: "today"
    });

    const input_data_range = document.getElementById('date-range');

    input_data_range.addEventListener('change', () => {
        const [start, end] = input_data_range.value.split(' to ');
        if (start && end) {
            console.log("Data range:", start, " to ", end);
            const startDate = new Date(start);
            const endDate = new Date(end);
            // console.log("Start Date:", startDate, "End Date:", endDate);
            fetchTickets(startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10), 50, 0);
        }
        else if (start) {
            console.log("Single date selected:", start);
            const startDate = new Date(start);
            fetchTickets(startDate.toISOString().slice(0, 10), startDate.toISOString().slice(0, 10), 50, 0);
        }
        else {
            // Se non è selezionata alcuna data, usa la data odierna
            const today = new Date();
            const startDate = today;
            console.log("No date selected, using today's date:", startDate.toISOString().slice(0, 10));
            fetchTickets(startDate.toISOString().slice(0, 10), startDate.toISOString().slice(0, 10), 50, 0);
        }
    });

    const search_text = document.getElementById('table-search');
    const btnSearch = document.getElementById('btn-search');
    const btnClear = document.getElementById('btn-clear');
    const btnLogout = document.getElementById('logout-button');
    var tableRows = document.querySelectorAll('#ticket-list-body tr');

    btnSearch.addEventListener('click', () => {
        // console.log("Search button clicked");
        const query = search_text.value.trim().toLowerCase();
        // console.log("Search query:", query);
        // console.log("Total rows:", tableRows.length);
        tableRows.forEach(row => {
            // console.log("Row text:", row.innerText);
            const rowText = row.innerText.toLowerCase();
            row.style.display = rowText.includes(query) ? '' : 'none';
        });
    });

    btnClear.addEventListener('click', () => {
        search_text.value = '';
        tableRows.forEach(row => (row.style.display = ''));
    });

    btnLogout.addEventListener('click', () => {
        // Handle logout logic here
        localStorage.removeItem("authToken");
        window.location.href = "/";
        console.log("[LOGOUT] User logged out");
    });

    search_text.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            btnSearch.click();
        } else if (e.key === 'Escape') {
            search_text.value = '';
            tableRows.forEach(row => (row.style.display = ''));
        }
    });

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

    const requestToServer = async (request) => {
        if(!request){
            throw new Error("Missing request to send request to server");            
        }  
        appendToConsole("Try to send to server: " +  request);
        switch (request) {
            case "api-restart":
                const res = await fetch(`/config/api-restart`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                });

                if (!res.ok) {
                    // alert(translate('restartFail'));
                    appendToConsole("Server response: " + translate('restartFail'));
                } else {
                    appendToConsole("Server response: " + translate('restartSuccess'));
                }
                break;
        
            default:
                break;
        }     
    }

    const updateServerStatus = async (data) => {
        if (!data) {
            try {
                // console.log("Fetching server status from API...");  
                data = await fetchStatus();
                if (!data) {
                    console.error("No data received from server status fetch.");
                    return;
                }
            }
            catch (error) {
                console.error("Error fetching server status:", error);
                return;
            }
        }

        console.log("Server status data:", data);

        document.title = `${translate("api")} @ ${data.hostname}`;

        document.getElementById("device-hostname").textContent = `${data.hostname}`;

        var timestamp = new Date(data.timestamp).toLocaleString();
        // appendToConsole("Heartbeat from server: " + timestamp);

        var ramInfoLabel = document.getElementById("ramInfoLabel");
        let totalMemory = Math.round(data.ramInfo["TotalMemory"] / 1024);
        let usedMemory = Math.round((data.ramInfo["TotalMemory"] - data.ramInfo["UsedMemory"]) / 1024);
        ramInfoLabel.textContent = `${usedMemory ? usedMemory : 0}/${totalMemory ? totalMemory : 0} MB`;

        document.getElementById("apiRamInfoLabel").textContent = `${data.appRam} MB`;
        document.getElementById("versionInfo").textContent = `${data.version}`;

        // document.getElementById('server-status').textContent = translate(data.status);
        document.getElementById('last-update').textContent = timestamp;
        if (data.cpuLoad < 70) {
            document.getElementById('cpu-progress').classList.remove('bg-warning', 'bg-danger');
            document.getElementById('cpu-progress').classList.add('bg-success');
        }
        else if (data.cpuLoad < 90) {
            document.getElementById('cpu-progress').classList.remove('bg-success', 'bg-danger');
            document.getElementById('cpu-progress').classList.add('bg-warning');
        }
        else {
            document.getElementById('cpu-progress').classList.remove('bg-success', 'bg-warning');
            document.getElementById('cpu-progress').classList.add('bg-danger');
        }
        document.getElementById('cpu-progress').style.width = `${data.cpuLoad}%`;
        document.getElementById('cpu-progress').textContent = `${data.cpuLoad}%`;

        if (data.ramUsage < 70) {
            document.getElementById('ram-progress').classList.remove('bg-warning', 'bg-danger');
            document.getElementById('ram-progress').classList.add('bg-success');
        }
        else if (data.ramUsage < 90) {
            document.getElementById('ram-progress').classList.remove('bg-success', 'bg-danger');
            document.getElementById('ram-progress').classList.add('bg-warning');
        }
        else {
            document.getElementById('ram-progress').classList.remove('bg-success', 'bg-warning');
            document.getElementById('ram-progress').classList.add('bg-danger');
        }
        document.getElementById('ram-progress').style.width = `${data.ramUsage}%`;
        document.getElementById('ram-progress').textContent = `${data.ramUsage}%`;

        if( data.cpuTemp0 < 60) {
            document.getElementById('cpu-temp-0-progress').classList.remove('bg-warning', 'bg-danger');
            document.getElementById('cpu-temp-0-progress').classList.add('bg-success');
        }
        else if (data.cpuTemp0 < 70) {
            document.getElementById('cpu-temp-0-progress').classList.remove('bg-success', 'bg-danger');
            document.getElementById('cpu-temp-0-progress').classList.add('bg-warning');
        }
        else {
            document.getElementById('cpu-temp-0-progress').classList.remove('bg-success', 'bg-warning');
            document.getElementById('cpu-temp-0-progress').classList.add('bg-danger');
        }

        document.getElementById('cpu-temp-0-progress').style.width = `${data.cpuTemp0}%`;
        document.getElementById('cpu-temp-0-progress').textContent = `${data.cpuTemp0}°C`;

        if (data.cpuTemp1 < 60) {
            document.getElementById('cpu-temp-1-progress').classList.remove('bg-warning', 'bg-danger');
            document.getElementById('cpu-temp-1-progress').classList.add('bg-success');
        }
        else if (data.cpuTemp1 < 70) {
            document.getElementById('cpu-temp-1-progress').classList.remove('bg-success', 'bg-danger');
            document.getElementById('cpu-temp-1-progress').classList.add('bg-warning');
        }
        else {
            document.getElementById('cpu-temp-1-progress').classList.remove('bg-success', 'bg-warning');
            document.getElementById('cpu-temp-1-progress').classList.add('bg-danger');
        }

        document.getElementById('cpu-temp-1-progress').style.width = `${data.cpuTemp1}%`;
        document.getElementById('cpu-temp-1-progress').textContent = `${data.cpuTemp1}°C`;

        
    }

    const addEventListeners = () => {
        const printButtons = document.querySelectorAll('[id^="print-btn-"]');
        printButtons.forEach(button => {
            // console.log("Print button found:", button.id);
            button.addEventListener('click', async (e) => {
                const ticketId = button.id.split('-')[2];
                console.log("Print button clicked for ticket:", ticketId);
                fetch(`/api/receipts/${ticketId}/print`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                });
            });
        });

        tableRows = document.querySelectorAll('#ticket-list-body tr');
    }

    const fetchStatus = async () => {
        try {
            const response = await fetch('/config/status');
            return await response.json();
        } catch (error) {
            console.error("Error fetching server status:", error);
            document.getElementById('server-status').textContent = translate('statusError');
        }
    }

    const rowsPerPage = 10;
    let currentPage = 1;
    let tableBody = document.getElementById('ticket-list-body');
    let pagination = document.getElementById('pagination');

    function paginateTable() {
        const rows = tableBody.querySelectorAll('tr');
        const totalPages = Math.ceil(rows.length / rowsPerPage);

        // Mostra/Nasconde righe
        rows.forEach((row, index) => {
            row.style.display =
                index >= (currentPage - 1) * rowsPerPage &&
                    index < currentPage * rowsPerPage
                    ? ''
                    : 'none';
        });
        // Ricostruisce i bottoni
        pagination.innerHTML = '';

        for (let i = 1; i <= totalPages; i++) {
            const li = document.createElement('li');
            li.classList.add('page-item');
            if (i === currentPage) li.classList.add('active');

            const btn = document.createElement('button');
            btn.classList.add('page-link');
            btn.innerText = i;
            btn.onclick = () => {
                currentPage = i;
                paginateTable();
            };

            li.appendChild(btn);
            pagination.appendChild(li);
        }
    }


    const fetchTickets = async (startDate, endDate, limit, offset) => {
        console.log("Fetching tickets from server...");
        try {
            // Parametri dinamici per la query
            limit = limit || 10;
            offset = offset || 0;
            // Calcola intervallo date: se non passati, usa oggi
            // Ottieni la data attuale in UTC
            const now = new Date();
            const utcYear = now.getUTCFullYear();
            const utcMonth = now.getUTCMonth(); // zero-based
            const utcDate = now.getUTCDate();

            // Costruisci inizio e fine giorno in UTC
            const startUtc = new Date(Date.UTC(utcYear, utcMonth, utcDate, 0, 0, 0, 0));
            const endUtc = new Date(Date.UTC(utcYear, utcMonth, utcDate, 23, 59, 59, 999));

            // Convertili in ISO string (sono già in UTC)
            const isoStart = startUtc.toISOString().slice(0, 10); // YYYY-MM-DD
            const isoEnd = endUtc.toISOString().slice(0, 10); // YYYY-MM-DD

            // console.log("Start UTC ISO:", isoStart);
            // console.log("End UTC ISO:", isoEnd);

            const params = new URLSearchParams({
                limit,
                offset,
                startDate: startDate || isoStart,
                endDate: endDate || isoEnd
            });

            console.log("Fetching tickets with params:", params.toString());

            const ticketList = document.getElementById('ticket-list-body');

            const response = await fetch(`/api/receipts?${params.toString()}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const tickets = await response.json();
            if (tickets.length === 0) {
                console.log(translate('ticket.empty'));
                ticketList.innerHTML = `<td colspan="9" class="text-center">${translate('ticket.empty')}</td>`;
                document.getElementById('ticket-count').textContent = 0;
            } else {
                document.getElementById('ticket-count').textContent = tickets.length;
                ticketList.innerHTML = ''; // Clear previous tickets
                tickets.forEach(ticket => {
                    // Append each ticket to the console or a specific element
                    if (ticketList) {
                        // console.log(ticket);
                        const row = document.createElement('tr');
                        // row.classList.add('py-2');

                        if(ticket.orderStatus === "CANCELLED") {
                            row.classList.add('table-secondary');
                        }                       

                        row.innerHTML = `
                            <td>${ticket.orderNumber}</td>
                            <td>${ticket.clientName}</td>
                            <td>${ticket.tableNumber}</td>
                            <td>${ticket.destination}</td>
                            <td>${ticket.itemName}</td>
                            <td>${ticket.itemNote ? ticket.itemNote : ''}</td>
                            <td>${ticket.orderNotes ? ticket.orderNotes : ''}</td>
                            
                        `;
                        if( ticket.printStatus === "PRINTED" ){
                            row.innerHTML += `<td>
                                <button class="btn btn-success bi bi-printer" id="print-btn-${ticket.id}"></button>
                            </td>`;
                            // row.innerHTML += `<td class="text-center"><span class="badge bg-${ticket.printed ? 'success' : 'secondary'}">${ticket.printed ? translate('ticket.printed') : translate('ticket.notPrinted')}</span></td>`;
                        }
                        else {
                            if(ticket.printed || ticket.reprinted){
                                row.innerHTML += `<td>
                                    <button class="btn btn-warning bi bi-printer" id="print-btn-${ticket.id}"></button>
                                </td>`;
                            }
                            else {
                                row.innerHTML += `<td>
                                    <button class="btn btn-danger bi bi-printer" id="print-btn-${ticket.id}"></button>
                                </td>`;
                                row.classList.add('table-danger');
                            }
                            // row.innerHTML += `<td class="text-center"><span class="badge bg-secondary">${translate('ticket.notPrinted')}</span></td>`;
                        }
                        if(ticket.takeAway) {
                            row.innerHTML += `
                            <td>
                                <span class="badge bg-warning">${translate('ticket.take_away')}</span>
                            </td>`;
                        }
                        else {
                            row.innerHTML += `
                            <td>                            
                                <span class="badge bg-secondary">${translate('ticket.dine_in')}</span>
                            </td>`;
                        }

                        ticketList.appendChild(row);
                    }
                    // console.log(`Ticket ID: ${ticket.id}, Status: ${ticket.status}, Printed: ${ticket.printedAt}, Re-Printed: ${ticket.reprintedAt ? ticket.reprintedAt : 'N/A'}`);
                });
                addEventListeners();
                // paginateTable();
            }
        } catch (error) {
            console.error("Error fetching tickets:", error);    
        }
    };

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

    const setServerStatus = async (status) => {
        switch (status) {
            case 'connecting':
                document.getElementById('server-status').textContent = translate('connecting');
                document.getElementById('server-status').classList.remove('bg-primary', 'bg-secondary', 'bg-danger', 'bg-warning', 'bg-success');
                document.getElementById('server-status').classList.add('bg-secondary');
                document.getElementById('server-icon').classList.remove('text-info', 'text-success', 'text-warning', 'text-danger');
                document.getElementById('server-icon').classList.add('text-info');
                document.getElementById('pulse-dot').style.display = 'none';
                break;
            case 'connected':
                document.getElementById('server-status').textContent = translate('connected');
                document.getElementById('server-status').classList.remove('bg-primary', 'bg-secondary', 'bg-danger', 'bg-warning', 'bg-success');
                document.getElementById('server-status').classList.add('bg-success');
                document.getElementById('server-icon').classList.remove('text-info', 'text-success', 'text-warning', 'text-danger');
                document.getElementById('server-icon').classList.add('text-success');
                document.getElementById('pulse-dot').style.display = 'inline-block';
                break;
            case 'disconnected':
                document.getElementById('server-status').textContent = translate('disconnected');
                document.getElementById('server-status').classList.remove('bg-primary', 'bg-secondary', 'bg-danger', 'bg-warning', 'bg-success');
                document.getElementById('server-status').classList.add('bg-warning');
                document.getElementById('server-icon').classList.remove('text-info', 'text-success', 'text-warning', 'text-danger');
                document.getElementById('server-icon').classList.add('text-warning');
                document.getElementById('pulse-dot').style.display = 'none';
                break;
            case 'error':
                document.getElementById('server-status').textContent = translate('error');
                document.getElementById('server-status').classList.remove('bg-primary', 'bg-secondary', 'bg-danger', 'bg-warning', 'bg-success');
                document.getElementById('server-status').classList.add('bg-danger');
                document.getElementById('server-icon').classList.remove('text-info', 'text-success', 'text-warning', 'text-danger');
                document.getElementById('server-icon').classList.add('text-danger');
                document.getElementById('pulse-dot').style.display = 'none';
                break;
            default:
                console.warn("Unknown status:", status);
        }
    }

    lang =await initI18n();
    applyThemeFromLocalStorage();

    await updateTranslate();

    fetchTickets(undefined, undefined, 50, 0);

    // startWebSocket();
});