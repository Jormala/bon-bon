import { OPTIONS } from "./options";


export enum Servo {
    LShoulderX = 'l-shoulder-x',
    LShoulderY = 'l-shoulder-y',
    LElbow     = 'l-elbow',
    lHandX     = 'l-hand-x',
    LHandY     = 'l-hand-y',
    RShoulderX = 'r-shoulder-x',
    RShoulderY = 'r-shoulder-y',
    RElbow     = 'r-elbow',
    RHandX     = 'r-hand-x',
    RHandY     = 'r-hand-y',
    EyeX       = 'eye-x',
    EyeY       = 'eye-y',
    NeckX      = 'neck-x',
    NeckY      = 'neck-y',
    Jaw        = 'jaw'
}

/**
 * Represents a value that can be sent to a servo.
 */
type ServoValue = number | null;  // "null" means "do nothing" or "keep the last value"

export type Servos =  Partial<{ [key in Servo]: ServoValue }>;

/**
 * Servos that are required for head movement.
 */
export const HEAD_SERVOS: Set<Servo> = new Set<Servo>([ Servo.EyeX, Servo.EyeY, Servo.NeckY ]);


function map(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}
function mapFrom100(value: number, outMin: number, outMax: number) {
    return map(value, 0, 100, outMin, outMax);
}
function constrain(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}


function realServoValue(value: ServoValue, servo: Servo) {
    if (value === null) {
        return value;
    }

    const MAPS = OPTIONS.get("SERVO_MAPS");
    const map = MAPS[servo];

    if (!map) {
        throw `Map for "${servo}" wasn't specified in Options!`
    }

    // i'm scared
    value = constrain(value, 0, 100);
    const min = constrain(map.min, 0, 100);
    const max = constrain(map.max, 0, 100);

    return mapFrom100(value, min, max);
}

function unmapServoValue(mappedValue: ServoValue, servo: Servo) {
    if (mappedValue == null) {
        return mappedValue;
    }

    const map = OPTIONS.get("SERVO_MAPS")[servo];
    const min = map.min;
    const max = map.max;

    return map(mappedValue, min, max, 0, 100);

}

/**
 * Represents a position Bon-Bon can make
 */
export class Position {
    private readonly servos: Servos;

    public constructor(servos: Servos, mapped = false) {
        this.servos = servos;

        for (const servo of Object.values(Servo)) 
        {
            // If the value is undefined, we override it as null
            let value: ServoValue = this.servos[servo] ?? null;
            this.servos[servo] = value;

            if (mapped) {
                continue;
            }

            this.servos[servo] = realServoValue(value, servo);
        }
    }

    public servosSpecified(servos?: Set<Servo>): boolean {
        servos = servos ?? new Set<Servo>(Object.values(Servo));

        for (const servo of servos)
        {
            // explict check incase the value is 0
            if (this.servos[servo] === null) {
                return false;
            }
        }

        return true;
    }

    public getServo(servo: Servo): ServoValue {
        return this.servos[servo]!;
    }

    public setServo(servo: Servo, value: ServoValue, mapped: boolean = false) {
        if (!mapped) {
            value = realServoValue(value, servo);
        }

        this.servos[servo] = value;
    }
    
    /**
     * Gets all the servos that are specified *(have non-null values)*.
     * @returns 
     */
    public getSpecifiedServos(): Set<Servo> {
        // We get these dynamically, as servos can be specified after construction
        const servos: Set<Servo> = new Set<Servo>();

        for (const servo of Object.values(Servo)) 
        {
            if (this.servos[servo]) {
                servos.add(servo)
            }
        }

        return servos;
    }
    

    public static interpolate(pos1: Position, pos2: Position, p: number): Position | null {
        p = constrain(p, 0, 1);  // i'm scared

        const returnServos: any = {};
        for (const servo of Object.values(Servo)) 
        {
            // it's crucial that we interpolate using the raw_servos, as when we construct the new 
            //  interpolated position, we'll have to map the new values to the defined ranges
            const servo1 = pos1.servos[servo];
            const servo2 = pos2.servos[servo];

            if (servo1 == null || servo2 == null) {
                returnServos[servo] = null;
                continue;
            }

            // this one line powers basically everything about animating
            let interpolatedValue: number = Math.round((servo1*(1-p) + servo2*p) * 100) / 100;

            returnServos[servo] = interpolatedValue;
        }

        return new Position(returnServos, true);
    }

    /**
     * Constructs a position where all values are `null`. Use with caution.
     * 
     * @returns A @see {@link Position} with all servos set to `null`
     */
    public static nullPosition(): Position {
        const servos: Servos = {} as Servos;

        // there has to be a beautiful one liner for this :p
        for (const servo of Object.values(Servo)) {
            servos[servo] = null;
        }

        return new Position(servos, true);  // no need to map null values
    }

    public toString(): string {
        const array: ServoValue[] = [];
        for (const servo of Object.values(Servo)) 
        {
            array.push(this.servos[servo]!);
        }

        return JSON.stringify(array);
    }

