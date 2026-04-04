document.addEventListener("DOMContentLoaded", async () => {

    const loginStorage = JSON.parse(localStorage.getItem("login-page"));

    if (!localStorage.getItem("login-page") || !loginStorage.name) {
        window.location = "http://localhost:63342/login-page/index.html";
        return;
    }

    const socket = await io("https://rock-paper-scissors-advanced.onrender.com");

    let myId = null;
    let players = [];

    const lobby = document.getElementById("lobby");
    const game = document.getElementById("game");

    document.getElementById("your-name-display").textContent = "Your Name: " + loginStorage.name;

    document.getElementById("join-game-button").addEventListener("click", () => {
        socket.emit("join", loginStorage.name);

        lobby.style.display = "none";
        game.style.display = "flex";
    });

    document.getElementById("leave-game-button").addEventListener("click", () => {
        socket.emit("leave");

        lobby.style.display = "flex";
        game.style.display = "none";
    });

    socket.on("init", (id) => {
        myId = id;
    });

    const gameplayDiv = document.getElementById("gameplay-div");
    const currentChoiceDisplay = document.getElementById("current-choice-display");

    // Spiel aktualisieren
    socket.on("game", (serverPlayers) => {
        players = serverPlayers;

        const playerList = document.getElementById("playerList");
        playerList.innerHTML = "";
        for (let i = 0; i < players.length; i++) {
            const div = document.createElement("div");
            div.textContent = (i + 1) + ". " + players[i].name;
            if (myId === players[i].id) div.textContent += " (you)";
            if (players.length >= 2) {
                div.textContent += " --- " + "hasChosen: ";
                const icon = document.createElement("i");
                if (players[i].chosenCard) {
                    icon.className = "fa-solid fa-check";
                    icon.style.color = "rgb(99, 230, 190)";
                } else {
                    icon.className = "fa-solid fa-x";
                    icon.style.color = "rgb(255, 0, 0)";
                }
                div.append(icon);
                currentChoiceDisplay.textContent = "Current Choice: " + players[i].chosenCard;
            }
            playerList.appendChild(div);
        }
    });

    // Menü aktualisieren
    socket.on("lobby", (serverPlayers) => {
        players = serverPlayers;

        const currentPlayersDisplay = document.getElementById("current-players-display");
        currentPlayersDisplay.innerHTML = (players.length > 0) ? "" : "Noone is currently playing";
        for (const player of players) {
            const div = document.createElement("div");
            div.textContent = player.name;
            currentPlayersDisplay.append(div);
        }
    });

    socket.on("setupChoices", () => {
        if (players.length >= 2) {
            gameplayDiv.style.display = "flex";
            const choosePanel = document.getElementById("choose-panel");
            choosePanel.innerHTML = "";
            for (let i = 0; i < 4; i++) {
                const button = document.createElement("button");
                if (i === 0) button.textContent = "Rock";
                if (i === 1) button.textContent = "Paper";
                if (i === 2) button.textContent = "Scissors";
                if (i === 3) button.textContent = "Reset Choice";
                choosePanel.append(button);

                button.addEventListener("click", () => {
                    socket.emit("chose-thing", button.textContent);
                });
            }
        } else {
            gameplayDiv.style.display = "none";
        }
    });
});