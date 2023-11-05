import { Raspberry } from './raspberry';
import { Animation, Frame, Position, HEAD_SERVOS } from './animation';
import { OPTIONS } from './options';

import fs from 'fs';


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
 * Handles how animations are parsed. Takes into accont the current behaviour of the bot
 */
export class Animator {
    private raspberry: Raspberry;

    public status: string = "Nothing going on";  // this is kind of autistic

    private _loopAnimation = false;
    private currentAnimation: AnimationObject | null = null;
    private transitionAnimation: AnimationObject | null = null;

    private readonly ANIMATIONS_PATH: string = "res/animations.json";

    public constructor(raspberry: Raspberry) {
        this.raspberry = raspberry;
    }

    public transitioning(): boolean {
        return Boolean(this.transitionAnimation) && !this.transitionAnimation!.animation.animationEnded();
    }

    public animationEnded(): boolean {
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

        if (this._loopAnimation) {
            // We only need to act here if...
            // - The current animation has ended (otherwise we will loop in animate)
            // - The next animation hasn't been defined

            if (this.animationEnded()) {
                this.currentAnimation?.animation.resetAnimation();
            }
        }
    }

    public animate() {
        if (this.animationEnded()) {
            // No animation is playing currently
            return;
        }

        if (this.transitioning()) {
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

        this.handleAnimation(this.currentAnimation!);

        if (this.currentAnimation!.animation.animationEnded() && this.loopAnimation) {
            this.animateToStart();
        }
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

    public animateToStart() {
        this.status = "Restarting current animation..."

        // Gets the position at the start of the animation
        const startPosition: Position = this.currentAnimation!.animation.getPosition(0);
        const animationToStart: Animation = this.animationToPosition(startPosition);

        this.transitionAnimation = {
            animation: animationToStart,
            keepHeadStill: false
        };
    }

    public loadAnimation(animationName: string) {
        // Reason we load every time, is so we can edit the animation data during runtime and then update
        const data: string = fs.readFileSync(this.ANIMATIONS_PATH, 'utf8');

        let loadedAnimations;
        try {
            loadedAnimations = JSON.parse(data);
        }
        catch (err) {
            if (err instanceof SyntaxError) {
                // Give a slightly better message when parsing fails
                throw new SyntaxError(`JSON parsing Error "${err.message}"`);
            }

            throw err
        }

        let foundAnimation = undefined;
        for (let animation of loadedAnimations) 
        {
            if (animation.name === animationName) {
                foundAnimation = animation;
            }
        }

        if (foundAnimation === undefined) {
            throw Error(`Didn't find a animation with the name '${animationName}'`);
        }

        // this line can throw an error if the animation data was stupid and dumb
        const newAnimation: AnimationObject = {
            animation: Animation.fromJSON(foundAnimation.frames),
            keepHeadStill: Boolean(foundAnimation.keepHeadStill)
        };

        this.setAnimation(newAnimation);
    }

    private setAnimation(animationObject: AnimationObject) {
        this.currentAnimation = animationObject;
        this.animateToStart();
    }

    private animationToPosition(position: Position, duration = 1000): Animation {
        // IF we don't know the current position, we "jump" to the given position...
        // this is fucking dumb and dangerous
        const currentPosition = this.raspberry.servos ?? position;
        if (currentPosition === position) {
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

    public animateToPosition(position: Position, duration = 1000) {
        this.currentAnimation = null;
        this.transitionAnimation = {
            animation: this.animationToPosition(position, duration),
            keepHeadStill: true
        };
    }

    public lookAt(boundingBox: BoundingBox) {
        const finalPosition = this.calculateHeadPosition(boundingBox);

        // Not a complex animation that we would want to loop, so we only "transition" here
        this.animateToPosition(finalPosition, OPTIONS.get("LOOK_SPEED"));
    }

    private calculateHeadPosition(targetBoundingBox: BoundingBox): Position {
        // THE REALLY FUCKING COMPLICATED SHIT

        // REMEMBER TO CONFIGURE THESE THEN
        const imageWidth: number = OPTIONS.get("IMAGE_WIDTH");
        const imageHeight: number = OPTIONS.get("IMAGE_HEIGHT");

        return new Position({} as any);
    }
}
