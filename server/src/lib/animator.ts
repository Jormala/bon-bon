import fs from 'fs';

import { WebClient } from './webclient';
import { Raspberry } from './raspberry';
import { Animation, Frame, Position, HEAD_SERVOS, Servo, Servos } from './animation';

import { OPTIONS } from './options';


export type BoundingBox = [number, number, number, number]

/**
 * Defines properties when animating. \
 * *i suck at naming things*
 */
interface AnimationObject {
    animation: Animation,
    keepHeadStill: boolean
}

/**
 * Handles how animations are parsed and moves servos accordingly
 */
export class Animator {
    private raspberry: Raspberry;
    private client: WebClient | null = null;

    private _loopAnimation = false;
    // Represents the actual animation that we want to handle.
    private currentAnimation: AnimationObject | null = null;
    // A "temporary" animation that's used to transition between frames
    private transitionAnimation: AnimationObject | null = null;

    private _transitionSpeed: number = 1000;

    private static readonly ANIMATIONS_PATH: string = "res/animations.json";

    public constructor(raspberry: Raspberry, client?: WebClient) {
        this.raspberry = raspberry;
        this.client = client ?? null;
    }

    public transitioning(): boolean {
        return Boolean(this.transitionAnimation) && !this.transitionAnimation!.animation.animationEnded();
    }

    public animationEnded(): boolean {
        // disgusting
        return !this.transitioning() && !(Boolean(this.currentAnimation) && !this.currentAnimation!.animation.animationEnded());
    }

    public get loopAnimation(): boolean {
        return this._loopAnimation;
    }

    public set loopAnimation(value: boolean) {
        if (value === this._loopAnimation) {
            return;
        }

        this._loopAnimation = value;

        if (this._loopAnimation && this.animationEnded()) {
            this.currentAnimation?.animation.resetAnimation();
        }
    }

    public set transitionSpeed(value: number) {
        if (isNaN(value)) {
            throw Error("Can't set NaN to be the transition speed!");
        }

        this._transitionSpeed = value;
    }

    public get transitionSpeed(): number {
        return this._transitionSpeed;
    }

    /**
     * Moves the servos according to the current animation
     */
    public animate() {
        if (this.animationEnded()) {
            // No animation is playing currently

            this.client?.sendInfo('animation-state', "Animation ended");

            return;
        }

        if (this.transitioning()) {
            // We are transitioning
            
            this.client?.sendInfo('animation-state', "Transitioning");

            this.handleAnimation(this.transitionAnimation!);
            
            if (!this.transitionAnimation!.animation.animationEnded()) {
                // Animation didn't finish, return right away
                return;
            }

            // Discard the "transitionAnimation", as it's unreliable to keep
            this.transitionAnimation = null;
            this.client?.sendInfo('animation-log', "Finished transitioning")

            // Reset the "real" animation (if one is set)
            if (this.currentAnimation) {
                this.currentAnimation!.animation.resetAnimation();
                this.client?.sendInfo('animation-log', "Starting animation");
            }
            return;
        }

        this.client?.sendInfo('animation-state', "Animating");

        this.handleAnimation(this.currentAnimation!);

        if (this.currentAnimation!.animation.animationEnded()) {
            this.client?.sendInfo('animation-log', "Animation finished");

            if (!this.loopAnimation) {
                return;
            }
            this.animateToStart();
        }
    }

    /**
     * Start transitioning to the start of the currentAnimation
     */
    public animateToStart() {
        if (!this.currentAnimation) {
            return;
        }

        // Gets the position at the start of the animation
        const startPosition: Position = this.currentAnimation!.animation.getPosition(0);
        const animationToStart: Animation = this.animationToPosition(startPosition);

        this.transitionAnimation = {
            animation: animationToStart,
            keepHeadStill: false
        };

        this.client?.sendInfo('animation-log', "Transitioning to start");
    }

    /**
     * Transitions to the given position
     * 
     * @param position The position to transition to
     * @param duration How long the transition takes
     */
    public animateToPosition(position: Position, duration?: number) {
        this.currentAnimation = null;
        this.transitionAnimation = {
            animation: this.animationToPosition(position, duration),
            keepHeadStill: false
        };

        this.client?.sendInfo('animation-log', "Transitioning to a Position");
    }

