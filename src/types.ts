import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";

const documentSchema = z.object({
  pageContent: z.string(),
  metadata: z.object({
    file_name: z.string(),
    file_type: z.string(),
    size: z.number(),
    lastModified: z.number(),
  }),
});
const documentsSchema = z.object({
  documents: z.array(documentSchema),
});

// schema for a question
const questionSchema = z.object({
  question: z.string(),
});

// curl -X POST http://localhost:8787/documents \
//   -F "images=@/Users/pratimbhosale/Desktop/pratim's_photos2/IMG_7961.HEIC.jpg" \
//   -F "images=@/Users/pratimbhosale/Desktop/pratim's_photos2/IMG_8332.HEIC.jpg"

const fileValidator = z.custom<File>((file) => file instanceof File);

// Define a schema that accepts both a single file and an array of files
const fileSchema = z.object({
  images: z.union([fileValidator, z.array(fileValidator)]),
});

const descriptionsSchema = z.object({
  descriptions: z.array(
    z.object({
      descriptions: z.array(z.string()),
    }),
  ),
});

// an enpoint to upload an image and it returns a description of the image
// Content-Type: multipart/form-data,
// path to ~/Downloads/IMG_7961.HEIC.jpg
// curl -X POST -F "images=[@~/Downloads/IMG_7961.HEIC.jpg]" "http://localhost:8787/describe" -H "Content-Type: multipart/form-data"
export const routeDescribeImages = createRoute({
  method: "post",
  path: "/describe",
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: fileSchema,
        },
      },
    },
  },

  responses: {
    "200": {
      description: "OK",
      content: {
        "application/json": {
          schema: descriptionsSchema,
        },
      },
    },
  },
});

export const routeUploadDocuments = createRoute({
  method: "post",
  path: "/documents",
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: fileSchema,
        },
      },
    },
  },
  responses: {
    "200": {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({
            count: z.number(),
          }),
        },
      },
    },
  },
});

export const routeListDocuments = createRoute({
  method: "get",
  path: "/documents",
  responses: {
    "200": {
      description: "OK",
      content: {
        "application/json": {
          schema: documentsSchema,
        },
      },
    },
  },
});
export const routeAskQuestion = createRoute({
  method: "post",
  path: "documents/ask",
  request: {
    body: {
      content: {
        "application/json": {
          schema: questionSchema,
        },
      },
    },
  },
  responses: {
    "200": {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({
            answer: z.string(),
          }),
        },
      },
    },
  },
});
