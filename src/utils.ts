import { Document } from "langchain/document";

export function getMetadataString(documents: Document[]) {
  try {
    //loop through metadata and print
    for (const doc of documents) {
      const metadata = doc.metadata;
      if (!metadata) {
        return "";
      }
      const result = [];

      for (const key in metadata) {
        // Check if the property is not an object and not an array
        if (
          Object.prototype.hasOwnProperty.call(metadata, key) &&
          typeof metadata[key] !== "object"
        ) {
          result.push(`${key}: ${metadata[key]}`);
        }
      }
      console.log("result", result);

      return result.join(" ");
    }
  } catch (e) {
    console.log("error", e);
    return "";
  }
}
