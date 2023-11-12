import { OPTIONS } from "./options";


// TODO: Name and implement these
// don't change the order of this enum. it contains the format in which the data is send to the raspberry
// /\/\/\ autistic /\/\/\
export enum Servo {
    Head1 = 'head1',
    Torso2 = 'torso2',
    Eye3 = 'eye3'
}

/**
 * Represents a value that can be sent to a servo.
 */
type ServoValue = number | null;  // "null" means "do nothing" or "keep the last value"

// this type is actually cursed
// you'd think it would mean an object like:
//  { Servo.Head1: ServoValue, Servo.Torso2: ServoValue, ... }
// BUT for some fucking reason it means the VALUES:
//  { 'head1': ServoValue, 'torso2': ServoValue, ... }
// this makes sense now, but WHYY would you make the values be keys of the enum??? especially
//  if i give the type `{ [key in Servo]: ServoValue }` then wouldn't you think that 
//  it means the KEYS from `Servo` are, you know, KEYS?
// like motherfucker what do you think [key in Servo] means? THE VALUE :DDDD
type Servos =  { [key in Servo]: ServoValue };

/**
 * Servos that are required for head movement.
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

/**
 * Represents a position Bon-Bon can make
 */
export class Position {
    private readonly servos: Servos;
    private readonly raw_servos: Servos;

    public constructor(servos: Servos) {
        this.raw_servos = servos;
        this.servos = structuredClone(servos);  // holy hell

        const keys: Servo[] = Object.keys(this.servos) as Servo[];
        for (const servo of Object.values(Servo)) 
        {
            // All servos MUST be specified for each position
            if (!keys.includes(servo)) {
                throw Error(`Servo "${servo}" wasn't specified`);
            }

            let value: ServoValue = this.servos[servo];
            this.servos[servo] = realServoValue(value, servo);
        }
    }

    public static fromJSON(servosJSON: any): Position {
        const servos: Servos = {} as any;  // `any` -moment

        for (const servo of Object.values(Servo)) 
        {
            // Automatically specifies the unspecified servos as null
            servos[servo] = servosJSON[servo] ?? null;
        }

        return new Position(servosJSON);
    }

    public allServosSpecified(): boolean {
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

    public setServo(servo: Servo, value: ServoValue) {
        this.raw_servos[servo] = value;
        this.servos[servo] = realServoValue(value, servo);
    }

    public static interpolate(pos1: Position, pos2: Position, p: number): Position | null {
        p = constrain(p, 0, 1);  // i'm scared

        const returnServos: any = {};
        for (let servo of Object.values(Servo)) 
        {
            const servo1 = pos1.servos[servo];
            const servo2 = pos2.servos[servo];

            if (servo1 === null || servo2 === null) {
                throw Error("Cannot interpolate between 'null' values!");
            }

            // this one line powers basically everything about animating
            let interpolatedValue: number = Math.round((servo1*(1-p) + servo2*p) * 100) / 100;

            returnServos[servo] = interpolatedValue;
        }

        return new Position(returnServos);
    }

    public toString(): string {
        const array: (ServoValue)[] = [];
        for (const servo of Object.values(Servo)) 
        {
            array.push(this.servos[servo]);
        }

        return JSON.stringify(array);
    }

    public toStringRaw(): string {
        const array: (ServoValue)[] = [];
        for (const servo of Object.values(Servo)) 
        {
            array.push(this.raw_servos[servo]);
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
            const fillValue = position.servos[servo];  // ??? why can I access a PRIVATE method here??

            if (originalValue === null && fillValue !== null) {
                this.servos[servo] = fillValue;

                this.raw_servos[servo] = position.raw_servos[servo];  // same here whaat
            }
        }
    }
}

// Maybe integrate this class into the "Animation" -class
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

        if (!this.position.allServosSpecified()) {
            throw Error("Some servos have null values!");
        }

        this.startTime = startTime;
        this.still = still;
        this.speed = speed;

        // How long each frame takes to execute
        this.duration = this.still + this.speed;
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
        for (const frame of this.frames) {
            this.runTime += frame.duration;
        }

        this.resetAnimation();
    }

    public static fromJSON(framesJSON: any[]): Animation {
        const frames = [];

        const useFilling = OPTIONS.get('USE_FILLING') as boolean;

        let nextStartTime = 0;
        let lastPosition: Position | null = null;
        for (let rawFrame of framesJSON)
        {
            const position = Position.fromJSON(rawFrame.position);
            if (useFilling && lastPosition) {
                position.fillWith(lastPosition);
            }

            const frame = new Frame(
                position,
                nextStartTime,
                rawFrame.still,
                rawFrame.speed
            );
            frames.push(frame);

            lastPosition = position;
            nextStartTime += frame.duration;
        }

        return new Animation(frames);
    }
    
    public resetAnimation() {
        this.currentTime = 0;
        this._animationEnded = false;
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

