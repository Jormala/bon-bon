import fs from 'fs';

import { WebClient } from './webclient';
import { Raspberry } from './raspberry';
import { Animation, Frame, Position, HEAD_SERVOS } from './animation';

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

            // Reset the "real" animation (if one is set)
            this.currentAnimation?.animation.resetAnimation();
            return;
        }

        this.client?.sendInfo('animation-state', "Animating");

        this.handleAnimation(this.currentAnimation!);

        if (this.currentAnimation!.animation.animationEnded() && this.loopAnimation) {
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
    public animateToPosition(position: Position, duration = 1000) {
        this.currentAnimation = null;
        this.transitionAnimation = {
            animation: this.animationToPosition(position, duration),
            keepHeadStill: true
        };

        this.client?.sendInfo('animation-log', "Transitioning to a Position");
    }

    public lookAt(boundingBox: BoundingBox) {
        const finalPosition = this.calculateHeadPosition(boundingBox);

        // Not a complex animation that we would want to loop, so we only "transition" here
        this.animateToPosition(finalPosition, OPTIONS.get("LOOK_SPEED"));
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
            keepHeadStill: Boolean(foundAnimation.keepHeadStill)
        };

        this.setAnimation(newAnimation);
    }


    private handleAnimation(animationObject: AnimationObject) {
        const position: Position = animationObject.animation.animate();

        if (this.currentAnimation!.keepHeadStill) {
            HEAD_SERVOS.forEach(headServo => {
                position.servos[headServo] = null;
            });
        }

        this.raspberry.setServos(position);
    }

    private setAnimation(animationObject: AnimationObject) {
        this.currentAnimation = animationObject;
        this.animateToStart();
    }

    private animationToPosition(position: Position, duration = 1000): Animation {
        // IF we don't know the current position, we "jump" to the given position...
        // this is fucking dumb and dangerous
        const currentPosition = this.raspberry.getServos() ?? position;
        if (currentPosition.equals(position)) {
            // If we jump straight away, why wait?
            duration = 0;
        }

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
                    duration   // speed
                )
            ]
        );

        return animation;
    }

    private calculateHeadPosition(targetBoundingBox: BoundingBox): Position {
        // THE REALLY COMPLICATED SHIT

        // TODO: REMEMBER TO CONFIGURE THESE THEN
        const imageWidth: number = OPTIONS.get("IMAGE_WIDTH");
        const imageHeight: number = OPTIONS.get("IMAGE_HEIGHT");

        // currently this will actually crash :D
        return new Position({} as any);
    }
}
