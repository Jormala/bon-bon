const SERVO_ORDER = [
    "l-shoulder-x",
    "l-shoulder-y",
    "l-elbow",
    "l-hand-x",
    "l-hand-y",
    "r-shoulder-x",
    "r-shoulder-y",
    "r-elbow",
    "r-hand-x",
    "r-hand-y",
    "eye-x",
    "eye-y",
    "neck-x" ,
    "neck-y",
    "jaw"
]

let socket;


// Helper functions
function getElement(id) {
    return document.getElementById(id);
}
function setElementText(id, text) {
    getElement(id).innerText = text;
}
function log(text, logType="log") {
    for (let j in Array.from(Array(9))) {
        const i = 9 - j;
        document.getElementById(`${logType}-${i}`).innerText = document.getElementById(`${logType}-${i - 1}`).innerText;
    }

    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    const timestamp = `${hours}:${minutes}:${seconds}`;

    document.getElementById(`${logType}-0`).innerText = `${timestamp} - ${text}`;
}


function connectWebSocket() {
    // BUNCH of logging information
    setElementText('client-connection', "Connecting...");
    console.log('Connecting...')
    log('Connecting to Server...');

    socket = new WebSocket('ws://localhost:31415');

    socket.onopen = () => {
        console.log('WebSocket connection established');
        log('Connection established with Server');

        setElementText('client-connection', "Connected");
    };

    socket.onmessage = handleMessage;

    socket.onerror = () => {
        log("Connection to Server timed out")
    };

    socket.onclose = () => {
        console.log('WebSocket connection closed');
        log('Lost connection with Server');

        setElementText('client-connection', "Disconnected");
        
        // This is kind of unreliable, but fuckit
        setTimeout(connectWebSocket, 1000);
    };
}

function sendData(type, data) {
    if (socket.readyState !== WebSocket.OPEN) {
        return;
    }

    const message = {
        type: type,
        data: data
    };
    socket.send(JSON.stringify(message));
}

/**
 * Handles incomming data from the Server.
 */
function handleMessage(event) {
    const json = JSON.parse(event.data);

    const type = json.type;
    const data = json.data;
    switch (type) {
        case 'vision': {
            getElement('vision').src = data;
            break;
        }
        
        case 'person-bbox': {
            const sourceImage = getElement('vision');
            const destinationImage = getElement('target');

            const canvas = document.createElement('canvas');

            console.log(sourceImage.src);

            canvas.width = sourceImage.naturalWidth;
            canvas.height = sourceImage.naturalHeight;

            const context = canvas.getContext('2d');
            context.drawImage(sourceImage, 0, 0);

            context.strokeStyle = "red";
            context.lineWidth = 6;  // 6 pixels
            context.rect(data[0], data[1], data[2], data[3])
            context.stroke()

            const rectImageUrl = canvas.toDataURL();
            destinationImage.src = rectImageUrl;

            break;
        }
        
        case 'camera-response-time': {
            setElementText('camera-response-time', data);
            break;
        }

        case 'animation-log': {
            log(data, 'animation-log');
            break;
        }

        case 'log': {
            log(data);
            break;
        }

        case 'animation-state': {
            setElementText('animation-status', data);
            break;
        }

        case 'servo-cycle': {
            setElementText('servo-cycle', data);
            break;
        }
        case 'camera-cycle': {
            setElementText('camera-cycle', data);
            break;
        }

        case 'current-servos': {
            const parsedJSON = JSON.parse(data);
            
            let formattedData = "";
            parsedJSON.forEach((value, index) => {
                // what a mess
                formattedData += `${SERVO_ORDER[index]}: ${value}\n`;
            });

            setElementText('current-servos', formattedData);
            break;
        }

        case 'current-raw-servos': {
            const parsedJSON = JSON.parse(data);

            formattedData = "";
            parsedJSON.forEach((value, index) => {
                // what a mess
                formattedData += `${SERVO_ORDER[index]}: ${value}\n`;
            });

            setElementText('current-raw-servos', formattedData);
            break;
        }

        default: {
            const unknownTypeMessage = `Received an unknown type: ${type}`

            console.log(unknownTypeMessage);
            log(unknownTypeMessage);
            break;
        }
    }
}

connectWebSocket();
