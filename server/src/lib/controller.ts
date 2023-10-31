import { OPTIONS } from './options';

import { Animation } from './animation';  
import { Client } from './client';  
import { Parser } from './parser';  
import { Recognition } from './recognition';
import { Raspberry } from './raspberry';
import { AxiosError } from 'axios';

/* 
Here we have the "Controller" class. Here's what it does:
- Handles the general behaviour of Bon-Bon, such as scheduling animations and RECEIVING animations
- Keep's track of what animation the parser is munching on
- 
*/
export class Controller {
    private recognition: Recognition;
    private parser: Parser;
    private raspberry: Raspberry;
    private client: Client;

    private receivedImageType: string;
    private currentAnimation?: Animation;

    public wantToSee: boolean = true;  // Whether to parse camera input
    private currentBoundingBox: number[] = [];
    private lastSeen?: number[];  // Maybe the default value could be at the center

    public constructor(client: Client, raspberry: Raspberry) {
        this.raspberry = raspberry;
        this.client = client;

        this.recognition = new Recognition();
        this.parser = new Parser(this.raspberry);

        this.receivedImageType = OPTIONS.get("this.receivedImageType")

        this.client.messageHandler = this.handleInput;
    }

    public async servoRunner() {
        // Servo lifecycle

        await new Promise(r => setTimeout(r, 1000));
    }

    public async cameraRunner() {
        // Camera lifecycle

        if (!this.wantToSee) {
            await new Promise(r => setTimeout(r, 100));
            return;
        }

        let rawImageData: string; 
        try {
            rawImageData = await this.raspberry.getCamera();
        }
        catch (err) {
            if (err instanceof AxiosError) {
                return;
            }

            throw err;
        }

        this.currentBoundingBox = await this.getBoundingBox(rawImageData);

        if (this.currentBoundingBox.length != 4) {
            this.lastSeen = this.currentBoundingBox;
        }
    }
    
    public handleInput(input: any) {
        // handles the user given input
    }

    private async getBoundingBox(imageData: string): Promise<number[]> {
        // const imageData: string = await this.raspberry.getCamera();

        const startTime = Date.now();  // Debugging information

        const imgData = `data:image/${this.receivedImageType};data:image/${this.receivedImageType};base64,${imageData}`;
        this.client.sendInfo('vision', imgData)

        // Detect thingys in the image
        const predictions = await this.recognition.runImageRecognition(imageData);

        // Prints useful things
        console.log(`RECOGNITION: Objects: [ ${predictions.map((prediction: any) => `"${prediction.class}"`).join(', ')} ]. Took ${(Date.now() - startTime) / 1000}s`);

        // "any" 🤮🤮🤮
        const firstPerson: any = predictions.filter((prediction: any) => prediction.class == "person")
            .sort((prediction: any) => prediction.score)[0];
        if (!firstPerson) {
            this.client.sendInfo('person-bbox', []);
            console.log("RECOGNITION: No people in view");
            return [];
        }

        const bbox: number[] = firstPerson.bbox;
        this.client.sendInfo('person-bbox', bbox);

        console.log(`RECOGNITION: First person Bounding Box: [ ${bbox.map((coord => `"${Math.round(coord * 100) / 100}"`)).join(', ')}) ]`);

        return bbox;
    }
}