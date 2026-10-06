import {authenticate, logout, LOGIN_PAGE_URL} from "./auth.js";
import {createEnergyGainedElement} from "./functions.js";


const TOOLTIP_HOVER_DELAY_MILLISECONDS = 1000;

// Tracks every currently pending/visible tooltip so callers can cancel them all at once,
// since a button can be removed from the DOM (e.g. on re-render) while its hover delay
// is still running or its tooltip is still shown, in which case "mouseleave" never fires.
const activeTooltipCancellers = new Set();

/**
 * Attaches a custom tooltip to the given element that appears after a fixed hover delay,
 * since the native "title" attribute tooltip delay cannot be controlled across browsers.
 * @param {HTMLElement} targetElement The element to attach the tooltip to.
 * @param {string} tooltipText The tooltip text, using "\n" for line breaks.
 */
function attachDelayedTooltip(targetElement, tooltipText) {
    let hoverTimeout = null;
    let tooltipElement = null;

    const cancelTooltip = () => {
        clearTimeout(hoverTimeout);
        if (tooltipElement) {
            tooltipElement.remove();
            tooltipElement = null;
        }
        activeTooltipCancellers.delete(cancelTooltip);
    };

    targetElement.addEventListener("mouseenter", () => {
        activeTooltipCancellers.add(cancelTooltip);
        hoverTimeout = setTimeout(() => {
            tooltipElement = document.createElement("div");
            tooltipElement.className = "choice-tooltip";
            tooltipElement.textContent = tooltipText;
            document.body.appendChild(tooltipElement);

            const targetRectangle = targetElement.getBoundingClientRect();
            tooltipElement.style.left = (targetRectangle.left + targetRectangle.width / 2) + "px";
            tooltipElement.style.top = (targetRectangle.bottom + 8) + "px";
        }, TOOLTIP_HOVER_DELAY_MILLISECONDS);
    });

    targetElement.addEventListener("mouseleave", cancelTooltip);
}

/**
 * Cancels every pending or visible tooltip created by {@link attachDelayedTooltip}.
 * Must be called before removing tooltip-carrying elements from the DOM, since a removed
 * element never fires "mouseleave" and would otherwise leave its tooltip stuck forever.
 */
function clearAllDelayedTooltips() {
    for (const cancelTooltip of [...activeTooltipCancellers]) {
        cancelTooltip();
    }
}

