import { Position, Servo } from './animation';  
import { WebClient } from './webclient'
import { Recognition } from './recognition';
import { Raspberry } from './raspberry';
import { Animator, BoundingBox, AnimationHandle } from './animator';
import { OPTIONS } from './options';

import fs from 'fs';


enum State {
    Looking = 'Looking',                                 // We're looking for a person
    LookingAtAndAnimating = 'Looking at and Animating',  // We're looking at a person and animating
    Animating = 'Animating',                             // We're animating something. We're not looking for anything
    LookingAt = 'Looking At',                            // We're looking at the person if they exist
    Idle = 'Idle'                                        // We're not doing anything
}


export class Controller {
    private recognition: Recognition;
    private raspberry: Raspberry;
    private client: WebClient;
    private animator: Animator;

    private currentState: State = State.Idle;
    private vision: boolean = false;

    private static readonly ANIMATIONS_PATH: string = "res/animations.json";


    public constructor(client: WebClient, raspberry: Raspberry) {
        this.raspberry = raspberry;
        this.client = client;

        this.recognition = new Recognition();
        this.animator = new Animator(this.raspberry, client);

        this.client.setMessageHandler((type, data) => { this.handleInput(type, data) });

        this.startLooking();
    }

    private setState(newState: State) {
        this.currentState = newState;
        this.client.sendInfo("controller-state", newState);
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
        if (!this.vision && !(this.currentState === State.Looking || 
              this.currentState === State.LookingAt || 
              this.currentState === State.LookingAtAndAnimating)) {
            return;
        }

        let rawBase64ImageData;
        try {
            rawBase64ImageData = await this.raspberry.getCamera();
        }
        catch (err) {
            if (err instanceof Error) {
                console.log(err.message);
                return;
            }

            throw err;
        }

        const bbox = await this.getBoundingBox(rawBase64ImageData);
        const currentBoundingBox = bbox.length === 4 ? bbox as BoundingBox : null;

        this.handleBoundingBox(currentBoundingBox);
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

    private handleBoundingBox(boundingBox: BoundingBox | null) {
        if (!boundingBox) {
            return;
        }

        if (this.currentState === State.Looking) {
            this.animator.clearAnimations();

            const randomActAnimation = this.getRandomActAnimation();
            this.playAnimation(randomActAnimation, true);
        }

        this.animator.lookAt(boundingBox);
    }
    
    private handleInput(type: string, data: string) {
        try {
            switch (type) {
                case 'start-animation': {
                    this.playAnimation(data);

                    this.client.sendInfo('log', `Started animation "${data}"`);
                    break;
                }

                case 'set-position': {
                    const parsedJSON = JSON.parse(data);
                    const position: Position = new Position(parsedJSON);

                    this.animator.animateToPosition(position);

                    this.setState(State.Animating);

                    break;
                }

                case 'set-state': {
                    switch (data) {
                        case 'idle': {
                            this.setState(State.Idle);
                            this.animator.clearAnimations();

                            break;
                        }

                        case 'looking': {
                            this.startLooking();

                            break;
                        }

                        case 'look-at': {
                            this.setState(State.LookingAt);

                            break;
                        }

                        default: {
                            throw Error(`Unknown state '${data}'`);
                        }
                    }

                    break;
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

    private startLooking() {
        this.setState(State.Looking);

        const rawLookForAnimation = this.loadAnimation(OPTIONS.get("LOOK_FOR_ANIMATION"));
        const handle = this.animator.loadAnimation(rawLookForAnimation.frames)!;

        handle.registerCallback(() => {
            // restart the look for animation
            this.startLooking();
        });
    }

    private endAnimating() {
        const idleTime = this.generateRandomIdleTime();

        // First idle for a bit.
        const handle = this.animator.idle(idleTime);
        handle.registerCallback(() => {
            // After we've finished idling, start looking for the person.
            this.startLooking();
        });
    }

    /**
     * Tries to load an animation from "res/animations.json" \
     * This method throws an error if:
     * 1. File contains invalid JSON
     * 2. Animation isn't defined
     * @param animationName `name` field of the animation
     * @returns The raw animation data
     */
    private loadAnimation(animationName: string): any {
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

    private playAnimation(name: string, force: boolean = false) {
        const animationData = this.loadAnimation(name);
        const animation = this.animator.loadAnimation(animationData.frames, force);

        if (animation === null) {
            console.log("CONTROLLER: Couldn't start the animation!");
            this.client.sendInfo('log', "Couldn't start the animation!");

            return;
        }

        this.setState(State.Animating);
        if (animationData.lookWhileAnimating) {
            this.setState(State.LookingAtAndAnimating);
            animation.registerCallback(() => {
                // After animation, look forward
                this.animator.animateToPosition(new Position({
                    [Servo.EyeX]: 50,
                    [Servo.EyeY]: 50,
                    [Servo.NeckY]: 50
                }));

                this.setState(State.Animating);
            });
        }
    }

    private getRandomActAnimation(): string {
        const animations = OPTIONS.get("ACT_ANIMATIONS");
        return animations[Math.floor(Math.random()*animations.length)]
    }

    private generateRandomIdleTime(): number {
        try {
            const interval = OPTIONS.get("IDLE_INTERVAL");
            return interval.min + Math.random() * (interval.max - interval.min);  // came straight from my ass
        }
        catch (err) {
            // https://www.youtube.com/watch?v=_PNBkabyuJo
            console.error(err);
            this.client.sendInfo('log', "Error occured while generating a RANDOM IDLE TIME WTF IS HAPPENING");

            return 5000;
        }
    }
}