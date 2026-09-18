const USER_API_URL = "https://hobby-projects-api.onrender.com";
const LOGIN_PAGE_URL = "https://bread-005.github.io/login-page/index.html";

/**
 * Validates the locally stored login and refreshes the user's last-seen timestamp.
 * Redirects to the login page when no valid session exists.
 * @returns {Promise<{name: string, token: string}|null>} The login storage, or null when redirected.
 */
async function authenticate() {
    const loginStorage = JSON.parse(localStorage.getItem("login-page"));

    if (!localStorage.getItem("login-page") || !loginStorage.name || !loginStorage.token) {
        window.location = LOGIN_PAGE_URL;
        return null;
    }

    const session = await fetch(USER_API_URL + "/session/verify", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({token: loginStorage.token})
    }).then(response => response.json());
    if (!session.isValid) {
        window.location = LOGIN_PAGE_URL;
        return null;
    }

    await fetch(USER_API_URL + "/users/update/" + loginStorage.name, {
        method: "PUT",
        headers: {"Content-Type": "application/json"}
    });

    return loginStorage;
}

/**
 * Clears the locally stored login and redirects to the login page.
 * @returns {void}
 */
function logout() {
    localStorage.removeItem("login-page");
    window.location = LOGIN_PAGE_URL;
}

export {authenticate, logout};
