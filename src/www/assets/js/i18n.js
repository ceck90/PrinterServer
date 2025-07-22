// i18n.js

let currentLanguage = 'en-US'; // Default language

/**
 * Retrieves the selected language from localStorage.
 * If not found, sets and returns the browser's language or defaults to 'en-US'.
 * @returns {string} The current language code.
 */
export const getLanguageFromLocalStorage = () => {
    const storedLang = localStorage.getItem('selectedLanguage');
    console.log("Language - Stored: " + storedLang);
    if(!storedLang) {
        console.log("Language - No stored language found, using browser language.");
        setLanguageInLocalStorage(getBrowserLanguage());
        currentLanguage = getBrowserLanguage();
    }    
    currentLanguage = storedLang || 'en-US'; // Fallback to 'en-US' if no language is stored
    return currentLanguage;
};

/**
 * Sets the selected language in localStorage and updates the currentLanguage variable.
 * @param {string} lang - The language code to set.
 */
export const setLanguageInLocalStorage = (lang) => {
    console.log("Language - Set in LocalStorage: " + lang);
    localStorage.setItem('selectedLanguage', lang); 
    currentLanguage = lang;
};

/**
 * Gets the browser's language or defaults to 'en-US' if not available.
 * @returns {string} The browser language code.
 */
const getBrowserLanguage = () => {
    const lang = navigator.language || navigator.userLanguage;
    return lang ? lang : "en-US"; // Default to 'en' if no language is detected
}

/**
 * Loads all language dictionaries from the assets/langs folder.
 * @returns {Promise<Object>} A promise that resolves to an object containing all loaded dictionaries.
 */
const loadLanguageDictionaries = async () => {
    const languages = ['en-US', 'it-IT', 'fr-FR', 'de-DE', 'es-ES', 'pt-PT']; // Add more languages as needed
    const dictionaries = {};
    
    for (const lang of languages) {
        try {
            const response = await fetch(`assets/langs/${lang}.json`);
            if (response.ok) {
                dictionaries[lang] = await response.json();
                // console.log(`Loaded ${lang} dictionary.`);
            } else {
                console.error(`Failed to load ${lang} dictionary.`);
            }
        } catch (error) {
            console.error(`Error loading ${lang} dictionary:`, error);
        }
    }
    
    return dictionaries;
};

let dictionaries = {};

/**
 * Initializes the i18n system by loading dictionaries and setting the current language.
 * @returns {Promise<string>} A promise that resolves to the current language code.
 */
export const initI18n = async () => {
    dictionaries = await loadLanguageDictionaries();
    currentLanguage = getLanguageFromLocalStorage();
    console.log("Language dictionaries loaded:", Object.keys(dictionaries));

    return currentLanguage;
};

/**
 * Translates a key using the current language dictionary.
 * Supports parameter replacement in the translation string.
 * @param {string} key - The translation key.
 * @param {Object} [params={}] - Parameters to replace in the translation string.
 * @returns {string} The translated string.
 */
export const translate = ( key, params = {}) => {    
    const dictionary = dictionaries[currentLanguage] || dictionaries['en-US'];
    let translation = dictionary[key] || key;
    for (const [param, value] of Object.entries(params)) {
        translation = translation.replace(`{${param}}`, value);
    }
    return translation;
};

/**
 * Updates the text content of all elements with the data-i18n attribute using the current language.
 */
export const updateTranslate = async () => {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (key) {
            element.textContent = translate(key);
        }
    });
}
