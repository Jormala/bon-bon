// Handles image recognition

import { OPTIONS } from "./options";

const cocoSsd = require('@tensorflow-models/coco-ssd');
const tf = require('@tensorflow/tfjs-node');

// TensorFlow gives out stupid information. We try to seperate 
//  it from the rest of the input here
console.log("\n");

export class Recognition {
    private model: any;
    private minScore: number;

    public constructor() {
        this.minScore = OPTIONS.get('MIN_SCORE');
    }

    public async runImageRecognition(base64Image): Promise<any[]> {
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

    private async loadModel() {
        console.log("RECOGNITION: Loading model...")

        // Load the model only once
        this.model = await cocoSsd.load();

        console.log("RECOGNITION: Finished loading!")
    }
}
