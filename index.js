document.addEventListener("DOMContentLoaded", async () => {

    const loginStorage = JSON.parse(localStorage.getItem("login-page"));

    if (!localStorage.getItem("login-page") || !loginStorage.name) {
        window.location = "https://bread-005.github.io/login-page/index.html";
        return;
    }

    const USER_API_URL = "https://hobby-projects-api.onrender.com";

    const users = await fetch(USER_API_URL + "/users").then(res => res.json());
    const user = users.find(u => u.name === loginStorage.name);
    if (user && loginStorage.password !== user.password) {
        window.location = "https://bread-005.github.io/login-page/index.html";
        return;
    }

    await fetch(USER_API_URL + '/users/update/' + loginStorage.name, {
        method: "PUT",
        headers: {'Content-Type': 'application/json'}
    });

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

    document.getElementById("join-game-button").addEventListener("click", () => {
        socket.emit("join", loginStorage.name);

        lobby.style.display = "none";
        game.style.display = "flex";
        game.style.height = "90vh";
        document.getElementById("leave-game-button").style.visibility = "visible";
        setupPreviousGames();

        window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'});
    });

    document.getElementById("leave-game-button").addEventListener("click", () => {
        socket.emit("leave");

        lobby.style.display = "flex";
        game.style.height = "";
        document.getElementById("leave-game-button").style.visibility = "hidden";
        setupPreviousGames();

        window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'});
    });

    setupPreviousGames();

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

    socket.on("games", (serverGames) => {
        games = serverGames;
        setupPreviousGames();
        window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'});
    });

    function setupPreviousGames() {
        const previousGames = document.getElementById("previous-games-container");
        previousGames.innerHTML = "";

        const mostRecentGame = document.getElementById("most-recent-game");
        mostRecentGame.style.display = lobby.style.display === "none" ? "flex" : "none";
        mostRecentGame.style.flexDirection = "column";
        mostRecentGame.style.alignItems = "center";

        for (const game of games) {
            if (!game.players.find(player => player.name === loginStorage.name)) continue;

            const gameContainer = document.createElement("h3");
            gameContainer.textContent = "Game " + game.id;
            previousGames.append(gameContainer);
            mostRecentGame.innerHTML = "";
            const gameContainerClone = gameContainer.cloneNode(true);
            gameContainerClone.textContent = "Last Game (Game " + game.id + ")";
            mostRecentGame.append(gameContainerClone);

            for (let i = 0; i < game.players.length; i++) {
                const player = game.players[i];
                const container = document.createElement("div");
                container.style.display = "flex";
                container.style.margin = "2px";
                container.style.gap = "20px";
                container.style.justifyContent = "flex-start";
                const name = document.createElement("span");
                name.textContent = (i + 1) + ". " + player.name;
                const chosenCard = document.createElement("i");
                if (player.choice === "Rock") chosenCard.className = "fa-solid fa-hand-fist";
                if (player.choice === "Paper") chosenCard.className = "fa-solid fa-hand";
                if (player.choice === "Scissors") chosenCard.className = "fa-solid fa-hand-scissors";
                const energyGained = document.createElement("div");
                energyGained.textContent = (player.energyGained > -1 ? "+" : "") + player.energyGained;
                const zapIcon = document.createElement("i");
                zapIcon.className = "fa-solid fa-bolt";
                zapIcon.style.color = "rgb(255, 212, 59)";
                energyGained.append(zapIcon);

                container.append(name);
                container.append(chosenCard);
                container.append(energyGained);

                previousGames.append(container);
                mostRecentGame.append(container.cloneNode(true));
            }
        }
    }
});
