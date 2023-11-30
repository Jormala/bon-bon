import { Animation, Frame, Position, Servo } from './animation';  
import { WebClient } from './webclient'
import { Recognition } from './recognition';
import { Raspberry } from './raspberry';
import { Animator, BoundingBox } from './animator';

import { OPTIONS } from './options';
import fs from 'fs';


enum State {
    Looking,                // We're looking for a person
    LookingAtAndAnimating,  // We're looking at a person and animating
    Animating,              // We're animating something. We're not looking for anything
    LookingAt               // We're looking at the person if they exist
}


export class Controller {
    private recognition: Recognition;
    private raspberry: Raspberry;
    private client: WebClient;
    private animator: Animator;

    private currentState: State = State.Animating;
    private vision: boolean = false;

    private static readonly ANIMATIONS_PATH: string = "res/animations.json";


    public constructor(client: WebClient, raspberry: Raspberry) {
        this.raspberry = raspberry;
        this.client = client;

        this.recognition = new Recognition();
        this.animator = new Animator(this.raspberry, client);

        this.client.setMessageHandler((type, data) => { this.handleInput(type, data) });

        // TODO: Remove this
        this.animator.idle(1000);
    }

    /**
     * Servo lifecycle
     */
    public async servoRunner() {
        this.animator.animate();

        if (!this.animator.animationEnded()) {
            return;
        }

        switch (this.currentState) {
            case State.Looking: {

                break;
            }

            case State.Animating:
            case State.LookingAtAndAnimating: {
                this.animator.idle(5000).addCallback(() => {
                    this.currentState = State.Looking;
                });

                break;
            }

            case State.LookingAt: {
                // do nothing
                break;
            }
        }
    }

    /**
     * Camera lifecycle
     */
    public async cameraRunner() {
        if (!this.vision && !(this.currentState === State.Looking || 
              this.currentState === State.LookingAt || 
              this.currentState === State.LookingAtAndAnimating)) {
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

        if (!currentBoundingBox) {
            return;
        }

        const lookAtAnimation = this.animator.lookAt(currentBoundingBox)!;
        lookAtAnimation.addCallback(() => {

        });
        
        if (this.currentState === State.Looking) {
            const randomActAnimation = this.getRandomActAnimation();

            // TODO: Make it possible to retrieve attributes from the raw json back here.
            //  I need the new "look when animating"
            this.animator.endAnimation();
            const animationData = this.loadAnimation(randomActAnimation);
            const animation = this.animator.loadAnimation(animationData.frames);

            if (animationData.lookWhileAnimating) {
                this.currentState = State.LookingAtAndAnimating;
                animation.addCallback(() => {
                    // After animation, look forward
                    this.animator.animateToPosition(new Position({
                        [Servo.EyeX]: 50,
                        [Servo.EyeY]: 50,
                        [Servo.NeckY]: 50
                    }));

                    this.currentState = State.Animating;
                });
            }
            else {
                this.currentState = State.Animating;
            }
        }
    }
    
    public handleInput(type: string, data: string) {
        try {
            switch (type) {
                case 'start-animation': {
                    this.loadAnimation(data);

                    this.client.sendInfo('log', `Started animation "${data}"`);
                    break;
                }

                case 'set-position': {
                    const parsedJSON = JSON.parse(data);
                    const position: Position = new Position(parsedJSON);

                    this.animator.animateToPosition(position);

                    this.currentState = State.Animating;

                    break;
                }

                case 'set-state': {
                    switch (data) {
                        case 'idle': {
                            this.currentState = State.Animating;
                            this.animator.endAnimation();

                            break;
                        }

                        case 'looking': {
                            this.currentState = State.Looking;

                            this.setLookForAnimation();

                            break;
                        }

                        case 'look-at': {
                            this.currentState = State.LookingAt;

                            break;
                        }

                        default: {
                            throw Error(`Unknown state '${data}'`);
                        }
                    }
                }

                case 'set-vision': {
                    this.vision = data === 'true';

                    console.log(`Set vision to '${this.vision}'`);
                    this.client.sendInfo('log', `Set vision to '${this.vision}'`);
                    break;
                }

                case 'reload-options': {
                    OPTIONS.load();
                    
                    this.client.sendInfo('log', "Reloaded options.json");
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

    private setLookForAnimation() {
        const lookForAnimation = this.loadAnimation(OPTIONS.get("LOOK_FOR_ANIMATION"))[0];
        lookForAnimation.addCallback(() => {
            // restart the look for animation
            this.setLookForAnimation();
        }); 
    }

    private getRandomActAnimation(): string {
        const animations = OPTIONS.get("ACT_ANIMATIONS");
        return animations[Math.floor(Math.random()*animations.length)]
    }

    private async getBoundingBox(imageData: string): Promise<number[]> {
        const startTime = Date.now();

        const receivedImageType = OPTIONS.get("RECEIVED_IMAGE_TYPE");;
        const imgData = `data:image/${receivedImageType};data:image/${receivedImageType};base64,${imageData}`;
        this.client.sendInfo('vision', imgData);

        // Detect thingys in the image
        const bbox = await this.recognition.getFirstPersonBoundingBox(imageData);
        this.client.sendInfo('person-bbox', bbox);

        console.log(`RECOGNITION: Took ${(Date.now() - startTime)}ms`)

        return bbox;
    }

        /**
     * Tries to load an animation from "res/animations.json" \
     * This method throws an error if:
     * 1. File contains invalid JSON
     * 2. Animation isn't defined
     * @param animationName `name` field of the animation
     */
    public loadAnimation(animationName: string): any {  // TODO: Specify this type
        // Reason we load every time, is so we can edit the animation data during runtime
        const data: string = fs.readFileSync(Controller.ANIMATIONS_PATH, 'utf8');

        let loadedAnimations;
        try {
            loadedAnimations = JSON.parse(data);
        }
        catch (err) {
            if (err instanceof SyntaxError) {
                // Give a slightly better message when parsing fails
                throw new SyntaxError(`JSON parsing Error "${err.message}"`);
            }

            throw err;
        }

        let foundAnimation: any = null;
        for (let animation of loadedAnimations) 
        {
            if (animation.name === animationName) {
                foundAnimation = animation;
                break;
            }
        }

        if (foundAnimation === null) {
            throw Error(`Didn't find a animation with the name '${animationName}'`);
        }

        return foundAnimation;
    }

    private playAnimation(name: string) {
        const animationData = this.loadAnimation(name);

        this.currentState = State.Animating;
        if (animationData.lookWhileAnimating) {
            this.currentState = State.LookingAtAndAnimating;
        }

        this.animator.loadAnimation(animationData.frames);
    }
}