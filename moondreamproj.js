import { Ollama } from "@langchain/community/llms/ollama";
import * as fs from "node:fs/promises";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";

const imageData = await fs.readFile("/Users/pratimbhosale/Desktop/Screenshot 2024-05-07 at 23.34.45.png");
const model = new Ollama({
  model: "moondream",
  baseUrl: "http://127.0.0.1:11434",
}).bind({
  images: [imageData.toString("base64")],
});
const res = await model.invoke("What's in this image?");
console.log({ res });

const embeddings = new OllamaEmbeddings({
  model: "nomic-embed-text", // default value
  baseUrl: "http://localhost:11434", // default value
});

const documentEmbeddings = await embeddings.embedDocuments([res]);
console.log(documentEmbeddings);

/*
{
  res: '\n' +
    'The image features two medieval-style knights standing side by side against a black background. The knight on the left is wearing an orange suit, while his companion on the right has a blue suit. Both knights are adorned with crowns and are positioned in front of each other, creating a striking visual contrast.'
}
*/