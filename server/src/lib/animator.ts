import fs from 'fs';

import { WebClient } from './webclient';
import { Raspberry } from './raspberry';
import { Animation, Frame, Position, HEAD_SERVOS, Servo } from './animation';

import { OPTIONS } from './options';


export type BoundingBox = [number, number, number, number]

/**
 * Handles how animations are parsed and moves servos accordingly
 */
export class Animator {
    private raspberry: Raspberry;
    private client: WebClient | null = null;

    private _transitionSpeed: number = 1000;

    private animations: Set<Animation>;

    public constructor(raspberry: Raspberry, client?: WebClient) {
        this.raspberry = raspberry;
        this.client = client ?? null;

        this.animations = new Set<Animation>;
    }

    public animationEnded(): boolean {
        return this.animations.size === 0;
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

        this.client?.sendInfo('animation-state', "Animating");  // this 'animation-state' is kind of useless rn

        const finishedAnimations = [];
        const finalPosition = Position.nullPosition();
        for (const animation of this.animations)
        {
            finalPosition.fillWith(animation.animate());
            if (animation.animationEnded()) {
                finishedAnimations.push(animation);
            }
        }

        this.raspberry.setServos(finalPosition);

        // We trigger callbacks only after we send shit to the servos
        for (const finishedAnimation of finishedAnimations) {
            this.animations.delete(finishedAnimation);

            finishedAnimation.triggerCallbacks();
        }
    }

    /**
     * Transitions to the given position
     * 
     * @param position The position to transition to
     * @param duration How long the transition takes
     */
    public animateToPosition(position: Position, duration?: number): Animation {
        const animation = this.animationToPosition(position, duration);
        this.setAnimation(animation);

        this.client?.sendInfo('animation-log', "Animating to a Position");

        return animation;
    }

    public lookAt(boundingBox: BoundingBox): Animation | null {
        const headPosition = Position.nullPosition();

        const width: number | null = this.raspberry.getImageWidth();
        const height: number | null= this.raspberry.getImageHeight();

        if (width === null || height === null) {
            throw Error("Was not able to get camera width and/or height");
        }

        const centerX: number = width / 2;
        const centerY: number = height / 2;

        const targetX: number = centerX - (boundingBox[0] + boundingBox[2] / 2);
        const targetY: number = centerY - boundingBox[1];  // We target the top of the person.

        // Logic to see if we're basically looking at the target already
        const dist = Math.sqrt(targetX*targetX + targetY*targetY);
        const lookTreshold = OPTIONS.get("DISTANCE_TRESHOLD") * width;
        const isLookingAtTarget: boolean = (dist < lookTreshold) && 
                                           (boundingBox[0] < width/2 && width/2 < boundingBox[0] + boundingBox[2]);  // probably not necessary
        
        if (isLookingAtTarget) {
            return null;
        }

        const currentPosition: Position = this.raspberry.getServos();

        // TODO: If target is on the leftmost or rightmost quater of the image, use neck
        //  to look instead of eyes
        const neckRelationY: number = 100 / height * OPTIONS.get("NECK_Y_RELATION");

        // here we assume that the a turn from 0 to 100 means turning from 
        //  left side of the vision to the right side, and this may not be true 
        //  depending on the fov and of the distance between the camera and the servo pivot.
        const eyeRelationX: number = 100 / width * OPTIONS.get("EYE_X_RELATION");
        const eyeRelationY: number  = 100 / height * OPTIONS.get("EYE_Y_RELATION");

        const diffX: number =  targetX * eyeRelationX;
        const diffY: number = -targetY * eyeRelationY;  // EyeY servo is inverted

        const currentEyeX: number = currentPosition.getServo(Servo.EyeX)!;
        const currentEyeY: number = currentPosition.getServo(Servo.EyeY)!;

        const newEyeX: number = currentEyeX + diffX;
        const newEyeY: number = currentEyeY + diffY;
        
        headPosition.setServo(Servo.EyeX, newEyeX);
        headPosition.setServo(Servo.EyeY, newEyeY);

        // TODO: Decide how fast the animation should be IN HERE, as we can somewhat estimate
        //  how far we're animating, and thus we know how long the animation should take. 
        //    servo value is changed by 1:   "fast" animation
        //    servo value is changed by 100: "slow" animation
        const duration: number = 69;

        const headTurnAnimation = this.animateToPosition(headPosition);

        return headTurnAnimation;
    }

    public idle(duration: number): Animation {
        const currentPosition: Position = this.raspberry.getServos();
        const idleAnimation = new Animation(
            [
                new Frame(currentPosition, 0, 0),
                new Frame(
                    currentPosition,  // position
                    0,  // still
                    duration!  // speed
                )
            ]
        );

        this.setAnimation(idleAnimation);

        return idleAnimation;
    }

    public endAnimation() {
        // "what about callbacks?" ugghhhhhualcshoesnuhato
        this.animations.clear();
    }


    public loadAnimation(rawFrames: any): Animation {
        const frames: Frame[] = Frame.fromJSON(rawFrames);
        frames[0].speed = this.transitionSpeed;
        frames.unshift(new Frame(this.raspberry.getServos(), 0, 0));  // what is happening

        const newAnimation = new Animation(frames);

        return newAnimation;
    }

    /**
     * Starts playing the animation if no other animation is animating any of the servos.
     * Method assumes that the given animation transitions from current servo values.
     * @param animation 
     * @returns Whether was able to add animation
     */ 
    private addAnimation(newAnimation: Animation): boolean {
        const newAnimationServos = newAnimation.specifiedServos;

        for (const animation of this.animations) {
            for (const servo of newAnimationServos)
            {
                if (animation.specifiedServos.has(servo)) {
                    return false;
                }
            }
        }
        
        this.animations.add(newAnimation);
        return true;
    }

    /**
     * Forces an `animation` to play, stopping other animations that nnimate the servos that the `animation` animates.
     * Method assumes that the given animation transitions from current servo values.
     * @param animation 
     */
    private setAnimation(newAnimation: Animation) {
        const newAnimationServos: Set<Servo> = newAnimation.specifiedServos;

        for (const animation of this.animations) {
            for (const servo of newAnimationServos)
            {
                if (animation.specifiedServos.has(servo)) {
                    this.client?.sendInfo('animation-log', "Stopped playing animation");
                    this.animations.delete(animation);
                }
            }
        }
        
        this.animations.add(newAnimation);
    }

    private animationToPosition(position: Position, duration?: number): Animation {
        duration = duration ?? this._transitionSpeed;
        const frames: Frame[] = [
            new Frame(
                position,  // position
                0,  // still
                0   // speed
            )
        ]
        const animation = new Animation(frames, position.getSpecifiedServos());

        return animation;
    }
}
