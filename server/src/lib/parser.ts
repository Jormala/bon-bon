import { Raspberry } from './raspberry';
import { Animation } from './animation';

/**
 * - Handles how animations are handeled
 */
export class Parser {
    private raspberry: Raspberry;

    // Dependency injection babyyy
    public constructor(raspberry: Raspberry)  {
        this.raspberry = raspberry;
    }
    
    public parse(animation: Animation) {
        const message = animation.getServos() as any as string;

        this.raspberry.sendServos(message);
    }

    public lookAt(point: [number, number]) {
        // TODO

        // Basically a "look at this point" function
    }
}