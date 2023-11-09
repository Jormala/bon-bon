import { WebClient } from "./lib/webclient";
import { Raspberry } from "./lib/raspberry";
import { Controller } from './lib/controller';
import { OPTIONS } from "./lib/options";

const client = new WebClient();
const raspberry = new Raspberry(client);


async function startRunner(func: any, logAddress: string) {
    while (true) 
    {
        if (!raspberry.isConnected()) {
            // The raspberry isn't connected wtf
            // Wait until it reconnects
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // We declare this here because then SLEEP can be updated during runtime
        const sleep = OPTIONS.get("SLEEP");

        try {
            await new Promise(r => setTimeout(r, sleep));
            // We don't take into account sleeping
            const startTime = Date.now();

            await func();

            const loopDuration = Date.now() - startTime;

            let cyclesPerSecond = Math.round(1000 / loopDuration * 10) / 10;
            if (cyclesPerSecond === Infinity) {
                client.sendInfo(logAddress, "Fast");  // Divide by zero error, we're going "pretty" fast
            }
            else {
                client.sendInfo(logAddress, cyclesPerSecond);
            }
        }
        catch (err) {
            // typescript moment
            if (err instanceof Error) {
                console.error(err);
                throw err;
            }
        }
    }
}

raspberry.connect().then((result) => {
    if (!result) {
        // Didnt't locate the raspberry on the network, exit the program.
        process.exit();
    }

    const controller = new Controller(client, raspberry);

    startRunner(() => controller.cameraRunner(), 'camera-cycle');
    startRunner(() => controller.servoRunner(), 'servo-cycle');
});