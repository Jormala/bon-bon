// Handles image recognition

const cocoSsd = require('@tensorflow-models/coco-ssd');
const tf = require('@tensorflow/tfjs-node');

// TensorFlow gives out stupid information. We try to seperate 
//  it from the rest of the input here
console.log("\n");


let model;

async function loadModel() {
  console.log("RECOGNITION: Loading model...")
  model = await cocoSsd.load();  // Load the model only once
  console.log("RECOGNITION: Finished loading!")
}

async function runImageRecognition(base64Image, minScore) {
    if (!model) {
        // Load the model if it hasn't been loaded before. This saves a LOT of time
        await loadModel(); 
    }

    // The complicated magic
    const imageBuffer = Buffer.from(base64Image, 'base64');
    const imageTensor = tf.node.decodeImage(imageBuffer);
    const predictions = await model.detect(imageTensor, undefined, minScore);

    return predictions;
}

module.exports.runImageRecognition = runImageRecognition;