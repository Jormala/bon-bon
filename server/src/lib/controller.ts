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

    private gazing = false;   // If we are in the process of turning our head towards something
    private looking = false;  // Are we looking for a human
    private vision = false;   // Should we process vision
    private wantToSee: (() => boolean) = () => { return this.vision || this.looking };

    private currentBoundingBox: BoundingBox | null = null;

    public constructor(client: WebClient, raspberry: Raspberry) {
        this.raspberry = raspberry;
        this.client = client;

        this.recognition = new Recognition();
        this.animator = new Animator(this.raspberry, client);

        this.RECEIVED_IMAGE_TYPE = OPTIONS.get("RECEIVED_IMAGE_TYPE");

        this.client.setMessageHandler((type, data) => { this.handleInput(type, data) });
    }

    /**
     * Servo lifecycle
     */
    public async servoRunner() {
        this.animator.animate();

        // is this a hack?
        // yes
        if (this.animator.animationEnded() && this.currentBoundingBox) {
            this.animator.lookAt(this.currentBoundingBox!);
            // const randomAnimation = this.getRandomActAnimation();
            // this.animator.loadAnimation(randomAnimation);
        }

        // TODO: Implement the calibration process here and to animator.
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
            if (err instanceof Error) {
                console.log(err.message);
                return;
            }

            throw err;
        }

        const bbox = await this.getBoundingBox(rawImageData);
        const currentBoundingBox = bbox.length === 4 ? bbox as BoundingBox : null;

        this.currentBoundingBox = currentBoundingBox;

        if (!currentBoundingBox ||  // We don't see anything
            !this.looking) {  // We aren't looking for anything
            return;
        }

        this.animator.loadAnimation("joku hassu animaatio");
        this.animator.lookAt(currentBoundingBox);
        this.looking = false;
        this.gazing = true;
    }
    
    public handleInput(type: string, data: string) {
        try {
            switch (type) {
                case 'start-animation': {
                    this.animator.loadAnimation(data);

                    this.looking = false;
                    this.gazing = false;

                    this.client.sendInfo('log', `Started animation "${data}"`);
                    break;
                }

                case 'set-position': {
                    const parsedJSON = JSON.parse(data);
                    const position: Position = Position.fromJSON(parsedJSON);

                    this.animator.animateToPosition(position);

                    this.looking = false;
                    this.gazing = false;
                    break;
                }
                
                case 'restart-animation': {
                    this.animator.animateToStart();
                    break;
                }

                case 'start-looking': {

                    if (this.currentBoundingBox === null) {
                        break;
                    }

                    this.animator.lookAt(this.currentBoundingBox);

                    // this.looking = true;
                    // this.gazing = false;

                    // const lookForAnimation: string = OPTIONS.get("look-for");
                    // this.animator.loadAnimation(lookForAnimation);

                    // this.client.sendInfo('log', "Started looking");
                    // break;
                    break;
                }

                case 'set-vision': {
                    this.vision = data === 'true';

                    this.client.sendInfo('log', `Set vision to "${this.vision}"`);
                    break;
                }

                case 'reload-options': {
                    OPTIONS.load();
                    
                    this.client.sendInfo('log', "Reloaded options.json");
                    break;
                }

                case 'set-looping': {
                    this.animator.loopAnimation = data === 'true';

                    this.client.sendInfo('log', `Set looping to "${this.animator.loopAnimation}"`);
                    break;
                }

                case 'set-transition-speed': {
                    const transitionSpeed: number = Number(data);
                    try {
                        this.animator.transitionSpeed = transitionSpeed;
                    }
                    catch {
                        throw Error(`Couldn't covert "${data}" to a number`);
                    }

                    this.client.sendInfo('log', `Set transition speed to: ${this.animator.transitionSpeed}`)
                    break;
                }

                default: {
                    this.client.sendInfo('log', `Invalid command type "${type}"`);
                    break;
                }
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
                // not sure if this even can happen lol
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