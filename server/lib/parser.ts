import { Raspberry } from './raspberry';

/**
 * - Handles how animations are handeled
 */
export class Parser {
    private raspberry: Raspberry;

    // Dependency injection babyyy
    public constructor(raspberry: Raspberry)  {
        this.raspberry = raspberry;
    }
}