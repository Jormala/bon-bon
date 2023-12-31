const axios = require('axios');
const ip = require('ip');
import WebSocket from 'ws';

import { WebClient } from './webclient';
import { Position, Servo } from './animation';

import { OPTIONS } from './options'
import imageSize from 'image-size';


export class Raspberry {
    private client: WebClient;

    private servoClient?: WebSocket;
    private _servos: Position | null = null;
    private connected: boolean = false;

    private raspberryIp?: string;
    private cameraEndpoint?: string;
    private servoGetEndpoint?: string;
    private servoSetEndpoint?: string;

    private readonly RASPBERRY_PORT: number;

    private imageWidth: number | null = null;
    private imageHeight: number | null = null;

    public constructor(client: WebClient) {
        this.client = client;

        this.RASPBERRY_PORT = OPTIONS.get("RASPBERRY_PORT");
    }

    // We don't want these values to be changed
    public getImageWidth() {
        return this.imageWidth;
    }
    public getImageHeight() {
        return this.imageHeight;
    }
    public isConnected(): boolean {
        return this.connected;
    }

    public getServos(): Position {
        // We don't want the servo values to be changed externally
        return this._servos!.clone();
    }

    public async connect() {
        if (!await this.getIPV4(this.RASPBERRY_PORT)) {
            throw Error("Failed to find the Raspberry Pi's IPV4 address");
        }

        this.cameraEndpoint = `http://${this.raspberryIp}:${this.RASPBERRY_PORT}/camera`;
        this.servoGetEndpoint = `http://${this.raspberryIp}:${this.RASPBERRY_PORT}/servo/get`;
        this.servoSetEndpoint = `ws://${this.raspberryIp}:${this.RASPBERRY_PORT}/servo/set`;

        console.log('RASPBERRY: Trying to establish connection to Raspberry...');
        this.servoClient = this.constructClient();

        // "Wait for 10000 milliseconds for `this._servos !== null` to be true. If this doesn't happen..."
        if (!await waitFor(() => this._servos !== null, 10000)) {
            throw Error("Failed to get initial servo values!");
        }
    }

    private constructClient(): WebSocket {
        const servoClient: WebSocket = new WebSocket(this.servoSetEndpoint!);

        servoClient.on('open', async() => {
            console.log("RASPBERRY: Established connection!");

            await this.getInitialServoValues();

            this.connected = true;
        });

        servoClient.on('close', () => {
            this.connected = false;

            console.log("RASPBERRY: Lost connection");

            this.client.sendInfo('log', "Server lost connection with the Raspberry");

            // Wait for 3 seconds before we try to reconnect (yeah these numbers are pulled from my ass)
            setTimeout(() => {
                console.log("RASPBERRY: Reconnecting...")
                this.client.sendInfo('log', "Server is trying to reconnect with the Raspberry...");

                this.servoClient = this.constructClient();
            }, 3000);
        });

        servoClient.on('error', () => {
            this.connected = false;

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
            response = await axios.get(this.cameraEndpoint, { timeout: OPTIONS.get("CAMERA_TIMEOUT"), validateStatus: () => true });
        }
        catch (err) {
            this.client.sendInfo('camera-response-time', "TIMED OUT");
            this.client.sendInfo('log', "Camera timed out")

            // Sleep for a bit, as `raspistill` command might fail if we send data straight away to it.
            //  (might be unneccesary)
            // await new Promise(r => setTimeout(r, 100));  

            throw err;
        }

        const responseTime = Date.now() - startTime;

        console.log(`RASPBERRY: Camera query took ${responseTime}ms`)
        this.client.sendInfo('camera-response-time', `${responseTime}ms`);

        const imageData: string = response.data;

        if (!this.imageWidth || !this.imageHeight) {
            await this.getImageDimensions(imageData);

            console.log(`RASPBERRY: Width '${this.imageWidth}'`);
            console.log(`RASPBERRY: Height '${this.imageHeight}'`);
        }

        return imageData;
    }

    private async getImageDimensions(base64Image: string) {
        const buffer = Buffer.from(base64Image, 'base64');
        const { width, height } = imageSize(buffer);
        
        this.imageWidth = width!;
        this.imageHeight = height!;
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
            servoValues[servo] = data[index] as number;
        });

        const newServos = new Position(servoValues);

        // Fill the servo values with the default position
        const defaultServos = new Position(OPTIONS.get("DEFAULT_POSITION"));
        newServos.fillWith(defaultServos);

        console.log(`RASPBERRY: Queried servos: ${newServos.toString()}`);

        this.setServos(newServos);
    }

    /**
     * Sends data to the servo endpoint.
     * 
     * @param servoData Data send to the servos. **Needs to be formatted correctly.**
     */
    public setServos(position: Position) {
        if (!this.servoEndpointOpen()) {
            this.client.sendInfo('current-servos',  "null");
            this.client.sendInfo('current-raw-servos', "null");

            return;
        }

        this.servoClient!.send(position.toString());

        // We don't want to store the null values, so we fill them with the previous servo values
        if (this._servos) {
            position.fillWith(this._servos);
        }
        this._servos = position;

        this.client.sendInfo('current-servos', this._servos.toString());
        this.client.sendInfo('current-raw-servos', this._servos.toStringRaw());
    }

    private servoEndpointOpen(): boolean {
        return this.servoClient?.readyState === WebSocket.OPEN;
    }

    /**
     * Attempts to find the Raspberry Pi on the network.
     * 
     * @param port - The Port where node-red is hosted on the Raspberry Pi.
     * @returns Whether succesful in locating the Raspberry Pi on the network.
     */
    private async getIPV4(port: number): Promise<boolean> {
        const savedIp: string = OPTIONS.get('RASPBERRY_IP');

        if (await testHttp(savedIp, port)) {
            this.raspberryIp = savedIp;
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
        for (const ip of ips) 
        {
            const test: Test = {
                promise: testHttp(ip, port).then(result => test.result = result),
                result: false,
                ip: ip
            };

            tests.push(test);
        }

        // Wait for all the tests to finish 
        await Promise.all(tests.map(test => test.promise));

        const firstPassedTest = tests.filter(test => test.result)[0];
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


async function waitFor(func: () => any, timeout: number): Promise<boolean> {
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
        }, timeout);
    });
}
