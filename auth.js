const USER_API_URL = "https://hobby-projects-api.onrender.com";
const LOGIN_PAGE_URL = "https://bread-005.github.io/login-page/index.html";

export {authenticate};

/**
 * Validates the locally stored login and refreshes the user's last-seen timestamp.
 * Redirects to the login page when no valid session exists.
 * @returns {Promise<{name: string, password: string}|null>} The login storage, or null when redirected.
 */
async function authenticate() {
    const loginStorage = JSON.parse(localStorage.getItem("login-page"));

    if (!localStorage.getItem("login-page") || !loginStorage.name) {
        window.location = LOGIN_PAGE_URL;
        return null;
    }

    const users = await fetch(USER_API_URL + "/users").then(response => response.json());
    const user = users.find(u => u.name === loginStorage.name);
    if (user && loginStorage.password !== user.password) {
        window.location = LOGIN_PAGE_URL;
        return null;
    }

    await fetch(USER_API_URL + "/users/update/" + loginStorage.name, {
        method: "PUT",
        headers: {"Content-Type": "application/json"}
    });

    return loginStorage;
}
