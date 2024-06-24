export const SYSTEM_TEMPLATE = `Use the following pieces of context and metadata to answer the question at the end.
 If you don't know the answer, just say that you don't know, don't try to make up an answer.
 ----------------
 Description of an image: {filtered_context}
 Metadata: {metadata}
 `;

export const VISION_PROMPT = `Describe this image, identify known landmarks`;
