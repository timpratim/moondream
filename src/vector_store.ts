import { Document } from "@langchain/core/documents";
import { Surreal } from "surrealdb.js";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { VectorStore } from "@langchain/core/vectorstores";

/**
 * Interface for the arguments required to initialize a Surrealdb library.
 */
export interface SurrealVectorArgs {
  client: Surreal;
  tableName?: string;
  filter?: any;
  metadataColumns?: Set<string>;
  surrealEndpoint: string;
  username: string;
  password: string;
  namespace?: string;
  database?: string;
  scope?: string;
}

export class SurrealVectorStore extends VectorStore {
  client: Surreal;

  tableName: string;

  filter?: any;
  metadataColumns?: Set<string>;
  db: Surreal;
  surrealEndpoint: string;
  username: string;
  password: string;
  namespace?: string;
  database?: string;
  scope?: string;

  _vectorstoreType(): string {
    return "surreal";
  }

  constructor(embeddings: EmbeddingsInterface, args: SurrealVectorArgs) {
    super(embeddings, args);

    this.client = args.client;
    this.tableName = args.tableName || "documents";
    this.filter = args.filter;
    this.metadataColumns = args.metadataColumns || new Set();
    this.db = new Surreal();
    this.surrealEndpoint = args.surrealEndpoint;
    this.namespace = args.namespace;
    this.database = args.database;

    this.username = args.username;
    this.password = args.password;
  }

  public async init(): Promise<void> {
    // Authenticate with a root user
    await this.db.connect(this.surrealEndpoint);

    // Select a specific namespace / database
    await this.db.use({
      namespace: this.namespace,
      database: this.database,
    });

    // Signin as a namespace, database, or root user
    await this.db.signin({
      username: this.username,
      password: this.password,
    });

    await this.createIndex();
  }

  async createIndex(): Promise<void> {
    const indexName = `idx_${this.tableName}_vector`;
    try {
      await this.db.query(`
        DEFINE INDEX ${indexName} ON ${this.tableName} FIELDS vector MTREE DIMENSION 768 DIST COSINE TYPE F32;
      `);
    } catch (e) {
      console.error("Failed to create vector index:", e);
    }
  }

  //serialize metadata private function
  private serializeMetadata(metadata: Record<string, any>): string {
    return Object.entries(metadata)
      .map(([key, value]) => `${key}: ${value}`) // Convert each key-value pair into a string
      .join(", "); // Join all entries with a comma
  }

  async addDocuments(
    documents: Document[],
    options?: { ids?: string[] | number[] },
  ) {
    // embed pageContent and metadata together
    const texts = documents.map(
      ({ pageContent, metadata }) =>
        `${pageContent} ${this.serializeMetadata(metadata)}`,
    );
    console.log("embedding texts");
    console.log(texts);
    return this.addVectors(
      await this.embeddings.embedDocuments(texts),
      documents,
      options,
    );
  }

  //a helper function that loops through documents metadata and store them in the metadataColumns
  async addMetadataColumns(documents: Document[]) {
    documents.forEach((doc) => {
      Object.keys(doc.metadata).forEach((key) => {
        this.metadataColumns?.add(key);
      });
    });
  }

  //takes a result from the database and reconstructs the metadata
  private reconstructMetadata(result: SurrealdbResult): any {
    // Filtering out non-metadata fields to reconstruct the metadata object.
    const metadata: any = {};
    Object.keys(result).forEach((key) => {
      if (!["id", "content", "score"].includes(key)) {
        metadata[key] = result[key];
      }
    });
    return metadata;
  }

  async addVectors(
    vectors: number[][],
    documents: Document[],
    options?: { ids?: string[] | number[] },
  ) {
    const ids = options?.ids || documents.map((doc) => doc.metadata?.id);
    await this.addMetadataColumns(documents);
    console.log("metadata columns");
    console.log(this.metadataColumns);

    const records = documents.map((doc, index) => ({
      id: ids[index],
      content: doc.pageContent,
      vector: vectors[index],
      ...doc.metadata,
    }));

    const result = await this.db.insert(this.tableName, records);
    console.log(result);
  }

  static async fromTexts(
    texts: string[],
    metadatas: object[] | object,
    embeddings: EmbeddingsInterface,
    dbConfig: SurrealVectorArgs,
  ): Promise<SurrealVectorStore> {
    const docs: Document[] = [];
    for (let i = 0; i < texts.length; i += 1) {
      const metadata = Array.isArray(metadatas) ? metadatas[i] : metadatas;
      const newDoc = new Document({
        pageContent: texts[i],
        metadata,
      });
      docs.push(newDoc);
    }
    return this.fromDocuments(docs, embeddings, dbConfig);
  }

  static async fromDocuments(
    docs: Document[],
    embeddings: EmbeddingsInterface,
    dbConfig: SurrealVectorArgs,
  ): Promise<SurrealVectorStore> {
    const instance = new this(embeddings, dbConfig);
    await instance.init();
    await instance.addDocuments(docs);
    return instance;
  }

  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: this["FilterType"] | undefined,
  ): Promise<[Document, number][]> {
    const metadataColumns = Array.from(this.metadataColumns!).join(", ");
    console.log(metadataColumns);

    this.db.let("query_embedding", query);
    let q = `SELECT id, content, ${metadataColumns}, vector::similarity::cosine(vector, $query_embedding) AS score FROM type::table($tb) WHERE vector <|2|> $query_embedding`;
    console.log(q);
    const rawResults = await this.db.query<SurrealdbResult[][]>(q, {
      tb: this.tableName,
    });
    console.log("raw results");
    const results: [Document, number][] = [];
    for (const result of rawResults[0]) {
      console.log("result");
      console.log(result);
      results.push([
        new Document({
          pageContent: result.content,
          metadata: this.reconstructMetadata(result),
        }),
        result.score,
      ]);
    }
    return results;
  }
}

interface SurrealdbResult {
  id: string;
  content: string;
  score: number;
  [key: string]: any;
}
