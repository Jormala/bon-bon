import fs from 'fs';

class Options {
    public readonly OPTIONS_PATH = "res/options.json";
    private options: any;
    private saved: boolean = true;

    public constructor() {
        this.load();
    }

    public load() {
        const rawOptions = fs.readFileSync(this.OPTIONS_PATH, 'utf8');

        this.options = JSON.parse(rawOptions);
    }

    public set(option: string, value: any): any {
        this.saved = false;  // Something changed: Better remember to save
        this.options[option] = value;
    }
    
    public get(option: string): any {
        if (!Object.keys(this.options).includes(option)) {
            throw Error(`The option '${option}' doesn't exist!`);
        }

        return this.options[option];
    }

    public save() {
        if (this.saved) {
            // No need to save
            return;
        }

        console.log("OPTIONS: Saving...");

        fs.writeFileSync(this.OPTIONS_PATH, JSON.stringify(this.options, null, 4));
        this.saved = true;

        console.log("OPTIONS: Saved!");
    }
}

export const OPTIONS = new Options();


// When the program exits, save the current JSON
process.on('exit', () => OPTIONS.save());
process.on('SIGINT', () => process.exit());
// process.on('SIGQUIT', () => process.exit());  // Probably isn't needed: https://stackoverflow.com/a/71543784
