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