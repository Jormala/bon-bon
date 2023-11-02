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

    public status: string = "Nothing going on";
    public loopAnimation = false;

    private currentAnimation?: AnimationObject;
    private originalAnimation: AnimationObject | null = null;
    private _animationEnded = true;


    private readonly ANIMATIONS_PATH: string = "res/animations.json";

    public constructor(raspberry: Raspberry) {
        this.raspberry = raspberry;
    }

    public get animationEnded(): boolean {
        return this._animationEnded;
    }

    public animate() {
        if (this._animationEnded) {
            if (!this.currentAnimation || !this.loopAnimation) {
                return;
            }

            this.animateToStart();
        }

        const position: Position = this.currentAnimation!.animation.animate();

        if (this.currentAnimation!.animation.animationEnded()) {
            this._animationEnded = true;
        }

        if (this.currentAnimation!.keepHeadStill) {
            HEAD_SERVOS.forEach(headServo => {
                position.servos[headServo] = null;
            });
        }

        this.raspberry.setServos(position);

        // this sucks this sucks dick
        // i hate how we have to make this property
        // i hate how it's only purpose is to serve looping
        // i hate how it's part of the "animate" method
        if (this.originalAnimation && this._animationEnded) {
            this.currentAnimation = this.originalAnimation;
            this.currentAnimation.animation.resetAnimation();
            this._animationEnded = false;

            this.originalAnimation = null;

            this.status = "Playing animation...";
        }
    }

    public animateToStart() {
        if (!this.currentAnimation || this.originalAnimation) {
            return;
        }

        // Gets the position at the start of the animation
        const startPosition: Position = this.currentAnimation.animation.getPosition(0);
        const animationToStart: Animation = this.animationToPosition(startPosition);

        this.status = "Restarting current animation..."
        this.originalAnimation = this.currentAnimation!;
        this.setAnimation(animationToStart);
    }

    public setPosition(position: Position, keepHeadStill = false) {
        const animation = this.animationToPosition(position);

        this.setAnimation(animation);
    }

    public loadAnimation(animationName: string): boolean {
        // Reason we load every time, is so we can edit the animation data during runtime and then update
        const data: string = fs.readFileSync(this.ANIMATIONS_PATH, 'utf8');
        const loadedAnimations: any = JSON.parse(data);

        let foundAnimation;
        for (let animation of loadedAnimations) 
        {
            if (animation.name === animationName) {
                foundAnimation = animation;
            }
        }

        if (foundAnimation) {
            // this line can throw an error if the animation data was stupid and dumb
            const newAnimation = Animation.fromJSON(foundAnimation.frames);

            this.setAnimation(newAnimation, !!(foundAnimation.keepHeadStill));
        }

        return !!(foundAnimation);
    }

    private setAnimation(animation: Animation, keepHeadStill = false) {
        // HUGE TODO: Make so this method ALWAYS animates to the first frame of the given animation.
        // After that, it starts the given animation
        // Use animationToPosition?
        // Just use animateToStart as the last call in this function
        // THIS WILL CAUSE AN RECURSION SHIT

        // random thought, make so this whole class has two states, going to the first frame of the given animation,
        // and animating the given animation.

        // using that philosophy might make the code a bit cleaner

        this.currentAnimation = {
            animation: animation,
            keepHeadStill: keepHeadStill
        }

        this._animationEnded = animation.animationEnded();
    }

    private animationToPosition(position: Position, duration = 1000): Animation {
        const animation = new Animation(
            [
                new Frame(
                    this.raspberry.servos!,  // position
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

    private lookAt(boundingBox: BoundingBox) {
        const finalPosition = this.calculateHeadPosition(boundingBox);

        const timeToTurn = OPTIONS.get("LOOK_SPEED");
        const lookAtAnimation = this.animationToPosition(finalPosition, timeToTurn);

        this.setAnimation(lookAtAnimation);
    }

    private calculateHeadPosition(targetBoundingBox: BoundingBox): Position {
        // THE REALLY FUCKING COMPLICATED SHIT

        // REMEMBER TO CONFIGURE THESE THEN
        const imageWidth: number = OPTIONS.get("IMAGE_WIDTH");
        const imageHeight: number = OPTIONS.get("IMAGE_HEIGHT");

        return new Position({} as any);
    }
}
