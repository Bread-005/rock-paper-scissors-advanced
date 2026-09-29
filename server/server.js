const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const {MongoClient} = require("mongodb");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:63342', 'https://bread-005.github.io'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }
});

app.use(express.static(__dirname));

const connectionString = "mongodb+srv://" + process.env.DATABASE_USERNAME + ":" + process.env.DATABASE_PASSWORD + "@clocktowergames.hfnkicc.mongodb.net/?retryWrites=true&w=majority";
const mongoClient = new MongoClient(connectionString);

const USER_API_URL = "https://hobby-projects-api.onrender.com";

/**
 * Verifies the given session token against the user API, the same way the login-page-based
 * frontends (e.g. clocktower-homebrew-collection) do before treating a session as valid.
 * @param {string} token The session token to verify against the user API.
 * @returns {Promise<boolean>} Whether the token belongs to a valid session.
 */
async function isSessionValid(token) {
    try {
        const session = await fetch(USER_API_URL + "/session/verify", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({token: token})
        }).then(response => response.json());

        return session.isValid === true;
    } catch (error) {
        console.error("Failed to verify session token:", error);
        return false;
    }
}

let rpsDatabase;

async function connectDatabase() {
    await mongoClient.connect();
    rpsDatabase = mongoClient.db("RockPaperScissors");
    await rpsDatabase.collection("players").createIndex({ name: 1 }, { unique: true });
    games = await rpsDatabase.collection("games").find().toArray();
}

const DISCONNECT_GRACE_DURATION_MILLISECONDS = 3000;

let players = [];
let games = [];
const pendingDisconnectTimeouts = new Map();

function emitGameState() {
    io.emit("lobby", players);
    io.emit("game", players);
    io.emit("setupChoices");
}

async function evaluateChoices() {
    if (players.length < 2) return;
    for (const player of players) {
        if (!player.chosenCard) return;
    }

    const game = {
        players: []
    };

    for (const player of players) {
        let energyGained = 0;
        for (const player1 of players) {
            if (player.id === player1.id) continue;

            if (player.chosenCard === "Rock" && player1.chosenCard === "Scissors") energyGained++;
            if (player.chosenCard === "Paper" && player1.chosenCard === "Rock") energyGained++;
            if (player.chosenCard === "Scissors" && player1.chosenCard === "Paper") energyGained++;
        }
        player.energy += energyGained;

        player.chosen[player.chosenCard]++;
        player.total.Rock++;
        player.total.Paper++;
        player.total.Scissors++;

        game.players.push({
            name: player.name,
            choice: player.chosenCard,
            energyGained: energyGained
        });
    }

    for (const player of players) {
        player.chosenCard = "";
    }
    emitGameState();

    try {
        const insertResult = await rpsDatabase.collection("games").insertOne(game);
        game.id = insertResult.insertedId;
        await updatePlayerStatsInDatabase(players);
        games.push(game);
        io.emit("games", games);
    } catch (error) {
        console.error("Failed to persist game result:", error);
    }
}

async function removePlayer(idSocket) {
    players = players.filter(p => p.id !== idSocket);
    emitGameState();
    await evaluateChoices();
}

function scheduleDisconnectRemoval(idSocket) {
    const player = players.find(p => p.id === idSocket);
    if (!player) return;

    const timeout = setTimeout(async () => {
        pendingDisconnectTimeouts.delete(player.name);
        await removePlayer(idSocket);
    }, DISCONNECT_GRACE_DURATION_MILLISECONDS);

    pendingDisconnectTimeouts.set(player.name, timeout);
}

async function updatePlayerStatsInDatabase(playersToUpdate) {
    const bulkOperations = playersToUpdate.map((player) => ({
        updateOne: {
            filter: { name: player.name },
            update: { $set: { energy: player.energy, chosen: player.chosen, total: player.total } }
        }
    }));

    if (bulkOperations.length > 0) {
        try {
            await rpsDatabase.collection("players").bulkWrite(bulkOperations);
        } catch (error) {
            console.error("Failed to update player stats in database:", error);
        }
    }
}

io.on("connection", async (socket) => {

    emitGameState();

    socket.on("join", async ({name, token}) => {
        if (!(await isSessionValid(token))) {
            socket.emit("sessionInvalid");
            return;
        }

        const pendingDisconnectTimeout = pendingDisconnectTimeouts.get(name);
        if (pendingDisconnectTimeout) {
            clearTimeout(pendingDisconnectTimeout);
            pendingDisconnectTimeouts.delete(name);

            const reconnectingPlayer = players.find(player => player.name === name);
            reconnectingPlayer.id = socket.id;
            reconnectingPlayer.chosenCard = "";

            socket.emit("init", socket.id);
            emitGameState();
            return;
        }

        if (players.find(player => player.name === name)) {
            socket.emit("joinError", "A player named \"" + name + "\" is already in this game.");
            return;
        }

        const defaultPlayerStats = {
            name: name,
            energy: 0,
            chosen: { Rock: 0, Paper: 0, Scissors: 0 },
            total: { Rock: 0, Paper: 0, Scissors: 0 }
        };

        let playerDocument = defaultPlayerStats;
        try {
            playerDocument = await rpsDatabase.collection("players").findOneAndUpdate(
                { name: name },
                { $setOnInsert: defaultPlayerStats },
                { upsert: true, returnDocument: "after" }
            );
        } catch (error) {
            console.error("Failed to upsert player \"" + name + "\" in database:", error);
        }

        players.push({
            id: socket.id,
            name: name,
            chosenCard: "",
            energy: playerDocument.energy,
            chosen: playerDocument.chosen,
            total: playerDocument.total
        });

        for (const player of players) {
            player.chosenCard = "";
        }

        socket.emit("init", socket.id);
        emitGameState();
    });

    socket.on("disconnect", () => scheduleDisconnectRemoval(socket.id));
    socket.on("leave", () => removePlayer(socket.id));

    socket.on("chose-thing", async (card) => {
        const player = players.find(p => p.id === socket.id);
        if (!player) return;

        player.chosenCard = (card === "Reset Choice" ? "" : card);
        emitGameState();
        await evaluateChoices();
    });

    socket.emit("games", games);
});

connectDatabase().then(() => {
    server.listen(process.env.PORT || 3002,"0.0.0.0", () => {
        console.log("Server running on https://rock-paper-scissors-advanced.onrender.com");
    });
});