    public toStringRaw(): string {
        const array: ServoValue[] = [];
        for (const servo of Object.values(Servo)) 
        {
            array.push(unmapServoValue(this.servos[servo]!, servo));
        }

        return JSON.stringify(array);       
    }

    /**
     * Check if a position equals this position
     * @param position The position to compare against
     * @returns Whether the positions equal each other
     */
    public equals(position: Position): boolean {
        for (const servo of Object.values(Servo)) 
        {
            if (this.servos[servo] !== position.servos[servo]) {
                return false;
            }
        }

        return true;
    }

    /**
     * Fill any null values with the specified `position`
     * @param position Position to fill the null values with
     */
    public fillWith(position: Position) {
        for (const servo of Object.values(Servo)) 
        {
            const originalValue = this.servos[servo];
            const fillValue = position.servos[servo];  // ??? why can I access a PRIVATE property here??

            if (originalValue === null && fillValue !== null) {
                this.servos[servo] = fillValue;
            }
        }
    }

    public filter(servos: Set<Servo>) {
        // This is the same way how the `.filter` works in arrays (kinda)
        const nullServos = Object.values(Servo).filter(servo => !servos.has(servo));

        for (const servo of nullServos)
        {
            this.servos[servo] = null;
        }
    }
}

/**
 * Represents a frame of movement.
 */
export class Frame {
    public still: number;
    public speed: number;
    public position: Position;


    public constructor(position: Position, still: number, speed: number) {
        this.position = position;

        if (!this.position.servosSpecified()) {
            throw Error("Some servos have null values!");
        }

        this.still = still;
        this.speed = speed;
    }

    public get duration(): number {
        return this.still + this.speed;
    }

    public static fromJSON(framesJSON: any[]): Frame[] {
        const frames = [];

        let lastPosition: Position | null = null;
        for (let rawFrame of framesJSON)
        {
            const position = new Position(rawFrame.position);
            if (lastPosition) {
                position.fillWith(lastPosition);
            }

            const frame = new Frame(
                position,
                rawFrame.still,
                rawFrame.speed
            );
            frames.push(frame);

            lastPosition = position;
        }

        return frames;
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


// God I fucking suck at naming things
interface AnimationFrame { frame: Frame, startTime: number };

export class Animation {
    public readonly specifiedServos: Set<Servo>;
    public readonly runTime: number;

    private readonly frames: AnimationFrame[];

    private callbacks: (() => void)[] = [];

    // Used when animating
    private currentTime?: number;
    private previousTime?: number;
    private _animationEnded = true;

    public constructor(frames: Frame[], specifiedServos: Set<Servo> | null = null) {
        if (specifiedServos && frames.length > 0) {
            // Gets the first frame's specified servos by default
            specifiedServos = new Set<Servo>(frames[0].position.getSpecifiedServos());
        }

        this.frames = [];
        this.runTime = 0;
        for (const frame of frames) 
        {
            frame.position.filter(specifiedServos!);

            this.frames.push({
                frame: frame,
                startTime: this.runTime
            });

            this.runTime += frame.duration;
        }

        this.specifiedServos = specifiedServos ?? new Set<Servo>();

        this.resetAnimation();
    }

    // stupid stupid. CREATE A WRAPPER CLASS FOR THESE IN ANIMATOR
    public addCallback(callback: (() => void)) {
        this.callbacks.push(callback);
    }

    public triggerCallbacks() {
        this.callbacks.forEach(callback => callback());
        // this.callbacks = [];
    }

    public resetAnimation() {
        this.currentTime = 0;
        this._animationEnded = false;

        // this ensures that the animation doesn't start playing until `animate` is called for the first time
        this.previousTime = undefined;  
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
        // /\/\ old comment. Currently I'm not even sure this can happen... and even if it can
        //  the shit method below actually does it's job pretty well. 
        let delta: number = Date.now() - this.previousTime!;

        // a loose(shit) safety measure to keep Bon-Bon from "jumping" between frames.
        delta = constrain(delta, 0, 100);  

        this.currentTime! += delta;
        if (this.runTime <= this.currentTime!) {
            // A cool idea would be to launch a callback here, so we don't have to check
            //  whether the has been ended manually.
            // But I don't want to implement it this deep into the project. Would mean a lot of
            //  refactoring.
            this._animationEnded = true;
        }

        const position = this.getPosition(this.currentTime!);

        this.previousTime = Date.now();

        return position;
    }

    public getPosition(time: number) {
        let currentFrame: AnimationFrame | null = null;
        let lastFrame: AnimationFrame | null = null;
        
        for (let animationFrame of this.frames) 
        {
            if (animationFrame.frame.duration > time - animationFrame.startTime && time - animationFrame.startTime >= 0) {
                currentFrame = animationFrame;
                if (!lastFrame) {
                    lastFrame = currentFrame;
                }

                break;
            }

            lastFrame = animationFrame;
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
        const position = Frame.interpolate(lastFrame!.frame, currentFrame!.frame, timeSinceStart)!;

        return position;
    }
}
