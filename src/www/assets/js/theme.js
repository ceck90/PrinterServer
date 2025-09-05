/**
 * Retrieves the selected theme from localStorage.
 * If not found, returns 'light' as the default theme.
 * @returns {string} The current theme.
 */
export const getThemeFromLocalStorage = () => {
    let theme = localStorage.getItem('theme');
    if (!theme) {
        console.log("Theme - No stored theme found, using default.");
        let isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        console.log("Theme - Default based on system preference: " + (isDarkMode ? 'dark' : 'light'));
        theme = isDarkMode ? 'dark' : 'light';
        console.log("Theme - Default: " + theme);
        setThemeInLocalStorage(theme);
    }
    return theme ? theme : 'light'; // Default to 'light' if no theme is set
}

/**
 * Stores the selected theme in localStorage.
 * @param {string} theme - The theme to set.
 */
export const setThemeInLocalStorage = (theme) => {
    console.log("Theme - Set in LocalStorage: " + theme);
    localStorage.setItem('theme', theme);
}

/**
 * Applies the selected theme to the document and saves it in localStorage.
 * @param {string} theme - The theme to apply.
 */
export const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    setThemeInLocalStorage(theme);
}

export function setupThemeHandlers() {
    const themeItems = document.querySelectorAll('.theme-item');
    themeItems.forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            const currentTheme = document.documentElement.getAttribute('data-bs-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-bs-theme', newTheme);
            setThemeInLocalStorage(newTheme);
            item.classList.remove('bi-brightness-high', 'bi-moon', 'bi-circle-half');
            item.classList.add(newTheme === 'dark' ? 'bi-moon' : 'bi-brightness-high');
            item.alt = newTheme === 'dark' ? 'Dark Theme' : 'Light Theme';
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
}

export function applyThemeFromLocalStorage() {
    const storedTheme = getThemeFromLocalStorage();
    document.documentElement.setAttribute('data-bs-theme', storedTheme);
    document.querySelectorAll('.theme-item').forEach(icon => {
        icon.classList.remove('bi-brightness-high', 'bi-moon', 'bi-circle-half');
        icon.classList.add(storedTheme === 'dark' ? 'bi-moon' : 'bi-brightness-high');
        icon.alt = storedTheme === 'dark' ? 'Dark Theme' : 'Light Theme';
    });
    console.log("Apply theme: " + storedTheme);
}