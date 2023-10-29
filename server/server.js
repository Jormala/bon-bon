const axios = require('axios');

const recognition = require('./lib/recognition');
const client = require('./lib/client');
const { getRasperryPiAddress } = require('./lib/find-raspberry');


async function queryCameraEndpoint() {
    // GET request to the "camera" endpoint

    console.log("CAMERA: Quering CAMERA endpoint")
    const startTime = Date.now();

    let response;
    try {
        response = await axios.get(cameraEndpoint, { timeout: TIMEOUT });
    }
    catch (err) {
        client.sendInfo('camera-response-time', "TIMED OUT");
        throw err;
    }

    const responseTime = Date.now() - startTime;
    console.log(`CAMERA: Query took ${Math.round(responseTime / 100) / 10}s`)

    client.sendInfo('camera-response-time', `${responseTime}ms`);

    // console.log(response.status);
    if (response.status != 200) {
        // This shouldn't EVER happen.
        console.log("mitä vittua 1");
        console.log(response);
        throw new Error("Bad status");
    }

    return response.data;
}

async function getPersonBoundingBox() {
    const rawImageData = await queryCameraEndpoint();

    const startTime = Date.now();  // Debugging information

    const imgData = `data:image/${RECEIVED_IMAGE_TYPE};data:image/${RECEIVED_IMAGE_TYPE};base64,${rawImageData}`;
    client.sendInfo('vision', imgData)

    // Detect thingys in the image
    const predictions = await recognition.runImageRecognition(rawImageData, MIN_SCORE);

    // Prints useful things
    console.log(`RECOGNITION: Objects: [ ${predictions.map(prediction => `"${prediction.class}"`).join(', ')} ]. Took ${(Date.now() - startTime) / 1000}s`);

    const firstPerson = predictions.filter((prediction) => prediction.class == "person")
                            .sort((prediction) => prediction.score)[0];
    if (!firstPerson) {
        client.sendInfo('person-bbox', []);
        console.log("RECOGNITION: No people in view");
        return [];
    }

    const bbox = firstPerson.bbox;
    client.sendInfo('person-bbox', bbox);

    console.log(`RECOGNITION: First person Bounding Box: [ ${bbox.map((coord => `"${Math.round(coord * 100) / 100}"`)).join(', ')}) ]`);

    return bbox;
}

function handleControl(json) {
    console.log("CONTROL: " + json);
}

function constructRunner(main) {
    return runner = {
        start: async function eventLoop() {
            this.terminated = false;
            this._shouldTerminate = false;

            while (!this._shouldTerminate) {
                try {
                    await main();
                }
                catch (error) {
                    console.log("Error: " + error.message);
                }
            }

            this.terminated = true;
        },
        terminate: async function () { 
            this._shouldTerminate = true 

            while (!this.terminated) {
                await new Promise(r => setTimeout(r, 100));
            }
        },
        terminated: true,
        _shouldTerminate: false
    }
}


/* CONSTANTS */
const MIN_SCORE = 0.5;              // How certain the algorithm has to be to return a "prediction"
const TIMEOUT = 6000;               // How to wait for the endpoint to respond. Set zero for "infinite"
const RECEIVED_IMAGE_TYPE = "jpg";  // The image type received from the camera endpoint
const RASPBERRY_PORT = '1880';


let raspberryIp; 
let servoEndpoint; 
let cameraEndpoint; 

let personBoundingBox = null;


async function main() {
    console.log(`IP: Trying to connect to Port '${RASPBERRY_PORT}'`);

    raspberryIp = await getRasperryPiAddress(RASPBERRY_PORT);

    servoEndpoint = `http://${raspberryIp}:${RASPBERRY_PORT}/servo`;
    cameraEndpoint = `http://${raspberryIp}:${RASPBERRY_PORT}/camera`;

    // use this if you're afraid in the runner constructor: 
    // `await new Promise(r => Promise.resolve());`
    // doesn't seem to have a big impact on performance (even if you don't sleep between)

    personRunner = constructRunner(async () => {
        // personBoundingBox = await getPersonBoundingBox();
        await new Promise(r => setTimeout(r, 100));
    });

    servoRunner = constructRunner(async () => {
        // is it possible to make these into clusters?
        // they probably don't need to be. currently atleast both use async functionalities, so it shouldn't matter
        // test if you can send UDP requests and see how much faster that is.
        // the mean for the post request was about 5-10ms, pretty fast, but waiting for a response is stupid and pointless

        
        // here's phind's trash code: (`dgram` is built-in suposedly)
        const dgram = require('dgram');

        //  Create a UDP socket
        const socket = dgram.createSocket('udp4');

        // Define the message and destination
        const message = 'Hello, UDP server!';
        const port = 1881;
        const host = '192.168.1.132'; // Replace with the IP address or hostname of the UDP server

        // Send the UDP message
        socket.send(message, port, host, (error) => {
        if (error) {
            console.error(error);
            // we don't need to close the socket if we're sending multiple requests back-to-back ;)
            socket.close();
        } else {
            console.log('UDP message sent successfully');
            socket.close();
        }
        }); 
       
        // console.log('send message')
        await new Promise(r => setTimeout(r, 1000));
        // await axios.post(servoEndpoint, { data: "huohohh" }, { timeout: 1000 });
    });


    client.setMessageHandler(handleControl);

    client.addRunner(personRunner);
    client.addRunner(servoRunner);

    client.startConnection();
}

main();