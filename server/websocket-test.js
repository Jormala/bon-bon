const WebSocket = require('ws');

// const wss = new WebSocket.Server({ port: 9879 });

// wss.on('connection', ws => {
//     console.log('connection established');

//     ws.send("kakkakaakaakaka");
// });

const client = new WebSocket('ws://192.168.1.132:1880/ws/hello');

client.on('open', () => {
    console.log('connection established');

    // let i = 0;
    // while (true) {
    //     const msg = `Message: ${i+1}`;

    //     console.log(msg);
    //     client.send(msg);
    //     i++;
    // }

    client.send("vittu haista");
});

client.on('message', msg => {
    const decodedMsg = new Buffer.from(msg);
    console.log(decodedMsg.toString());

    // infinite loop
    client.send("Message: 1");
});


/// Okay here's the idea dump on this idea:
// **This is very cool**
// - It's a good idea to use this to send information to rasperry
// - I think it's fine to use HTTP GET to get camera information, as we want to wait for the response before doing anything. Using websocket would require implementaiton of waiting for the / be very fucking stupid.
// - I would probably make this into a class to abstarct connecting to the rasperry
// - I don't know what to do if the connection is lost. Maybe keep trying to send requests until it works

// Other things to remember:
// - The idea is to abstract sending and controlling Bon-Bon, by having the following architecture:
// CLIENT send *animations* to CONTROLLER.
// *animations* are multiple *movements*
// *movement* consists of:
// - *servos*: the location of servos
// - *speed*: how fast does the transition happen between the last and current *servos*
// - *still*: how long to keep *servos* at the specified values after transitioning

// COMPILER takes in an *animation*, interpolates the current *frame*
// *frame* is the position of *servos*. it's readable by the raspberry
// CONTROLLER uses COMPILER to get the current *frame* and sends it (using websocket) to raspberry
// CONTROLLER and COMPILER both only know the current *animation*. 
// CONTROLLER is used to:
// - change the information that the COMPILER sees, such as what is the current person position
// - fetch/parse the current *animation* e.g. from json or from user input
// - use COMPILER

// COMPILER is used to:
// - Parse the given *animation* into frames
// - Return 

