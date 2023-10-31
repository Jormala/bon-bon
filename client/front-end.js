let socket;

// Helper functions
function getElement(id) {
    return document.getElementById(id);
}
function setElementText(id, text) {
    getElement(id).innerText = text;
}


function connectWebSocket() {
    setElementText('client-connection', "Connecting...");
    console.log('Connecting...')

    socket = new WebSocket('ws://localhost:31415');

    socket.onopen = () => {
        console.log('WebSocket connection established');
        setElementText('client-connection', "Connected");
    };

    socket.onmessage = handleMessage;

    socket.onclose = () => {
        console.log('WebSocket connection closed');
        setElementText('client-connection', "Disconnected");
        
        // This is kind of unreliable, but fuckit
        setTimeout(connectWebSocket, 1000);
    };
}

function handleMessage(event) {
    const json = JSON.parse(event.data);

    const type = json.type;
    const data = json.data;
    switch (type) {
        case 'vision':
            getElement('vision').src = data;
            break;
        
        case 'person-bbox':
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
        
        case 'camera-response-time':
            setElementText('camera-response-time', data);
            break;

        default:
            console.log("Unknown type: " + type);
            break;
    }
}

connectWebSocket();
