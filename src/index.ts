import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { Ollama } from "@langchain/community/llms/ollama";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { StringOutputParser } from "@langchain/core/output_parsers";
import {
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
  ChatPromptTemplate,
} from "@langchain/core/prompts";
import {
  RunnableSequence,
  RunnablePassthrough,
} from "@langchain/core/runnables";
import { formatDocumentsAsString } from "langchain/util/document";
import { Surreal, Table } from "surrealdb.js";
import { SurrealVectorStore } from "./vector_store";
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  routeUploadDocuments,
  routeListDocuments,
  routeAskQuestion,
} from "./types";
import { SYSTEM_TEMPLATE, VISION_PROMPT } from "./prompts";
import { getMetadataString } from "./utils";
import { Buffer } from "buffer";

/**
 * We instantiate a vector store. This is where we store the embeddings of the documents.
 * We also need to provide an embeddings object. This is used to embed the documents.
 */
const embeddings = new OllamaEmbeddings({
  model: "nomic-embed-text", // default value
  baseUrl: "http://localhost:11434", // default value
});

const visionModel = new Ollama({
  baseUrl: "http://localhost:11434", // Default value
  model: "moondream", // Default value
});
const surreal = new Surreal();

console.log("Embeddings initialized");

const chatModel = new ChatOllama({
  baseUrl: "http://localhost:11434", // Default value
  model: "phi3:mini", // Default value
});

console.log("LLM initialized");

const app = new OpenAPIHono();

const vectorStore = new SurrealVectorStore(embeddings, {
  client: surreal,
  tableName: "photos",
  surrealEndpoint: "http://127.0.0.1:8000/rpc",
  namespace: "test",
  database: "test",
  username: "root",
  password: "root",
});

console.log("Creating vector store...");

// Function to convert ArrayBuffer to Base64 string
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  return Buffer.from(buffer).toString("base64");
};

interface PhotoDoc {
  pageContent: string;
  metadata: Omit<PhotoDocMetadata, "base64">;
}

interface PhotoDocMetadata {
  filename: string;
  lastModified: number;
  name: string;
  type: string;
  size: number;
  base64: string;
}

// Function to process files and return base64 strings
const processFiles = async (files: File[]): Promise<PhotoDocMetadata[]> => {
  const promises = files.map(async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    return {
      filename: file.name,
      base64: base64,
      lastModified: file.lastModified,
      name: file.name,
      type: file.type,
      size: file.size,
    };
  });
  return Promise.all(promises);
};
app.openapi(routeUploadDocuments, async (c) => {
  const formData = await c.req.formData();
  const values = formData.values();

  const files: File[] = Array.from(values).filter(
    (item): item is File => item instanceof File,
  );
  console.log(files);
  const base64encodedImages = await processFiles(files);

  const results: PhotoDoc[] = await Promise.all(
    base64encodedImages.map(
      async ({ filename, lastModified, name, type, size, base64 }) => {
        const description = await visionModel
          .bind({
            images: [base64],
          })
          .invoke(VISION_PROMPT);
        return {
          pageContent: description,
          metadata: {
            filename: filename,

            lastModified: lastModified,
            name: name,
            type: type,
            size: size,
            description: description,
          },
        };
      },
    ),
  );

  await vectorStore.init();
  await vectorStore.addDocuments(results);

  console.log("Vector store initialized");

  return c.json({
    count: results.length,
  });
});

//curl "http://localhost:8787/documents"
app.openapi(routeListDocuments, async (c) => {
  const documents = await vectorStore.db.query(
    "SELECT content, filename, lastModified, name, type, size FROM photos",
    {
      tb: new Table("photos"),
    },
  );

  return c.json(documents);
});

// curl -X POST "http://localhost:8787/documents/ask" -H "Content-Type: application/json" -d '{"question":"What places did this person visit?"}'
app.openapi(routeAskQuestion, async (c) => {
  const { question } = c.req.valid("json");
  /**
   * Now we can query the vector store.
   * We can ask questions like "Which movies are less than 90 minutes?" or "Which movies are rated higher than 8.5?".
   * We can also ask questions like "Which movies are either comedy or drama and are less than 90 minutes?".
   * The retriever will automatically convert these questions into queries that can be used to retrieve documents.
   */
  // Initialize a retriever wrapper around the vector store
  // Create a system & human prompt for the chat model
  // Prompt
  // Create a system & human prompt for the chat model
  //

  const vectorStoreRetriever = vectorStore.asRetriever();
  const messages = [
    SystemMessagePromptTemplate.fromTemplate(SYSTEM_TEMPLATE),
    HumanMessagePromptTemplate.fromTemplate("{question}"),
  ];
  const prompt = ChatPromptTemplate.fromMessages(messages);
  const chain = RunnableSequence.from([
    {
      filtered_context: vectorStoreRetriever.pipe(formatDocumentsAsString),
      metadata: vectorStoreRetriever.pipe(getMetadataString),
      question: new RunnablePassthrough(),
    },
    prompt,
    chatModel,
    new StringOutputParser(),
  ]);

  const answer = await chain.invoke(question);
  return c.json({
    answer,
  });
});

export default app;
