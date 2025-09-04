

import { translate, updateTranslate, initI18n, getLanguageFromLocalStorage } from './i18n.js';
import { getThemeFromLocalStorage, setThemeInLocalStorage } from './theme.js';
// import { Toast } from 'bootstrap';
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
        }
        else if (start) {
            console.log("Single date selected:", start);
            const startDate = new Date(start);
        }
        else {
            // Se non è selezionata alcuna data, usa la data odierna
            const today = new Date();
            const startDate = today;
            console.log("No date selected, using today's date:", startDate.toISOString().slice(0, 10));
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

    const btnLogout = document.getElementById('logout-button');
    btnLogout.addEventListener('click', () => {
        // Handle logout logic here
        localStorage.removeItem("authToken");
        window.location.href = "/";
        console.log("[LOGOUT] User logged out");
    });

    var options = {
        series: [44, 55, 13, 33],
        labels: ['Apple', 'Mango', 'Orange', 'Watermelon'],
        chart: {
            width: 500,
            type: 'donut',
        },
        dataLabels: {
            enabled: true,
            dropShadow: {
                enabled: false
            }
        },
        responsive: [{
            breakpoint: 480,
            options: {
                chart: {
                    width: 200
                },
                legend: {
                    show: false
                }
            }
        }],
        plotOptions: {
            pie: {
                donut: {
                    labels: {
                        show: true,
                        name: {
                            show: true,
                        },
                        value: {
                            show: true,
                            color: '#ffffff'
                        },
                        total: {
                            label: "TOTALE",
                            show: true,
                            showAlways: false,
                            color: '#ffffff'
                        }
                    }
                }
            }
        },
        legend: {
            position: 'bottom',
            offsetY: 0,
            height: 50,
            labels: {
                // colors: ['#ffffff'],
                useSeriesColors: true
            }
        }
    };
    var chart1 = new ApexCharts(document.querySelector("#chart1"), options);
    var chart2 = new ApexCharts(document.querySelector("#chart2"), options);
    var chart3 = new ApexCharts(document.querySelector("#chart3"), options);

    const renderCharts = async () => {
        await chart1.render();
        await chart2.render();
        await chart3.render();
    }

    const updateCharts = () => {
        console.log("[UPDATE] Updating charts");
        // Add your update logic here
        // chart1.render();
        // chart2.render();
        // chart3.render();
    };

    const addEventListeners = async () => {
        const updateButton = document.querySelector('.update-button');
        updateButton.addEventListener('click', () => {
            console.log("[UPDATE] Update button clicked");
            // Add your update logic here
            updateCharts();
        });
    };

    
    // -- Initialize the language and theme

    lang = await initI18n();
    applyThemeFromLocalStorage();

    await updateTranslate();
    
    await renderCharts();
    
    await addEventListeners();
});