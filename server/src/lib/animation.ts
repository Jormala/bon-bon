import { Controller } from './controller';
import fs from 'fs';

/**
 * What part of the body we're talking about
 */

// TODO: Name and implement these
// don't change the order of this enum. it contains the format in which the data is send to the raspberry
enum Servo {
    Head1 = 'head1',
    Torso2 = 'torso2',
    Eye3 = 'eye3'
}


function map(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

function mapFrom100(value: number, outMin: number, outMax: number) {
    return map(value, 0, 100, outMin, outMax);
}

function realServoValue(servo: Servo, value: number) {
    // Only use `mapFrom100` method here

    // TODO: Implement the 
    switch (servo) 
    {
        // case Servo.Head1:
        // case Servo.Torso2:
        //     return mapFrom100(value, 0, 100);

        default:  // No mapping needed
            return value;
    }
}

class Frame {
    private rawJSON: any;

    public still: number;
    public speed: number;
    public servos: { [key in Servo]: number };

    public constructor(json: any) {
        this.rawJSON = json;

        this.still = json.still;
        this.speed = json.speed;

        this.servos = {} as any;  // VERY cursed
        Object.entries(this.rawJSON).forEach(([rawServo, value]) => 
        {
            // ugly casts. i hope this will throw an error if unable to do this
            const servo = rawServo as Servo;

            this.servos[servo] = realServoValue(servo, value as number);
        });
    }

    public interpolate(previousFrame: Frame, timeSinceStart: number): Frame {
        // TODO

        return null as any;
    }
}

export class Animation {
    private frames: Frame[];
    private rawJSON: any;

    private currentTime?: number;
    private previousTime?: number;

    public constructor(json: any) {
        this.rawJSON = json;
        this.frames = [];

        for (let frame of this.rawJSON.frames) {
            this.frames.push( new Frame(frame) );
        }

        this.resetAnimation();
    }
    
    public resetAnimation() {
        this.currentTime = 0;
        this.previousTime = undefined;
        // this.previousTime = Date.now();
    }

    public getServos(): {[key in Servo]: number} {
        if (!this.previousTime) {
            this.previousTime = Date.now();
        }

        // Here's a funny thought: What if `delta` was a constant?
        const delta: number = Date.now() - this.previousTime!;
        this.currentTime! += delta;

        // TODO

        // get frame1  (previous frame)
        // get frame2  (current frame)
        // interpolate between them

        this.previousTime = Date.now();

        return "hasitapaska" as any;
    }
}


let loadedAnimations: any;
const ANIMATIONS_PATH: string = "res/animations.json";

export function loadAnimation(animationName: string): Animation | null {
    if (!loadedAnimations) {
        const data: string = fs.readFileSync(ANIMATIONS_PATH, 'utf8');
        loadedAnimations = JSON.parse(data);
    }

    for (let animation of loadedAnimations) {
        if (animation.name === animationName) {
            return new Animation(animation);
        }
    }

    return null;
}
