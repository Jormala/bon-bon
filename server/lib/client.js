const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3001 });

let connection;
let clientHandler;
let runners = [];

function startConnection() {
    console.log('CLIENT: Trying to establish connection to client...')
    wss.on('connection', async ws => {
        // Only make a new connection in the old connection isn't open
        if (connection !== undefined && connection.readyState === WebSocket.OPEN) return;

        await terminateRunners();

        ws.on('message', handleClientMessage);

        connection = ws;
        console.log('CLIENT: Established connection!')

        startRunners();
    });
}

function setMessageHandler(handler) {
    clientHandler = handler;
}

function handleClientMessage(data) {
    // Decode the message
    const buffer = Buffer.from(data);
    const message = buffer.toString('utf8');

    const receivedJson = JSON.parse(message);

    console.log("CLIENT: Received JSON:");

    if (!clientHandler) {
        console.log("WARNING: ClientHandler isn't set!")
        return
    }

    clientHandler(receivedJson);
}

function sendInfo(type, data) {
    const json = {
        type: type,
        data: data
    };

    const stringifiedJson = JSON.stringify(json);

    sendToClient(stringifiedJson);
}

function sendToClient(data) {
    if (connection === undefined || connection.readyState !== WebSocket.OPEN) {
        terminateRunners();
        throw Error("Lost connection to client!");
    }

    connection.send(data);
}

function startRunners() {
    console.log("CLIENT: Starting runners")

    for (let runner of runners) {
        runner.start();
    }
}

async function terminateRunners() {
    console.log("CLIENT: Terminating runners")

    
    let promises = []
    for (let runner of runners) {
        promises.push(runner.terminate());
    }

    await Promise.all(promises);
}

function addRunner(runner) {
    runners.push(runner);
}

module.exports.sendInfo = sendInfo;
module.exports.setMessageHandler = setMessageHandler;
module.exports.addRunner = addRunner;
module.exports.startConnection = startConnection;