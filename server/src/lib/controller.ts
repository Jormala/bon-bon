import { AxiosError } from 'axios';

import { Position } from './animation';  
import { WebClient } from './webclient'
import { Recognition } from './recognition';
import { Raspberry } from './raspberry';
import { Animator, BoundingBox } from './animator';

import { OPTIONS } from './options';


export class Controller {
    private recognition: Recognition;
    private raspberry: Raspberry;
    private client: WebClient;
    private animator: Animator;

    private RECEIVED_IMAGE_TYPE: string;

    private currentBoundingBox?: BoundingBox | null;
    private lastSeen?: BoundingBox;

    private wantToSee = true;


    public constructor(client: WebClient, raspberry: Raspberry) {
        this.raspberry = raspberry;
        this.client = client;

        this.recognition = new Recognition();
        this.animator = new Animator(this.raspberry);

        this.RECEIVED_IMAGE_TYPE = OPTIONS.get("RECEIVED_IMAGE_TYPE");

        this.client.setMessageHandler((type, data) => { this.handleInput(type, data) });

        this.animator.loadAnimation('wave');
        // this.animator.loopAnimation = true;
    }

    /**
     * Servo lifecycle
     */
    public async servoRunner() {
        // await new Promise(r => r);
        await new Promise(r => setTimeout(r, 10));

        // this.client.sendInfo('parser-status', this.animator.status);

        this.animator.animate();
    }

    /**
     * Camera lifecycle
     */
    public async cameraRunner() {
        if (!this.wantToSee) {
            // We don't to get camera input, wait a bit
            await new Promise(r => setTimeout(r, 100));
            return;
        }

        let rawImageData; 
        try {
            rawImageData = await this.raspberry.getCamera();
        }
        catch (err) {
            if (err instanceof AxiosError) {
                console.log("RASPBERRY: Camera timed out!");
                return;
            }

            throw err;
        }

        const bbox = await this.getBoundingBox(rawImageData);
        this.currentBoundingBox = bbox.length == 4 ? bbox as BoundingBox : null;

        if (this.currentBoundingBox) {
            this.lastSeen = this.currentBoundingBox!;
        }
    }
    
    public handleInput(type: string, data: string) {
        // handles the user given input
        
        console.log(type, data);
        
        // TODO: Send logging responses back from some of these.
        try {
            switch (type) {
                case 'start-animation':
                    this.animator.loadAnimation('wave');
                    break;

                case 'pose':
                    const parsedJSON = JSON.parse(data);
                    const position: Position = Position.fromJSON(parsedJSON);

                    if (!position.allServosSpecified()) {
                        this.client.sendInfo('log', "Not all servos were specified!");
                        break;
                    }

                    this.animator.setPosition(position);

                    break;
                
                case 'restart-animation':
                    this.animator.animateToStart();
                    break;

                case 'loop-animation':
                    this.animator.loopAnimation = data == 'true';
                    break;
            }
        }
        catch (err) {
            if (err instanceof Error) {
                this.client.sendInfo('log', "Error processing input: ${err.message}");
            }
            else {
                console.error(err);
                this.client.sendInfo('log', "Fatal exception occurred!");
            }
        }
    }

    // This method REALLY doesn't belong here...
    private async getBoundingBox(imageData: string): Promise<number[]> {
        // const imageData: string = await this.raspberry.getCamera();

        const startTime = Date.now();  // Debugging information
        const imgData = `data:image/${this.RECEIVED_IMAGE_TYPE};data:image/${this.RECEIVED_IMAGE_TYPE};base64,${imageData}`;
        this.client.sendInfo('vision', imgData);

        // Detect thingys in the image
        const bbox = await this.recognition.getFirstPersonBoundingBox(imageData);
        this.client.sendInfo('person-bbox', bbox);

        console.log(`RECOGNITION: Took ${(Date.now() - startTime)}ms`)

        return bbox;
    }
}