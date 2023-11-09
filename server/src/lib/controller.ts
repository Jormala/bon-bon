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

    private looking = false;
    private vision = false;
    private wantToSee: (() => boolean) = () => { return this.vision || this.looking };


    public constructor(client: WebClient, raspberry: Raspberry) {
        this.raspberry = raspberry;
        this.client = client;

        this.recognition = new Recognition();
        this.animator = new Animator(this.raspberry, client);

        this.RECEIVED_IMAGE_TYPE = OPTIONS.get("RECEIVED_IMAGE_TYPE");

        this.client.setMessageHandler((type, data) => { this.handleInput(type, data) });

        this.animator.loadAnimation('wave');
        // this.animator.loopAnimation = true;
    }

    /**
     * Servo lifecycle
     */
    public async servoRunner() {
        this.animator.animate();
    }

    /**
     * Camera lifecycle
     */
    public async cameraRunner() {
        if (!this.wantToSee()) {
            // We don't to get camera input
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
        const currentBoundingBox = bbox.length === 4 ? bbox as BoundingBox : null;

        if (!currentBoundingBox ||  // We don't see anything
            !this.looking) {  // We aren't looking for anything
            return;
        }

        // TODO: Do things in the following order:
        // 1. Disable looking
        // 2. Look at person
        // 3. Wait until the transition completes
        // 4. Start some random act animation

        // this.animator.lookAt(currentBoundingBox);
        // this.looking = false;
        
        // const randomAnimation = this.getRandomActAnimation();
        // this.animator.loadAnimation(randomAnimation);
    }
    
    public handleInput(type: string, data: string) {
        try {
            switch (type) {
                case 'start-animation':
                    this.animator.loadAnimation(data);

                    this.client.sendInfo('log', `Started animation "${data}"`);
                    break;

                case 'set-position':
                    const parsedJSON = JSON.parse(data);
                    const position: Position = Position.fromJSON(parsedJSON);

                    this.animator.animateToPosition(position);
                    break;
                
                case 'restart-animation':
                    this.animator.animateToStart();
                    break;

                case 'start-looking':
                    this.looking = true;

                    this.client.sendInfo('log', "Started looking");
                    break;

                case 'set-vision':
                    this.vision = data === 'true';

                    this.client.sendInfo('log', `Set vision to "${this.vision}"`);
                    break;

                case 'reload-options':
                    OPTIONS.load();
                    
                    this.client.sendInfo('log', "Reloaded options.json");
                    break;

                case 'set-looping':
                    this.animator.loopAnimation = data === 'true';

                    this.client.sendInfo('log', `Set looping to "${this.animator.loopAnimation}"`);
                    break;

                default:
                    this.client.sendInfo('log', `Invalid command type "${type}"`);
                    break;
            }
        }
        catch (err) {
            if (err instanceof Error) {
                // scream.
                console.log("CONTROLLER: An exception occured when handling CLIENT request...");
                console.error(err);
                this.client.sendInfo('log', `Error processing input: ${err.message}`);
            }
            else {
                // still not sure if this even can happen lol
                console.error(err);
                this.client.sendInfo('log', "Fatal exception occurred!");
            }
        }
    }

    private getRandomActAnimation(): string {
        const animations = OPTIONS.get("ACT_ANIMATIONS");
        return animations[Math.floor(Math.random()*animations.length)]
    }

    private async getBoundingBox(imageData: string): Promise<number[]> {
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