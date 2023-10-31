
const RECEIVED_IMAGE_TYPE = "jpg";  // The image type received from the camera endpoint
const RASPBERRY_PORT = '1880';


async function main() {


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

    client.startConnection();
}

main();