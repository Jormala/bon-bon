import fs from 'fs';

console.log(__dirname, __filename)
class Options {
    public readonly OPTIONS_PATH = "res/options.json";
    private options: any;

    public constructor() {
        const rawOptions = fs.readFileSync(this.OPTIONS_PATH, 'utf8');

        this.options = JSON.parse(rawOptions);
    }

    public set(key: string, value: any): any {
        this.options = value;
    }
    
    public get(key: string): any {
        return this.options[key];
    }

    public save() {
        fs.writeFileSync(this.OPTIONS_PATH, JSON.stringify(this.options, null, 4));
    }
}

export const OPTIONS = new Options();

// When the program exits, save the current JSON
process.on('exit', () => OPTIONS.save());
