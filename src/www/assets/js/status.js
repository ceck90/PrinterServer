import { translate, updateTranslate, initI18n, getLanguageFromLocalStorage } from './i18n.js';
import { getThemeFromLocalStorage, setThemeInLocalStorage } from './theme.js';
import { spawnToast } from './utility.js';

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

    document.getElementById("apiRestartButton").addEventListener('click', async () =>{
        try{
            await requestToServer("api-restart");
        }
        catch (error){
            appendToConsole(error.message);
            console.log("Error on restart command", error);
        }
    });

    document.querySelectorAll(".update-button").forEach(updateButton => {
        updateButton.addEventListener('click', async () => {
            try {
                updateServerStatus();
            }
            catch (error) {
                console.error(error.message);
            }
        });
    });

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

        if (data.knx_connected !== undefined) {
            let knxStatus = document.getElementById("badge-status-knx");
            knxStatus.textContent = data.knx_connected ? translate('running') : translate('stopped');
            knxStatus.className = data.knx_connected ? "badge bg-success" : "badge bg-danger";
        }
        if (data.ws_connected !== undefined) {
            let serverStatus = document.getElementById("badge-status-server");
            serverStatus.textContent = data.ws_connected ? translate('running') : translate('stopped');
            serverStatus.className = data.ws_connected ? "badge bg-success" : "badge bg-danger";
        }
        if (data.mqtt_client_connected !== undefined) {
            let mattClientStatus = document.getElementById("badge-status-mqtt-client");
            mattClientStatus.textContent = data.mqtt_client_connected ? translate('running') : translate('stopped');
            mattClientStatus.className = data.mqtt_client_connected ? "badge bg-success" : "badge bg-danger";
        }
        if (data.mqtt_server_active !== undefined) {
            let mqttServerStatus = document.getElementById("badge-status-mqtt-server");
            mqttServerStatus.textContent = data.mqtt_server_active ? translate('running') : translate('stopped');
            mqttServerStatus.className = data.mqtt_server_active ? "badge bg-success" : "badge bg-danger";
        }
        if (data.osc_server_active !== undefined) {
            let oscStatus = document.getElementById("badge-status-osc");
            oscStatus.textContent = data.osc_server_active ? translate('running') : translate('stopped');
            oscStatus.className = data.osc_server_active ? "badge bg-success" : "badge bg-danger";
        }
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

    /**
     * Clears the content of the WEB CLI console.
    */
    const clearCli = () => {
        cliConsole.innerHTML = "";
    }
    const clearConsoleButton = document.getElementById("clearConsole");
    clearConsoleButton.addEventListener("click", clearCli);

    const cliConsole = document.getElementById("cliConsole");
    cliConsole.addEventListener('shown.bs.collapse', () => {
        cliConsole.style.height = '200px';
    });

    /**
     * Appends a message to the WEB console with a timestamp.
     *
     * @param {string} message - The message to be appended to the WEB console.
     */
    const appendToConsole = (message) => {
        const timestamp = new Date().toLocaleTimeString();
        cliConsole.innerHTML += `<div>[${timestamp}] ${message}</div>`;
        cliConsole.scrollTop = cliConsole.scrollHeight;
    };

    lang =await initI18n();
    applyThemeFromLocalStorage();

    await updateTranslate();

    startWebSocket();
});