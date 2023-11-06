const axios = require('axios');
const ip = require('ip');
import WebSocket from 'ws';

import { WebClient } from './webclient';
import { Position, Servo } from './animation';

import { OPTIONS } from './options'


export class Raspberry {
    private servoClient?: WebSocket;
    private _servos: Position | null = null;

    private raspberryIp?: string;
    private cameraEndpoint?: string;
    private servoGetEndpoint?: string;

    private readonly RASPBERRY_PORT: number;
    private readonly CAMERA_TIMEOUT: number;

    private client: WebClient;


    public constructor(client: WebClient) {
        this.client = client;

        this.RASPBERRY_PORT = OPTIONS.get("RASPBERRY_PORT");
        this.CAMERA_TIMEOUT = OPTIONS.get("CAMERA_TIMEOUT");
    }

    public async connect(): Promise<boolean> {
        if (!await this.getIPV4(this.RASPBERRY_PORT)) {
            return false;
        }

        this.cameraEndpoint = `http://${this.raspberryIp}:${this.RASPBERRY_PORT}/camera`;
        this.servoGetEndpoint = `http://${this.raspberryIp}:${this.RASPBERRY_PORT}/servo/get`;

        console.log('RASPBERRY: Trying to establish connection to Raspberry...');
        this.servoClient = this.constructClient();

        if (!await waitFor(() => this._servos !== null)) {
            throw Error("Failed to get initial servo values!");
        }

        return true;
    }

    private constructClient(): WebSocket {
        // this doesn't need to be constructed EVERYtime here. too lazy to move
        const servoEndpoint = `ws://${this.raspberryIp}:${this.RASPBERRY_PORT}/servo/set`;

        const servoClient: WebSocket = new WebSocket(servoEndpoint);

        servoClient.on('open', async() => {
            console.log("RASPBERRY: Established connection!");

            await this.getInitialServoValues();
        });

        servoClient.on('close', () => {
            console.log("RASPBERRY: Lost connection");

            setTimeout(r => {
                console.log("RASPBERRY: Reconnecting...")
                this.servoClient = this.constructClient();
            }, 3000);
        });

        servoClient.on('error', () => {
            console.log("RASPBERRY: Failed to connect");
        });

        return servoClient;
    }


    /**
     * Fetches Bon-Bon's vision. Throws an error if camera time's out
     * 
     * @returns Image encoded in base64
     */
    public async getCamera(): Promise<string> {
        console.log("RASPBERRY: Quering CAMERA endpoint")

        const startTime = Date.now();

        let response;
        try {
            response = await axios.get(this.cameraEndpoint, { timeout: this.CAMERA_TIMEOUT });
        }
        catch (err) {
            this.client.sendInfo('camera-response-time', "TIMED OUT");
            this.client.sendInfo('log', "Camera timed out")

            throw err;
        }

        const responseTime = Date.now() - startTime;

        console.log(`RASPBERRY: Camera query took ${responseTime}ms`)
        this.client.sendInfo('camera-response-time', `${responseTime}ms`);

        if (response.status != 200) {
            // This shouldn't EVER happen. 
            console.log("mitä vittua");
            console.log(response);
            throw new Error("Bad status");
        }

        return response.data as string;
    }


    public getServos(): Position {
        return this._servos!;
    }

    private async getInitialServoValues() {
        console.log("RASPBERRY: Quering the /servo/get/ endpoint");

        let response: any;
        try {
            response = await axios.get(this.servoGetEndpoint, { timeout: 3000 });
        }
        catch (err) {
            console.error(err);

            console.log("RASPBERRY: Timed out when quering /servo/get/");
            this.client.sendInfo('log', "Timed out when quering /servo/get/");

            throw err;
        }

        console.log("RASPBERRY: Succesfully queried the endpoint");

        // We except to recive list of servo values
        const data = response!.data;

        const servoValues: any = {};
        Object.values(Servo).forEach((servo, index) => {
            // console.log(servo, data, index)
            servoValues[servo as Servo] = data[index] as number;
        });

        this._servos = new Position(servoValues);
    }

    /**
     * Sends data to the servo endpoint.
     * 
     * @param servoData Data send to the servos. **Needs to be formatted correctly.**
     */
    public setServos(position: Position) {
        if (!this.servoEndpointOpen()) {
            return;
        }

        // TODO
        // Here filter out the "null's"
        

        this._servos = position;
        this.servoClient!.send(position.toString());
    }

    private servoEndpointOpen(): boolean {
        return this.servoClient?.readyState === WebSocket.OPEN;
    }

    /**
     * Attempts to find the Raspberry Pi on the network. \
     * *Currently requires options to be present in the `res` folder*
     * 
     * @param port - The Port where node-red is hosted on the Raspberry Pi.
     * @returns Whether succesful in locating the Raspberry Pi on the network.
     */
    private async getIPV4(port: number): Promise<boolean> {
        const previousIp: string = OPTIONS.get('RASPBERRY_IP');

        if (await testHttp(previousIp, port)) {
            this.raspberryIp = previousIp;
            return true;
        }

        // I HOPE TO GOD THIS WILL NEVER HAPPEN
        console.log("RASPBERRY: Previous IP is invalid. Trying to fetch a new IP");

        const ipAddress: string = ip.address();
        
        // A horrifying one-liner
        const baseip: string = ip.toBuffer(ip.mask(ipAddress, (ip.fromPrefixLen(24)))).subarray(0, 3).join('.');

        let ips: string[] = [];
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

        // yeah i'm just fucking around
        // i'm not sure how you could even make this even more unnecessarily complicated
        interface Test {
            promise: Promise<boolean>,
            result: boolean,
            ip: string
        }

        let tests = [];
        for (let ip of ips) 
        {
            const test: Test = {
                promise: testHttp(ip, port).then(result => test.result = result),
                result: false,
                ip: ip
            };

            tests.push(test);
        }

        await Promise.all(tests.map(test => test.promise));

        const firstPassedTest = tests.filter(promise => promise.result)[0];
        if (!firstPassedTest) {
            console.log("WARNING: Couldn't determine the Raspberry Pi IPV4.");
            return false;
        }

        this.raspberryIp = firstPassedTest.ip;

        console.log(`RASPBERRY: Found the new Raspberry Pi IPV4: \"${this.raspberryIp}\"`);

        // save the newly found ip to options
        OPTIONS.set('RASPBERRY_IP', this.raspberryIp);

        return true;
    }
}


/**
 * Tests if the http contains a service.
 * 
 * @param host
 * @param port
 * @returns Whether or not the http contains some service
 */
async function testHttp(host: string, port: number): Promise<boolean> {
    try {
        const http = `http://${host}:${port}`;

        // If you have a slow connection, it may help to make the 'timeout' -value bigger (if you can't find the ip)
        await axios.get(http, { timeout: 500 });
    }
    catch (err) {
        return false;
    }

    return true;
}


async function waitFor(func: () => any): Promise<boolean> {
    return new Promise((resolve) => {
        const id = setInterval(() => {
            // We only verify the servo endpoint because imalazy
            if (func()) {
                clearInterval(id);
                resolve(true);
            }
        }, 50);

        setTimeout(() => {
            clearInterval(id);
            resolve(false);
        }, 10000);
    });
}