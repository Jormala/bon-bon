import { Client } from "./lib/client";
import { Raspberry } from "./lib/raspberry";
import { Controller } from './lib/controller';


const client = new Client();
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
            }
        }
    }
}

raspberry.connect().then((result) => {
    if (!result) {
        process.exit();
    }

    getRunner(() => controller.cameraRunner());
    getRunner(() => controller.servoRunner());
});