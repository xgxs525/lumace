export const editPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "targetAudience",
    "pacing",
    "score",
    "estimatedDuration",
    "segments",
    "captions",
    "titleOptions",
    "description",
    "hashtags",
    "coverText",
    "musicDirection",
    "colorDirection",
    "checklist",
    "ffmpegCommand",
    "renderNotes"
  ],
  properties: {
    summary: { type: "string" },
    targetAudience: { type: "string" },
    pacing: { type: "string" },
    score: { type: "number", minimum: 1, maximum: 100 },
    estimatedDuration: { type: "number" },
    segments: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "start", "end", "label", "reason", "energy", "speed"],
        properties: {
          id: { type: "string" },
          start: { type: "number" },
          end: { type: "number" },
          label: { type: "string" },
          reason: { type: "string" },
          energy: { type: "number", minimum: 1, maximum: 100 },
          speed: { type: "number", minimum: 0.5, maximum: 2 }
        }
      }
    },
    captions: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["start", "end", "text"],
        properties: {
          start: { type: "number" },
          end: { type: "number" },
          text: { type: "string" }
        }
      }
    },
    titleOptions: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: { type: "string" }
    },
    description: { type: "string" },
    hashtags: {
      type: "array",
      minItems: 3,
      maxItems: 12,
      items: { type: "string" }
    },
    coverText: { type: "string" },
    musicDirection: { type: "string" },
    colorDirection: { type: "string" },
    checklist: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: { type: "string" }
    },
    ffmpegCommand: { type: "string" },
    renderNotes: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string" }
    }
  }
} as const;
