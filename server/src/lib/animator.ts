import { WebClient } from './webclient';
import { Raspberry } from './raspberry';
import { Animation, Frame, Position, Servo } from './animation';

import { OPTIONS } from './options';


export type BoundingBox = [number, number, number, number]

export class AnimationHandle {
    private handler: Animator;  // Handles changes to the animation
    private key: Animation;  // The animation that the handle controls. In animator basically functions as a 'key'

    private callbacks: (() => void)[] = [];

    public constructor(handler: Animator, key: Animation) {
        this.key = key;
        this.handler = handler;
    }

    public stopAnimation() {
        this.handler.stopAnimation(this.key);
    }

    public registerCallback(callback: () => void) {
        this.callbacks.push(callback);
    }

    public triggerCallbacks() {
        // I'd be fun be able to send whether the animation actually ended
        //  or was prematurely ended (like by clearAnimations).
        this.callbacks.forEach(callback => callback());
    }
}

/**
 * Handles how animations are parsed and moves servos accordingly
 */
export class Animator {
    private raspberry: Raspberry;
    private client: WebClient | null = null;

    private _transitionSpeed: number = 1000;

    private animations!: Map<Animation, AnimationHandle>;

    public constructor(raspberry: Raspberry, client?: WebClient) {
        this.raspberry = raspberry;
        this.client = client ?? null;

        this.clearAnimations();
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

    public animationEnded(): boolean {
        return this.animations.size === 0;
    }

    public stopAnimation(animation: Animation) {
        this.animations.delete(animation);
    }

    public clearAnimations() {
        this.animations = new Map<Animation, AnimationHandle>();
    }

    /**
     * Transitions to the given position
     * 
     * @param position The position to transition to
     * @param duration How long the transition takes
     */
    public animateToPosition(position: Position, duration?: number): AnimationHandle {
        const animation = this.animationToPosition(position, duration);
        this.client?.sendInfo('animation-log', "Animating to a Position");

        return this.setAnimation(animation);
    }

    /**
     * Doesn't move servos for the specified amount of time
     * @param duration How many milliseconds to keep the current pose
     * @returns 
     */
    public idle(duration: number): AnimationHandle {
        // the "null position" works well here, as we don't actually send data to the servos.
        const idleAnimation = new Animation(
            [
                new Frame(
                    Position.nullPosition(), // position
                    duration,  // stil
                    0  // speed
                )
            ],
            new Set<Servo>(Object.values(Servo))  // manually specify all servos
        );

        return this.setAnimation(idleAnimation);
    }

    public loadAnimation(rawFrames: any, force: boolean = true): AnimationHandle | null {
        const frames: Frame[] = Frame.fromJSON(rawFrames);
        
        // This is actually kind of weird:
        //  We want to transition from the current position (aka from the currently set servos)
        //  to the first frame of the animation.
        //  This requires that the actual "first" frame's speed needs to be modified.
        //  We also need to insert the current position to the beginning of the frame. 
        frames[0].speed = this.transitionSpeed;
        frames.unshift(new Frame(this.raspberry.getServos(), 0, 0));  // what is happening

        const newAnimation = new Animation(
            frames, 
            frames[1].position.getSpecifiedServos()  // We don't want to specify all the servos.
        );

        if (force) {
            return this.setAnimation(newAnimation);
        }
        
        return this.addAnimation(newAnimation);
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

        this.client?.sendInfo('animation-state', "Animating");  // 'animation-state' is kind of useless rn

        const finishedAnimations: Animation[] = [];
        const finalPosition = Position.nullPosition();
        for (const animation of this.animations.keys())
        {
            finalPosition.fillWith(animation.animate());

            if (animation.animationEnded()) {
                finishedAnimations.push(animation);
            }
        }

        this.raspberry.setServos(finalPosition);

        // We trigger callbacks only after we send shit to the servos
        for (const finishedAnimation of finishedAnimations) 
        {
            const handle = this.animations.get(finishedAnimation)!;  // We get the handle before removing it from the map
            this.animations.delete(finishedAnimation);

            handle.triggerCallbacks();
        }
    }

    public lookAt(boundingBox: BoundingBox): AnimationHandle | null {
        const headPosition = Position.nullPosition();

        const width: number | null = this.raspberry.getImageWidth();
        const height: number | null= this.raspberry.getImageHeight();

        if (width === null || height === null) {
            throw Error("Was not able to get camera width and/or height");
        }

        const lookTreshold = OPTIONS.get("DISTANCE_TRESHOLD") * width;

        const centerX: number = width / 2;
        const centerY: number = height / 2;

        const targetX: number = centerX - (boundingBox[0] + boundingBox[2] / 2);
        const targetY: number = centerY - boundingBox[1] + lookTreshold;

        // Logic to see if we're basically looking at the target already
        const dist = Math.sqrt(targetX*targetX + targetY*targetY);
        const isLookingAtTarget: boolean = (dist < lookTreshold) && 
                                           (boundingBox[0] < width/2 && width/2 < boundingBox[0] + boundingBox[2]);  // probably not necessary
        
        if (isLookingAtTarget) {
            return null;
        }

        const currentPosition: Position = this.raspberry.getServos();

        // As we'll always move the EyeY servo, we do it here

        // here we assume that the a turn from 0 to 100 means turning from 
        //  left side of the vision to the right side, and this may not be true 
        //  depending on the fov and of the distance between the camera and the servo pivot.
        const eyeRelationY: number  = 100 / height * OPTIONS.get("EYE_Y_RELATION");

        const diffY: number = -targetY * eyeRelationY;  // EyeY servo is inverted

        const currentEyeY: number = currentPosition.getServo(Servo.EyeY)!;
        const actualEyeY: number = currentPosition.getServo(Servo.EyeY, true)!;

        const newEyeY: number = currentEyeY + diffY;
        headPosition.setServo(Servo.EyeY, newEyeY);

        // Used for calculating how long the transition takes
        const actualDiffY = Math.abs(headPosition.getServo(Servo.EyeY, true)! - actualEyeY);


        let actualDiffX: number | null = null;

        // The other servos are calculated in the same way
        // NECK MOVEMENT
        if (Math.abs(targetX) > width*3/4) {
            const neckRelationX: number = 100 / height * OPTIONS.get("NECK_X_RELATION");
            const diffX: number =  targetX * neckRelationX;
            const currentNeckX: number = currentPosition.getServo(Servo.NeckX)!;
            const actualNeckX: number = currentPosition.getServo(Servo.NeckX, true)!;
            const newNeckX: number = currentNeckX + diffX;
            headPosition.setServo(Servo.NeckX, newNeckX);

            actualDiffX = Math.abs(headPosition.getServo(Servo.NeckX, true)! - actualNeckX);
        }
        // HORIZONTAL EYE MOVEMENT
        else {
            const eyeRelationX: number = 100 / width * OPTIONS.get("EYE_X_RELATION");
            const diffX: number =  targetX * eyeRelationX;
            const currentEyeX: number = currentPosition.getServo(Servo.EyeX)!;
            const actualEyeX: number = currentPosition.getServo(Servo.EyeX, true)!;
            const newEyeX: number = currentEyeX + diffX;
            headPosition.setServo(Servo.EyeX, newEyeX);

            actualDiffX = Math.abs(headPosition.getServo(Servo.EyeX, true)! - actualEyeX);
        }
        // Calculate how long the turning will take
        const duration: number = Math.max(actualDiffX, actualDiffY) * OPTIONS.get("SERVO_MOVE_DURATION");

        const headTurnAnimation = this.animateToPosition(headPosition, duration);

        return headTurnAnimation;
    }

    /**
     * Starts playing the animation if no other animation is animating any of the servos.
     * Method assumes that the given animation transitions from current servo values.
     * @param animation 
     * @returns Whether was able to add animation
     */ 
    private addAnimation(newAnimation: Animation): AnimationHandle | null {
        const newAnimationServos = newAnimation.specifiedServos;

        for (const animation of this.animations.keys()) {
            for (const servo of newAnimationServos)
            {
                if (animation.specifiedServos.has(servo)) {
                    return null;
                }
            }
        }
        
        const handle = new AnimationHandle(this, newAnimation);
        this.animations.set(newAnimation, handle);
        return handle;
    }

    /**
     * Forces an `animation` to play, stopping other animations that nnimate the servos that the `animation` animates. \
     * **Method assumes that the given animation transitions from current servo values.**
     * @param animation 
     */
    private setAnimation(newAnimation: Animation): AnimationHandle {
        const animationSpecifiedServos: Set<Servo> = newAnimation.specifiedServos;

        for (const animation of this.animations.keys()) {
            for (const servo of animationSpecifiedServos)
            {
                if (animation.specifiedServos.has(servo)) {
                    this.client?.sendInfo('animation-log', "Stopped playing animation");
                    this.animations.delete(animation);
                }
            }
        }

        this.client?.sendInfo('animation-log', "Started playing a new animation");
        
        const handle = new AnimationHandle(this, newAnimation);
        this.animations.set(newAnimation, handle);
        return handle;

    }

    private animationToPosition(position: Position, duration?: number): Animation {
        duration = duration ?? this._transitionSpeed;

        const currentPosition: Position = this.raspberry.getServos();
        const frames: Frame[] = [
            new Frame(
                currentPosition,  // position
                0,  // still
                0   // speed
            ),
            new Frame(
                position,  // position
                0,  // still
                duration   // speed
            )
        ];
        const animation = new Animation(frames, position.getSpecifiedServos());

        return animation;
    }
}
