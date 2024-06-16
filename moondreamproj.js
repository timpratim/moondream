import { Ollama } from "@langchain/community/llms/ollama";
import * as fs from "node:fs/promises";
import { RawImage } from '@xenova/transformers';
import { AutoProcessor, CLIPVisionModelWithProjection } from '@xenova/transformers';
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";

class OllamaService {
  constructor(baseURL) {
    this.baseURL = baseURL;
    this.models = {};
    this.embeddings = {};
    this.processor = null;
    this.visionModel = null;
    this.processorModel = null;
    this.visionModelName = null;
  }

  async initializeModel(modelName, options = {}) {
    if (!this.models[modelName]) {
      this.models[modelName] = new Ollama({
        model: modelName,
        baseUrl: this.baseURL,
        ...options,
      });
    }
  }

  async initializeImageEmbeddingsInstance() {
   
      this.processorModel = 'Xenova/clip-vit-base-patch32';
      this.processor = await AutoProcessor.from_pretrained(this.processorModel);
      this.visionModelName = 'jinaai/jina-clip-v1';
      this.visionModel = await CLIPVisionModelWithProjection.from_pretrained(this.visionModelName);

  }

  async initializeTextEmbeddingsInstance(modelName, options = {}) {
    if (!this.embeddings[modelName]) {
      this.embeddings[modelName] = new OllamaEmbeddings({
        model: modelName,
        baseUrl: this.baseURL,
        ...options,
      });
    }
  }

  async processImage(modelName, imagePath, prompt) {
    try {
      const imageData = await fs.readFile(imagePath);
      const model = this.models[modelName];
      if (!model) {
        throw new Error(`Model ${modelName} is not initialized`);
      }
      const result = await model.bind({
        images: [imageData.toString("base64")],
      }).invoke(prompt);
      return result;
    } catch (error) {
      throw new Error(`Error processing image: ${error.message}`);
    }
  }

  async generateImageEmbeddings(images) {
    try {
     
      const image_array = await Promise.all(images.map(image => RawImage.read(image)));
      const image_inputs = await this.processor(image_array);
      // Compute vision embeddings
      const { image_embeds } = await this.visionModel(image_inputs);
     return image_embeds[0].data;
    } catch (error) {
      throw new Error(`Error generating embeddings: ${error.message}`);
    }
  }


  async generateTextEmbeddings(modelName, texts) {
    try {
      const embeddings = this.embeddings[modelName];
      if (!embeddings) {
        throw new Error(`Embeddings model ${modelName} is not initialized`);
      }
      const documentEmbeddings = await embeddings.embedDocuments(texts);
      return documentEmbeddings;
    } catch (error) {
      throw new Error(`Error generating embeddings: ${error.message}`);
    }
  }

  async processImagesInParallel(modelName, imagesWithPrompts) {
    try {
      const results = await Promise.all(
        imagesWithPrompts.map(async ({ imagePath, prompt }) => {
          const result = await this.processImage(modelName, imagePath, prompt);
          return { imagePath, result };
        })
      );
      return results;
    } catch (error) {
      throw new Error(`Error processing images in parallel: ${error.message}`);
    }
  }

  extractResults(resultsArray) {
    return resultsArray.map(({ result }) => result);
  }

  extractUrls(resultsArray) {
    return resultsArray.map(({ imagePath }) => imagePath);
  }
}

// Main function to demonstrate usage
async function main() {
  try {

   
    const ollamaService = new OllamaService("http://127.0.0.1:11434");

    // Initialize the model and embeddings only once
    await ollamaService.initializeModel("moondream");
    await ollamaService.initializeTextEmbeddingsInstance("nomic-embed-text");
    await ollamaService.initializeImageEmbeddingsInstance();

    /* const imagePath = "/Users/pratimbhosale/Desktop/Screenshot 2024-05-07 at 23.34.45.png";
    const prompt = "What's in this image?";
    const imageResult = await ollamaService.processImage("moondream", imagePath, prompt);
    console.log({ imageResult }); */

    /* const embeddingsResult = await ollamaService.generateEmbeddings("nomic-embed-text", imageResult);
    console.log({ embeddingsResult }); */

    // Process multiple images in parallel
    const imagesWithPrompts = [
      { imagePath: "/Users/pratimbhosale/Desktop/Screenshot 2024-05-07 at 23.34.45.png", prompt: "What's happening in this image?" },
      { imagePath: "/Users/pratimbhosale/Desktop/Screenshot 2024-05-07 at 23.34.45.png", prompt: "Describe this image" }
    ];
    const parallelResults = await ollamaService.processImagesInParallel("moondream", imagesWithPrompts);
    console.log({ parallelResults });
    const extractedResults = ollamaService.extractResults(parallelResults);
    const embeddingsResult = await ollamaService.generateTextEmbeddings("nomic-embed-text", extractedResults);
    console.log({ embeddingsResult });

    const urls = ollamaService.extractUrls(imagesWithPrompts);
    // Compute vision embeddings
    const imageEmbeddingsResult = await ollamaService.generateImageEmbeddings(urls);
    console.log(imageEmbeddingsResult);
    
  } catch (error) {
    console.error(error);
  }
}

// Run the main function
main();
