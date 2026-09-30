import {authenticate, logout} from "./auth.js";
import {createEnergyGainedElement} from "./functions.js";

const GAMES_PER_PAGE = 10;

document.addEventListener("DOMContentLoaded", async () => {

    const choiceData = await fetch("server/choiceData.json").then(response => response.json());
    const CHOICE_ICONS = choiceData.icons;

    const loginStorage = await authenticate();
    if (!loginStorage) return;

    const socket = await io("https://rock-paper-scissors-advanced.onrender.com");

    socket.on("connect", () => {
        document.getElementById("loading-screen").classList.add("hidden");
    });

    document.getElementById("your-name-display").textContent = "Your Name: " + loginStorage.name;
    document.getElementById("logout-button").addEventListener("click", logout);

    let myGames = [];
    let currentPage = 1;

    socket.on("games", (serverGames) => {
        myGames = serverGames
            .filter(game => game.players.find(player => player.name === loginStorage.name))
            .reverse();
        currentPage = 1;
        renderGameHistory();
    });

    function renderGameHistory() {
        const gameHistoryList = document.getElementById("game-history-list");
        gameHistoryList.innerHTML = "";

        if (myGames.length === 0) {
            const noGamesMessage = document.createElement("p");
            noGamesMessage.textContent = "You haven't played any games yet.";
            gameHistoryList.append(noGamesMessage);
            renderPagination(1);
            return;
        }

        const pageCount = Math.max(1, Math.ceil(myGames.length / GAMES_PER_PAGE));
        currentPage = Math.min(currentPage, pageCount);

        const pageStart = (currentPage - 1) * GAMES_PER_PAGE;
        const pageGames = myGames.slice(pageStart, pageStart + GAMES_PER_PAGE);

        for (let i = 0; i < pageGames.length; i++) {
            const gameNumber = myGames.length - (pageStart + i);
            gameHistoryList.append(createGameCard(pageGames[i], gameNumber));
        }

        renderPagination(pageCount);
    }

    function createGameCard(game, gameNumber) {
        const gameCard = document.createElement("div");
        gameCard.className = "game-history-card";

        const gameTitle = document.createElement("h3");
        gameTitle.textContent = "Game " + gameNumber;
        gameCard.append(gameTitle);

        for (let i = 0; i < game.players.length; i++) {
            const player = game.players[i];

            const playerRow = document.createElement("div");
            playerRow.className = "game-history-player-row";

            const name = document.createElement("span");
            name.textContent = (i + 1) + ". " + player.name;

            const chosenCard = document.createElement("i");
            chosenCard.className = CHOICE_ICONS[player.choice];

            const energyGained = createEnergyGainedElement(player.energyGained);

            playerRow.append(name);
            playerRow.append(chosenCard);
            playerRow.append(energyGained);
            gameCard.append(playerRow);
        }

        return gameCard;
    }

    function renderPagination(pageCount) {
        const pagination = document.getElementById("pagination");
        pagination.innerHTML = "";

        if (pageCount <= 1) return;

        const previousButton = document.createElement("button");
        previousButton.textContent = "Previous";
        previousButton.disabled = currentPage === 1;
        previousButton.addEventListener("click", () => {
            currentPage--;
            renderGameHistory();
        });
        pagination.append(previousButton);

        for (let page = 1; page <= pageCount; page++) {
            const pageButton = document.createElement("button");
            pageButton.textContent = String(page);
            pageButton.className = "pagination-page-button";
            if (page === currentPage) pageButton.classList.add("is-active");
            pageButton.addEventListener("click", () => {
                currentPage = page;
                renderGameHistory();
            });
            pagination.append(pageButton);
        }

        const nextButton = document.createElement("button");
        nextButton.textContent = "Next";
        nextButton.disabled = currentPage === pageCount;
        nextButton.addEventListener("click", () => {
            currentPage++;
            renderGameHistory();
        });
        pagination.append(nextButton);
    }
});
