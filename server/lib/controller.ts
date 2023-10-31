import { OPTIONS } from './options';

import { Client } from './client';  
import { Parser } from './parser';  
import { Recognition } from './recognition';
import { Raspberry } from './raspberry';

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

    public constructor(client: Client, raspberry: Raspberry) {
        this.raspberry = raspberry;
        this.client = client;

        this.recognition = new Recognition();
        this.parser = new Parser(this.raspberry);

        this.receivedImageType = OPTIONS.get("this.receivedImageType")

        this.client.messageHandler = this.handleInput;
    }
    
    public handleInput(input: any) {
        // handles the user given input
    }

    private async getBoundingBox(imageData): Promise<number[]> {
        const rawImageData: string = await this.raspberry.getCamera();

        const startTime = Date.now();  // Debugging information

        const imgData = `data:image/${this.receivedImageType};data:image/${this.receivedImageType};base64,${rawImageData}`;
        this.client.sendInfo('vision', imgData)

        // Detect thingys in the image
        const predictions = await this.recognition.runImageRecognition(rawImageData);

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