    public lookAt(boundingBox: BoundingBox) {
        const finalPosition = this.estimateHeadPosition(boundingBox);

        this.animateToPosition(finalPosition);
    }

    /**
     * Tries to load an animation from "res/animations.json" \
     * This method throws an error if:
     * 1. File contains invalid JSON
     * 2. Animation isn't defined
     * 3. Animation is invalid *(e.g. not all servos are specified)*
     * @param animationName `name` field of the animation
     */
    public loadAnimation(animationName: string) {
        // Reason we load every time, is so we can edit the animation data during runtime
        const data: string = fs.readFileSync(Animator.ANIMATIONS_PATH, 'utf8');

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

        // this line can throw an error if the animation data was stupid and dumb
        const newAnimation: AnimationObject = {
            animation: Animation.fromJSON(foundAnimation.frames),
            keepHeadStill: Boolean(foundAnimation.headStill)
        };

        this.setAnimation(newAnimation);
    }


    private handleAnimation(animationObject: AnimationObject) {
        const position: Position = animationObject.animation.animate();

        if (animationObject!.keepHeadStill) {
            HEAD_SERVOS.forEach(headServo => {
                position.setServo(headServo, null);
            });
        }

        this.raspberry.setServos(position);
    }

    private setAnimation(animationObject: AnimationObject) {
        this.currentAnimation = animationObject;
        this.animateToStart();
    }

    private animationToPosition(position: Position, duration?: number): Animation {
        duration = duration ?? this._transitionSpeed;

        // IF we don't know the current position, we "jump" to the given position...
        const currentPosition = this.raspberry.getServos() ?? position;
        if (currentPosition.equals(position)) {
            // If we jump straight away, why wait?
            duration = 0;
        }

        // I bet this can be optimized, as if we have nulls, then we don't have to move those servos
        // This would mean that we can just send null to the Raspberry, no need to send the current servo position
        // 1. Would be faster in node red, as it doesn't have to send many inputs to many servos
        // 2. Would be faster here, as we don't have to interpolate between the same value (imagine interpolating between 45 to 45)
        // but i'm too lazy to do actually implement this :///
        position.fillWith(currentPosition);

        const animation = new Animation(
            [
                new Frame(
                    currentPosition,  // position
                    0,  // startTime
                    0,  // still
                    0   // speed
                ),
                new Frame(
                    position,  // position
                    0,  // startTime
                    0,  // still
                    duration!  // speed
                )
            ]
        );

        return animation;
    }

    /**
     * Returns a estimate position for the servos, where we would be looking at the person
     * 
     * @param targetBoundingBox Bounding Box of the object.
     * @returns 
     */
    private estimateHeadPosition(targetBoundingBox: BoundingBox) {
        const headPosition = Position.nullPosition();

        const width: number = this.raspberry.getImageWidth() ?? 320;
        const height: number = this.raspberry.getImageHeight() ?? 240;

        if (width === null || height === null || !targetBoundingBox) {
            // return a null position
            return headPosition;
        }

        const centerX: number = width / 2;
        const centerY: number = height / 2;

        const relationX = 100 / width;
        const relationY = 100 / height;

        const targetX: number = targetBoundingBox[0] + targetBoundingBox[2] / 2;
        const targetY: number = targetBoundingBox[1];

        const diffX = ( -targetX + centerX ) * relationX;
        const diffY = ( targetY - centerY ) * relationY;

        const currentPosition = this.raspberry.getServos();
        const currentEyeX: number = currentPosition.getServo(Servo.EyeX)!;
        const currentEyeY: number = currentPosition.getServo(Servo.EyeY)!;

        const newEyeX = currentEyeX + diffX;
        const newEyeY = currentEyeY + diffY;
        
        headPosition.setServo(Servo.EyeX, newEyeX);
        headPosition.setServo(Servo.EyeY, newEyeY);

        return headPosition;
    }

    private calculateHeadPosition(targetBoundingBox: BoundingBox): Position {
        // this method would have been used to calculate the exact head position.
        // BUT ITS A FUCKING PAIN IN THE ASS THE MATH SUCK BECAUSE OF NECK-Y!!!

        // maybe in the future?

        // Fetch the imageWidth and the imageHeight from the `raspberry` object

        throw Error("Not implemented");
    }
}
