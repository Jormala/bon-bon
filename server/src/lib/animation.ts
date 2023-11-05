/**
 * This document specifies the components needed to make an non dynamic animation
 * Animations are made dynamic using "Animator"
 */


// TODO: Name and implement these
// don't change the order of this enum. it contains the format in which the data is send to the raspberry
export enum Servo {
    Head1 = 'head1',
    Torso2 = 'torso2',
    Eye3 = 'eye3'
}

/**
 * The servos that are required for head movement, and that we DON'T want
 * to move when an animation is playing.
 */
export const HEAD_SERVOS: Servo[] = [ Servo.Head1, Servo.Eye3 ];


function map(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}
function mapFrom100(value: number, outMin: number, outMax: number) {
    return map(value, 0, 100, outMin, outMax);
}
function constrain(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}


function realServoValue(servo: Servo, value: number | null) {
    if (value === null) {
        return value;
    }

    // Only use `mapFrom100` method here, as all values should be 
    //  originally given as number between [0, 100]

    // TODO: Implement the ranges here
    // Implement the Servo enum first
    // The values could probably be defined in a JSON
    switch (servo) 
    {
        // case Servo.Head1:
        // case Servo.Torso2:
        //     return mapFrom100(value, 0, 100);

        default:  // No mapping needed
            return value;
    }
}

/**
 * Represents a position Bon-Bon can make
 */
export class Position {
    public servos: { [key in Servo]: number | null };

    public constructor(servos: {[key in Servo]: number | null}) {
        this.servos = servos;

        for (let [stringServo, value] of Object.entries(this.servos)) 
        {
            // for some reason it thinks the keys are strings??
            const servo = stringServo as Servo;

            this.servos[servo] = realServoValue(servo, value);
        }
    }

    public static fromJSON(servosJSON: any): Position {
        // okay this whole method is kind of autistic
        // it basically does the same thing as the constructor, but for an 'any' type
        // i'm keeping this as if something else needs to be taken into account in the json.
        // this would be a great place to parse that kind of shit

        const servos = {} as any;  // VERY cursed
        // this could be done backwards? it would assure no `undefined`:s make their way here
        Object.entries(servosJSON).forEach(([rawServo, value]) => 
        {
            // ugly casts. i hope this will throw an error if unable to do this
            const servo = rawServo as Servo;

            servos[servo] = realServoValue(servo, value as number | null);
        });

        return new Position(servosJSON);
    }

    public allServosSpecified() {
        const specifiedServos: Servo[] = Object.keys(this.servos).map(rawServo => <Servo>rawServo);
        for (const servo of Object.values(Servo))
        {
            // pretty weird that there are TWO if statements here...
            // could this be done in a better way? ABSOLUTELY

            if (!(specifiedServos.includes(servo))) {  // ALL servos
                return false;
            }

            if (this.servos[servo] === null) {  // SPECIFIED
                return false;
            }
        }

        return true;
    }

    public static interpolate(pos1: Position, pos2: Position, p: number): Position | null {
        p = constrain(p, 0, 1);

        const returnServos: any = {};
        for (let servo of Object.values(Servo)) {
            const servo1 = pos1.servos[servo];
            const servo2 = pos2.servos[servo];

            let interpolatedValue: number;
            if (servo1 === null) {
                interpolatedValue = servo2 as number;
            }
            else if (servo2 === null) {
                interpolatedValue = servo1 as number;
            }
            else {
                interpolatedValue = Math.round((servo1*(1-p) + servo2*p) * 100) / 100;
            }

            returnServos[servo] = interpolatedValue;
        }

        return new Position(returnServos);
    }

    public toString(): string {
        const array: (number | null)[] = [];
        for (const servo of Object.values(Servo)) {
            array.push(this.servos[servo]);
        }

        return JSON.stringify(array);
    }
}

/**
 * Represents a frame of movement. 
 */
export class Frame {
    public still: number;
    public speed: number;
    public position: Position;

    public startTime: number;  // feels weird to store this here
    public duration: number;


    public constructor(position: Position, startTime: number, still: number, speed: number) {
        this.position = position;
        this.startTime = startTime;
        this.still = still;
        this.speed = speed;

        // How long each frame takes to execute
        this.duration = this.still + this.speed;
    }

    public static fromJSON(frameJSON: any, startTime: number): Frame {
        return new Frame(
            Position.fromJSON(frameJSON['position']),
            startTime,
            frameJSON.still,
            frameJSON.speed
        );
    }

    public static interpolate(previousFrame: Frame, currentFrame: Frame, timeSinceStart: number): Position | null {
        if (timeSinceStart >= currentFrame.speed) {
            return currentFrame.position;
        }

        const p: number = timeSinceStart / currentFrame.speed;
        const currentPosition = Position.interpolate(
            previousFrame.position,
            currentFrame.position,
            p
        );

        return currentPosition;
    }
}


export class Animation {
    private readonly frames: Frame[];
    private readonly runTime: number;

    // Used when animating
    private currentTime?: number;
    private previousTime?: number;
    private _animationEnded = true;

    public constructor(frames: Frame[]) {
        this.frames = frames;
        this.runTime = 0;
        for (let f of this.frames) {
            this.runTime += f.duration;
        }

        this.resetAnimation();
    }

    public static fromJSON(framesJSON: any[]): Animation {
        const frames = [];

        let nextStartTime = 0;
        for (let rawFrame of framesJSON) 
        {
            const frame = Frame.fromJSON(rawFrame, nextStartTime);
            if (!frame.position.allServosSpecified()) {
                throw Error("Not all positions were specified!");
            }

            frames.push(frame);

            nextStartTime += frame.duration;
        }

        return new Animation(frames);
    }
    
    public resetAnimation() {
        this.currentTime = 0;
        this._animationEnded = false;
        this.previousTime = undefined;
        // this.previousTime = Date.now();
    }

    public animationEnded(): boolean {
        return this._animationEnded;
    }

    public animate(): Position {
        if (!this.previousTime) {
            this.previousTime = Date.now();
        }

        // this way of calculating delta is also very scary.
        // what if we lost connection with the raspberry? then after after reconnecting
        //  we would "jump" really far between positions, as delta is really big
        // one possible way of preventhing this is to start then setting previousTime
        // to Date.now() continuously until connection is re-established
        //  (or once before we start sending shit back to the raspberry)
        let delta: number = Date.now() - this.previousTime!;

        // a loose(shit) safety measure to keep Bon-Bon from "jumping" between frames.
        delta = constrain(delta, 0, 100);  

        this.currentTime! += delta;
        if (this.runTime <= this.currentTime!) {
            this._animationEnded = true;
        }

        const position = this.getPosition(this.currentTime!);

        this.previousTime = Date.now();

        return position;
    }

    public getPosition(time: number) {
        let currentFrame: Frame | null = null;
        let lastFrame: Frame | null = null;
        
        for (let frame of this.frames) 
        {
            if (frame.duration > time - frame.startTime && time - frame.startTime >= 0) {
                currentFrame = frame;
                if (!lastFrame) {
                    lastFrame = currentFrame;
                }

                break;
            }

            lastFrame = frame;
        }
        
        // If we don't find the "current frame", then we're at the last point.
        // Because how interpolating works between frames, this WILL give the
        // final position of the animation afterwards. (still pretty weird)
        if (!currentFrame) {
            currentFrame = lastFrame;
        }
        
        // How far we're into the currentFrame
        const timeSinceStart = time - currentFrame!.startTime;
        // Interpolates between the two frames and gets the position.
        const position = Frame.interpolate(lastFrame!, currentFrame!, timeSinceStart)!;

        return position;
    }
}

