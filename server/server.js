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

let rpsDatabase;

async function connectDatabase() {
    await mongoClient.connect();
    rpsDatabase = mongoClient.db("RockPaperScissors");
    console.log("MongoDB connected");
}

let players = [];
let games = [];

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
        id: games.length + 1,
        players: []
    };

    // todo später einbauen das wenn zweimal der gleiche Spieler Name im Spiel ist das das Spiel nicht gespeichert wird

    for (const player of players) {
        let energyGained = 0;
        for (const player1 of players) {
            if (player.id === player1.id) continue;

            if (player.chosenCard === "Rock" && player1.chosenCard === "Scissors") energyGained++;
            if (player.chosenCard === "Paper" && player1.chosenCard === "Rock") energyGained++;
            if (player.chosenCard === "Scissors" && player1.chosenCard === "Paper") energyGained++;
        }
        player.energy += energyGained;
        console.log(player.name + " has gained " + energyGained + " Energy");

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

    await rpsDatabase.collection("games").insertOne(game);
    games = await rpsDatabase.collection("games").find().toArray();
    io.emit("games", games);
}

io.on("connection", async (socket) => {

    emitGameState();

    socket.on("join", (name) => {
        players.push({
            id: socket.id,
            name: name,
            chosenCard: "",
            energy: 0
        });

        for (const player of players) {
            player.chosenCard = "";
        }

        socket.emit("init", socket.id);
        emitGameState();
    });

    socket.on("disconnect", async () => {
        players = players.filter(p => p.id !== socket.id);
        emitGameState();
        await evaluateChoices();
    });

    socket.on("leave", async () => {
        players = players.filter(p => p.id !== socket.id);
        emitGameState();
        await evaluateChoices();
    });

    socket.on("chose-thing", async (card) => {
        console.log(card);
        players.find(p => p.id === socket.id).chosenCard = (card === "Reset Choice" ? "" : card);
        emitGameState();
        await evaluateChoices();
    });

    games = await rpsDatabase.collection("games").find().toArray();
    io.emit("games", games);
});

connectDatabase().then(() => {
    server.listen(3002,"0.0.0.0", () => {
        console.log("Server running on https://rock-paper-scissors-advanced.onrender.com");
    });
});