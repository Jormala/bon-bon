const axios = require('axios');
const ip = require('ip');
const fs = require('fs');
const { exit } = require('process');


async function testHttp(ip, port) {
    try {
        const http = `http://${ip}:${port}`;

        // If you have an bad connection, it may help to make the 'timeout' -value bigger (if you can't find the ip)
        await axios.get(http, { timeout: 500 });  
    }
    catch (err) {
        return err;
    }
    return ip;
}

async function getRasperryPiAddress(port) {
    // Returns the RasperryPi's (or other devices) IP.

    const response = fs.readFileSync('./options.json', 'utf8');
    const options = JSON.parse(response);

    const previousIp = options['RASPBERRY_IP'];

    if (await testHttp(previousIp, port) === previousIp) {
        return previousIp;
    }

    // I HOPE TO GOD THIS WILL NEVER HAPPEN
    console.log("IP: Previous IP is invalid. Trying to fetch a new IP");

    const ipAddress = ip.address();
    // A horrifying one-liner
    const baseip = ip.toBuffer(ip.mask(ipAddress, (ip.fromPrefixLen(24)))).subarray(0, 3).join('.');

    let ips = [];
    for (let suffix of Array.from(Array(256)).keys()) {
        ips.push(`${baseip}.${suffix}`);
    }

    // Okay, so basically we try to send an stupidass http request to EVERY IP in our network.
    // IP:s searches are defined as:
    //  "[FIRST THREE PARTS OF OUR IP].[0-255]"
    // Meaning if our IP is "192.168.71.165", we try to check every IP between "192.168.71.[0-255]"

    // Q: "Is this efficient?"
    // A: FUCK NO. a WAY more better solution would probably to use nmap or some other network
    //     analyzer/ mapper. But the packackes that I found required "nmap" to be installed locally, which
    //     seemed like a pain in the ass.
    // 
    // Q: "What if my subnet mask isn't /24?"
    // A: sucks to get fucked lol.
    // 
    // Q: "this garbage can't find shit, can I manually input the IP?"
    // A: Yes. It can be inputted into "options.json".
    //    NOTE: Don't fuck up the name of the variable "RASPBERRY_IP", as
    //           the program will crash everytime after that.
    //    "it's also possible that the firewall is blocking the input on the other device
    //      or you aren't connected to the same network :D (but fck me)"

    let promises = [];
    for (let i of ips) {
        promises.push(testHttp(i, port));
    }

    const results = await Promise.all(promises);

    const newIp = results.filter(err => typeof err === 'string')[0];
    if (!newIp) {
        console.log("WARNING: Couldn't determine the Raspberry Pi IP. Exiting.");
        return exit();
    }

    console.log(`IP: Found the new Raspberry Pi IPV4: \"${newIp}\"`);

    options['RASPBERRY_IP'] = newIp;
    fs.writeFile('options.json', JSON.stringify(options), () => {});

    return newIp;
}


module.exports.getRasperryPiAddress = getRasperryPiAddress;
