import { Ollama } from "@langchain/community/llms/ollama";
import * as fs from "node:fs/promises";
import { RawImage } from '@xenova/transformers';
import { AutoProcessor, CLIPVisionModelWithProjection } from '@xenova/transformers';
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { Surreal, RecordId, Table } from "surrealdb.js";

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

  async generateImageEmbeddings(image) {
    try {
     
      const image_array = [await RawImage.read(image)];
      const image_inputs = await this.processor(image_array);
      // Compute vision embeddings
      const { image_embeds:{ort_tensor: {cpuData} } } = await this.visionModel(image_inputs);
      console.log(cpuData)
     return {imageEmbeddingsResult:cpuData};
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

  async processImagesInParallel( images) {
    try {
      const results = await Promise.all(
        images.map(async ( image ) => {
          const {imageEmbeddingsResult} = await this.generateImageEmbeddings(image);
          return imageEmbeddingsResult;
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

    const imagesWithPrompts = [
      { imagePath: "/Users/pratimbhosale/Desktop/Screenshot 2024-05-07 at 23.34.45.png", prompt: "What's happening in this image?" },
      { imagePath: "/Users/pratimbhosale/Desktop/Screenshot 2024-05-07 at 23.34.45.png", prompt: "Describe this image" }
    ];
    const urls = ollamaService.extractUrls(imagesWithPrompts);
    console.log(urls[0])
    
    // Compute vision embeddings
    const imageEmbeddingsResults = await ollamaService.processImagesInParallel(urls);
    console.log(imageEmbeddingsResults);
      
    // Connect to SurrealDB using the JavaScript SDK
    const db = new Surreal();

    // Connect to the database
    await db.connect("http://127.0.0.1:8000/rpc");

    // Select a specific namespace / database
    await db.use({ 
      namespace: "test", 
      database: "test" 
    });

    // Signin as a namespace, database, or root user
    await db.signin({
      username: "root",
      password: "root",
    });

    // Insert embeddings into SurrealDB
    const embeddingRecord = {
      id: 'image_embedding_1',
      embedding: Array.from(imageEmbeddingsResults[0]) // Convert Float32Array to regular array
    };
    const response = await db.create('embedding_table', embeddingRecord);
    console.log("done")
    const records = await db.select("embedding_table");
    console.log('All records in embedding_table:', records); 
  } catch (error) {
    console.error(error);
  }
}

main();

