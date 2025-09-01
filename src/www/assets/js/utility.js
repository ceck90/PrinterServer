/* 
    Shorthand functions to avoid verbose
*/
const byId = (id) => document.getElementById(id)

/* 
    Spawn toast div to show messages
    Auto hides itself after 5 seconds
    Close on click
*/
export const spawnToast = (message, options = { title: "", icon: false }) => {

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
    strong.textContent = options.title || "-- title --"

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