const cocoSsd = require('@tensorflow-models/coco-ssd');
const tf = require('@tensorflow/tfjs-node');
// TensorFlow gives out stupid information. We try to separate 
//  it from the rest of the input here
console.log("\n");

import { OPTIONS } from "./options";


export class Recognition {
    private model: any;
    private minScore: number;

    public constructor() {
        this.minScore = OPTIONS.get('MIN_SCORE');
    }

    public async runImageRecognition(base64Image: string): Promise<any[]> {
        if (!this.model) {
            // Load the model if it hasn't been loaded before. This saves a LOT of time
            await this.loadModel();
        }

        // The complicated magic
        const imageBuffer = Buffer.from(base64Image, 'base64');
        const imageTensor = tf.node.decodeImage(imageBuffer);

        const predictions = await this.model.detect(imageTensor, undefined, this.minScore);

        return predictions;
    }

    public async getFirstPersonBoundingBox(base64image: string): Promise<number[]> {
        const predictions = await this.runImageRecognition(base64image);

        console.log(`RECOGNITION: Objects: [ ${predictions.map((prediction: any) => `"${prediction.class}"`).join(', ')} ]`);

        // "any" 🤮🤮🤮
        const firstPerson: any = predictions.filter((prediction: any) => prediction.class == "person")
            .sort((prediction: any) => prediction.score)[0];
        if (!firstPerson) {
            console.log("RECOGNITION: No people in view");
            return [];
        }

        const bbox: number[] = firstPerson.bbox;

        console.log(`RECOGNITION: First person Bounding Box: [ ${bbox.map((coord => `"${Math.round(coord * 100) / 100}"`)).join(', ')}) ]`);

        return bbox;
    }

    private async loadModel() {
        console.log("RECOGNITION: Loading model...")

        // Load the model only once
        this.model = await cocoSsd.load();

        console.log("RECOGNITION: Finished loading!")
    }
}
