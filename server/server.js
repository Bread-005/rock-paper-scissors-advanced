const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const {MongoClient} = require("mongodb");
const choiceData = require("./choiceData.json");

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
const MAXIMUM_ENERGY_COLLECTORS = 5;
const ENERGY_COLLECTOR_CHOICE_NAME = "Energy Collector";
const ENERGY_COLLECTOR_DESTROYER_CHOICE_NAME = "Energy Collector Destroyer";
const ENERGY_COLLECTOR_DESTROYER_INTERRUPTER_CHOICE_NAME = "Energy Collector Destroyer Interrupter";

const CHOICE_MATCHUPS = choiceData.matchups;
const CHOICE_ENERGY_COST = choiceData.energyCost;

const CHOICE_NAMES = Object.keys(CHOICE_MATCHUPS);

function createEmptyChoiceTally() {
    const tally = {};
    for (const choiceName of CHOICE_NAMES) {
        tally[choiceName] = 0;
    }
    return tally;
}

/**
 * Fills in missing choice keys with 0, since player documents persisted before a given
 * choice existed (e.g. Fountain/Pillow/Saw) won't have that key yet.
 * @param {Object} tally A possibly incomplete chosen/total tally loaded from the database.
 * @returns {Object} A tally containing every entry in {@link CHOICE_NAMES}.
 */
function normalizeChoiceTally(tally) {
    const normalized = {};
    for (const choiceName of CHOICE_NAMES) {
        normalized[choiceName] = tally?.[choiceName] ?? 0;
    }
    return normalized;
}

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

    // When any player builds a factory this round, all Energy Collectors being built this round
    // (not already-owned ones) are destroyed before they are completed.
    const isEnergyCollectorDestroyerChosenThisRound = players.some(
        (player) => player.chosenCard === ENERGY_COLLECTOR_DESTROYER_CHOICE_NAME
    );

    // Destroying targeted Energy Collectors happens before energy gains are calculated, so the
    // destroyed collectors no longer grant their passive income this round.
    destroyEnergyCollectorsOfTargetedPlayers(players);

    for (const player of players) {
        const energyBeforeRound = player.energy;

        let winCount = 0;
        for (const player1 of players) {
            if (player.id === player1.id) continue;

            if (CHOICE_MATCHUPS[player.chosenCard].beats.includes(player1.chosenCard)) winCount++;
        }
        const energyGained = winCount - CHOICE_ENERGY_COST[player.chosenCard] + player.energyCollectors;
        player.energy += energyGained;

        if (player.chosenCard === ENERGY_COLLECTOR_CHOICE_NAME
            && player.energyCollectors < MAXIMUM_ENERGY_COLLECTORS
            && !isEnergyCollectorDestroyerChosenThisRound) {
            player.energyCollectors++;
        }

        player.roundsPlayed++;
        player.chosen[player.chosenCard]++;
        for (const choiceName of CHOICE_NAMES) {
            if (energyBeforeRound >= CHOICE_ENERGY_COST[choiceName]) {
                player.total[choiceName]++;
            }
        }

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

/**
 * Applies the Energy Collector Destroyer's targeted ability: each player who chose it destroys
 * the Energy Collectors of the next player (in player-list order, wrapping around) who currently
 * owns at least one, independently of any other Energy Collector Destroyer chosen this round. If
 * that targeted player chose the Energy Collector Destroyer Interrupter this round, the
 * destruction is blocked and the ability fizzles instead of targeting a later player.
 * @param {Array<Object>} currentPlayers The players of the current round, in list order.
 */
function destroyEnergyCollectorsOfTargetedPlayers(currentPlayers) {
    for (let indexAttacker = 0; indexAttacker < currentPlayers.length; indexAttacker++) {
        const attacker = currentPlayers[indexAttacker];
        if (attacker.chosenCard !== ENERGY_COLLECTOR_DESTROYER_CHOICE_NAME) continue;

        for (let offset = 1; offset < currentPlayers.length; offset++) {
            const target = currentPlayers[(indexAttacker + offset) % currentPlayers.length];
            if (target.energyCollectors >= 1) {
                if (target.chosenCard !== ENERGY_COLLECTOR_DESTROYER_INTERRUPTER_CHOICE_NAME) {
                    target.energyCollectors = 0;
                }
                break;
            }
        }
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
            update: { $set: {
                energy: player.energy,
                chosen: player.chosen,
                total: player.total,
                energyCollectors: player.energyCollectors,
                roundsPlayed: player.roundsPlayed
            } }
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
            chosen: createEmptyChoiceTally(),
            total: createEmptyChoiceTally(),
            energyCollectors: 0,
            roundsPlayed: 0
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
            chosen: normalizeChoiceTally(playerDocument.chosen),
            total: normalizeChoiceTally(playerDocument.total),
            energyCollectors: playerDocument.energyCollectors ?? 0,
            roundsPlayed: playerDocument.roundsPlayed ?? 0
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

        if (card === "Reset Choice") {
            player.chosenCard = "";
            emitGameState();
            return;
        }

        if (!CHOICE_NAMES.includes(card)) return;
        if (player.energy < CHOICE_ENERGY_COST[card]) {
            socket.emit("chooseError", "Not enough energy to choose \"" + card + "\".");
            return;
        }
        if (card === ENERGY_COLLECTOR_CHOICE_NAME && player.energyCollectors >= MAXIMUM_ENERGY_COLLECTORS) {
            socket.emit("chooseError", "Maximum number of Energy Collectors reached.");
            return;
        }
        if (card === ENERGY_COLLECTOR_DESTROYER_INTERRUPTER_CHOICE_NAME && player.energyCollectors < 1) {
            socket.emit("chooseError", "You need at least 1 Energy Collector to choose \"" + card + "\".");
            return;
        }

        player.chosenCard = card;
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
