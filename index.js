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
        document.getElementById("leave-game-button").style.visibility = "visible";
    });

    document.getElementById("leave-game-button").addEventListener("click", () => {
        socket.emit("leave");

        lobby.style.display = "flex";
        document.getElementById("leave-game-button").style.visibility = "hidden";
    });

    socket.on("init", (id) => {
        myId = id;
    });

    const gameplayDiv = document.getElementById("gameplay-div");

    socket.on("game", (serverPlayers) => {
        players = serverPlayers;

        const playerList = document.getElementById("playerList");
        playerList.innerHTML = "";
        const choiceResultDisplay = document.getElementById("choice-result-display");
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

            if (myId === player.id) {
                if (player.chosenCard) {
                    choiceResultDisplay.textContent = "You chose: " + player.chosenCard;
                }
                if (!player.chosenCard) {
                    choiceResultDisplay.textContent = "You gained " + player.energy + " Energy last turn";
                }
            }
        }
    });

    socket.on("setupChoices", () => {
        if (players.length >= 2 && players.find(p => p.id === myId)) {
            gameplayDiv.style.display = "flex";
            const choosePanel = document.getElementById("choose-panel");
            choosePanel.innerHTML = "";
            for (let i = 0; i < 4; i++) {
                const button = document.createElement("button");
                button.className = "choice-button";

                const icon = document.createElement("i");
                const label = document.createElement("span");
                label.className = "choice-label";

                if (i === 0) {
                    label.textContent = "Rock";
                    icon.className = "fa-solid fa-hand-fist";
                }
                if (i === 1) {
                    label.textContent = "Paper";
                    icon.className = "fa-solid fa-hand";
                }
                if (i === 2) {
                    label.textContent = "Scissors";
                    icon.className = "fa-solid fa-hand-scissors";
                }
                if (i === 3) {
                    label.textContent = "Reset Choice";
                    icon.className = "fa-solid fa-arrows-rotate";
                }

                if (label.textContent === players.find(p => p.id === myId).chosenCard) {
                    button.style.borderColor = "#00d2ff";
                }

                button.appendChild(icon);
                button.appendChild(label);
                choosePanel.append(button);

                button.addEventListener("click", () => {
                    socket.emit("chose-thing", label.textContent);
                });
            }
        } else {
            gameplayDiv.style.display = "none";
        }
    });
});