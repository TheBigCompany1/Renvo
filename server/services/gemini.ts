import { GoogleGenAI } from "@google/genai";

// DON'T DELETE THIS COMMENT
// Follow these instructions when using this blueprint:
// - Using gemini-3-flash-preview model per official docs
//   - do not change this unless explicitly requested by the user

let _ai: GoogleGenAI;
function getClient() {
  if (!_ai) {
    const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.Gemini_API_Key;
    if (!key) throw new Error("API key missing from process.env! Available keys: " + Object.keys(process.env).join(", "));
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
}


export async function generateContractorRecommendations(
  propertyAddress: string,
  topRenovationProject: string
): Promise<Array<{
  name: string;
  specialty: string;
  rating: number;
  reviewCount: number;
  experience: string;
  contact: string;
  website: string;
}>> {
  try {
    const prompt = `You are a local contractor directory expert. Generate realistic contractor recommendations 
          for a specific area and renovation type. Base recommendations on typical contractor profiles in the area.
          
          Find 3 top-rated contractors in the area of ${propertyAddress} specializing in ${topRenovationProject}.
          Focus on contractors with strong ratings and relevant experience. Make sure contractor names, specialties, 
          or descriptions reference the location (${propertyAddress}) to show they are local to the area.
          
          Respond ONLY with JSON in this exact format (no markdown, no extra text):
          {
            "contractors": [
              {
                "name": "Bay City Contractors",
                "specialty": "Kitchen Specialists",
                "rating": 4.9,
                "reviewCount": 127,
                "experience": "15+ years experience",
                "contact": "(555) 123-4567",
                "website": "https://baycitycontractors.com"
              }
            ]
          }`;

    const ai = getClient();
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    const rawContent = result.text || '';
    
    // Clean and parse the response
    let cleanContent = rawContent.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    const jsonStart = cleanContent.indexOf('{');
    const jsonEnd = cleanContent.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleanContent = cleanContent.substring(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleanContent);
    return parsed.contractors || [];
  } catch (error) {
    console.error("Error generating contractor recommendations:", error);
    throw new Error("Failed to generate contractor recommendations: " + (error as Error).message);
  }
}