document.addEventListener("DOMContentLoaded", async () => {

    const choiceData = await fetch("server/choiceData.json").then(response => response.json());
    const CHOICE_MATCHUPS = choiceData.matchups;
    const CHOICE_ENERGY_COST = choiceData.energyCost;
    const CHOICE_ICONS = choiceData.icons;

    const loginStorage = await authenticate();
    if (!loginStorage) return;

    const socket = await io("https://rock-paper-scissors-advanced.onrender.com");

    socket.on("connect", () => {
        document.getElementById("loading-screen").classList.add("hidden");
    });

    let myId = null;
    let players = [];
    let games = [];

    const lobby = document.getElementById("lobby");
    const game = document.getElementById("game");

    document.getElementById("your-name-display").textContent = "Your Name: " + loginStorage.name;
    document.getElementById("logout-button").addEventListener("click", logout);

    function joinGame() {
        sessionStorage.setItem("isInGame", "true");
        socket.emit("join", {name: loginStorage.name, token: loginStorage.token});

        lobby.style.display = "none";
        game.style.display = "flex";
        game.style.height = "90vh";
        document.getElementById("leave-game-button").style.visibility = "visible";
        setupPreviousGames();

        window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'});
    }

    document.getElementById("join-game-button").addEventListener("click", joinGame);

    document.getElementById("leave-game-button").addEventListener("click", () => {
        sessionStorage.removeItem("isInGame");
        socket.emit("leave");

        lobby.style.display = "flex";
        game.style.height = "";
        document.getElementById("leave-game-button").style.visibility = "hidden";
        setupPreviousGames();

        window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'});
    });

    if (sessionStorage.getItem("isInGame")) {
        joinGame();
    }

    document.getElementById("game-history-link").addEventListener("click", () => {
        sessionStorage.removeItem("isInGame");
        socket.emit("leave");
    });

    setupPreviousGames();

    socket.on("joinError", (message) => {
        sessionStorage.removeItem("isInGame");
        alert(message);

        lobby.style.display = "flex";
        game.style.height = "";
        document.getElementById("leave-game-button").style.visibility = "hidden";
        setupPreviousGames();
    });

    socket.on("sessionInvalid", () => {
        sessionStorage.removeItem("isInGame");
        window.location = LOGIN_PAGE_URL;
    });

    socket.on("init", (id) => {
        myId = id;
    });

    const gameplayDiv = document.getElementById("gameplay-div");

    socket.on("game", (serverPlayers) => {
        players = serverPlayers;

        const playerList = document.getElementById("playerList");
        playerList.innerHTML = "";
        for (let i = 0; i < players.length; i++) {
            const player = players[i];

            const playerCard = document.createElement("div");
            playerCard.className = "player-card";
            if (myId === player.id) playerCard.classList.add("is-you");

            const nameSpan = document.createElement("span");
            nameSpan.className = "player-name";
            nameSpan.textContent = (i + 1) + ". " + player.name;
            if (myId === player.id) nameSpan.textContent += " (you)";
            playerCard.appendChild(nameSpan);

            const energySpan = document.createElement("span");
            energySpan.className = "player-energy";
            energySpan.textContent = player.energy;
            const energyIcon = document.createElement("i");
            energyIcon.className = "fa-solid fa-bolt";
            energyIcon.style.color = "rgb(255, 212, 59)";
            energySpan.appendChild(energyIcon);
            playerCard.appendChild(energySpan);

            const iconSpan = document.createElement("span");
            iconSpan.className = "player-status-icon";

            if (players.length >= 2) {
                const icon = document.createElement("i");
                if (player.chosenCard) {
                    icon.className = "fa-solid fa-circle-check";
                    icon.style.color = "#00ff88";
                } else {
                    icon.className = "fa-solid fa-ellipsis";
                    icon.style.color = "rgba(255,255,255,0.4)";
                }
                iconSpan.appendChild(icon);
            }
            playerCard.appendChild(iconSpan);
            playerList.appendChild(playerCard);
        }
    });

    socket.on("setupChoices", () => {
        if (players.length >= 2 && players.find(p => p.id === myId)) {
            gameplayDiv.style.display = "flex";
            const choosePanel = document.getElementById("choose-panel");
            clearAllDelayedTooltips();
            choosePanel.innerHTML = "";
            const myPlayer = players.find(p => p.id === myId);
            for (let i = 0; i < 6; i++) {
                const label = document.createElement("span");
                label.className = "choice-label";

                if (i === 0) {
                    label.textContent = "Rock";
                }
                if (i === 1) {
                    label.textContent = "Paper";
                }
                if (i === 2) {
                    label.textContent = "Scissors";
                }
                if (i === 3) {
                    label.textContent = "Fountain";
                }
                if (i === 4) {
                    label.textContent = "Pillow";
                }
                if (i === 5) {
                    label.textContent = "Saw";
                }

                if (myPlayer.energy < CHOICE_ENERGY_COST[label.textContent]) {
                    continue;
                }

                const button = document.createElement("button");
                button.className = "choice-button";
                const icon = document.createElement("i");
                icon.className = CHOICE_ICONS[label.textContent];

                if (label.textContent === myPlayer.chosenCard) {
                    button.style.borderColor = "#00d2ff";
                }

                const matchup = CHOICE_MATCHUPS[label.textContent];
                if (matchup) {
                    attachDelayedTooltip(button, "cost: " + CHOICE_ENERGY_COST[label.textContent] + " ⚡\n"
                        + "beats: " + matchup.beats.join(", ") + "\n"
                        + "loses to: " + matchup.losesTo.join(", "));
                }

                button.appendChild(icon);
                button.appendChild(label);
                choosePanel.append(button);

                button.addEventListener("click", () => {
                    if (label.textContent === myPlayer.chosenCard) {
                        socket.emit("chose-thing", "Reset Choice");
                    } else {
                        socket.emit("chose-thing", label.textContent);
                    }
                });
            }
        } else {
            gameplayDiv.style.display = "none";
        }
    });

    socket.on("games", (serverGames) => {
        games = serverGames;
        setupPreviousGames();
        window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'});
    });

    function setupPreviousGames() {
        const mostRecentGame = document.getElementById("most-recent-game");
        mostRecentGame.innerHTML = "";
        mostRecentGame.style.display = lobby.style.display === "none" ? "flex" : "none";
        mostRecentGame.style.flexDirection = "column";
        mostRecentGame.style.alignItems = "center";

        const myGames = games.filter(game => game.players.find(player => player.name === loginStorage.name));
        const lastGame = myGames[myGames.length - 1];
        if (!lastGame) return;

        const gameTitle = document.createElement("h3");
        gameTitle.textContent = "Last Game (your " + getOrdinal(myGames.length) + " game)";
        mostRecentGame.append(gameTitle);

        for (let i = 0; i < lastGame.players.length; i++) {
            const player = lastGame.players[i];
            const container = document.createElement("div");
            container.style.display = "flex";
            container.style.margin = "2px";
            container.style.gap = "20px";
            container.style.justifyContent = "flex-start";
            const name = document.createElement("span");
            name.textContent = (i + 1) + ". " + player.name;
            const chosenCard = document.createElement("i");
            chosenCard.className = CHOICE_ICONS[player.choice];
            const energyGained = createEnergyGainedElement(player.energyGained);

            container.append(name);
            container.append(chosenCard);
            container.append(energyGained);

            mostRecentGame.append(container);
        }
    }

    /**
     * Formats a number as an English ordinal (1st, 2nd, 3rd, 4th, ...).
     * @param {number} number The number to format.
     * @returns {string} The number with its ordinal suffix.
     */
    function getOrdinal(number) {
        const lastTwoDigits = number % 100;
        if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return number + "th";

        const lastDigit = number % 10;
        if (lastDigit === 1) return number + "st";
        if (lastDigit === 2) return number + "nd";
        if (lastDigit === 3) return number + "rd";
        return number + "th";
    }
});
