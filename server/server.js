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

    personRunner = constructRunner(async () => {
        personBoundingBox = await getPersonBoundingBox();
    });

    servoRunner = constructRunner(async () => {
        await new Promise(r => setTimeout(r, 5000));
        console.log("DEBUG: " + personBoundingBox);
    });


    client.setMessageHandler(handleControl);

    client.addRunner(personRunner);
    client.addRunner(servoRunner);

    client.startConnection();
}

main();