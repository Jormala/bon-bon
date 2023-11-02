import { WebClient } from "./lib/webclient";
import { Raspberry } from "./lib/raspberry";
import { Controller } from './lib/controller';

const client = new WebClient();
const raspberry = new Raspberry(client);
const controller = new Controller(client, raspberry);


async function getRunner(func: any) {
    while (true) {
        try { 
            await func();
        }
        catch (err) {
            // typescript moment
            if (err instanceof Error) {
                console.error(err);
                throw err
            }
        }
    }
}

raspberry.connect().then((result) => {
    if (!result) {
        // Didnt't locate the raspberry on the network, exit the program.
        process.exit();
    }

    getRunner(() => controller.cameraRunner());
    getRunner(() => controller.servoRunner());
});