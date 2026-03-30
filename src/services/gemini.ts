import { GoogleGenAI } from "@google/genai";

export async function generateNewBackground(originalImageBase64: string, prompt: string) {
  // Use gemini-3.1-flash-image-preview for high quality and custom resolution
  const model = "gemini-3.1-flash-image-preview";
  
  // Create instance right before call to get the latest key from the selection dialog
  // The platform injects the selected key into process.env.API_KEY or process.env.GEMINI_API_KEY
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("API_KEY_MISSING");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            data: originalImageBase64.split(',')[1],
            mimeType: "image/png",
          },
        },
        {
          text: `Keep the main subject of this image exactly as it is, but replace the entire background with: ${prompt}. The subject should look naturally integrated into the new environment.`,
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
        imageSize: "1K"
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  
  throw new Error("Failed to generate new background");
}
