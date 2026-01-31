import { GoogleGenAI } from "@google/genai";
import type { GeoData, MapsContext, VisionAnalysis, Imagery } from "@shared/schema";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

function safeParseGeminiJson<T>(responseText: string | undefined, context: string): T {
  if (!responseText) {
    throw new Error(`${context}: Empty response from Gemini`);
  }

  try {
    let cleanContent = responseText.trim();
    
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
    
    return JSON.parse(cleanContent) as T;
  } catch (error) {
    console.error(`${context}: Failed to parse JSON`, error);
    console.error(`${context}: Raw response:`, responseText?.substring(0, 500));
    throw new Error(`${context}: Failed to parse Gemini response as JSON`);
  }
}

export async function geocodeAddress(address: string): Promise<GeoData> {
  try {
    console.log(`Geocoding address with Gemini: ${address}`);
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a geocoding expert. Provide the exact coordinates (lat, lng) and formatted address for: ${address}
      
      Use your knowledge of real addresses and locations to provide accurate coordinates.
      
      Respond ONLY with a JSON object in this exact format (no markdown, no extra text):
      {
        "lat": 34.0522,
        "lng": -118.2437,
        "formattedAddress": "123 Main St, Los Angeles, CA 90001, USA"
      }`,
    });

    const responseText = response.text;
    const data = safeParseGeminiJson<{
      lat: number;
      lng: number;
      formattedAddress: string;
    }>(responseText, "Geocoding");
    
    return {
      lat: data.lat,
      lng: data.lng,
      formattedAddress: data.formattedAddress,
    };
  } catch (error) {
    console.error("Error geocoding address:", error);
    throw new Error(`Failed to geocode address: ${(error as Error).message}`);
  }
}

export async function getNeighborhoodContext(
  address: string,
  lat: number,
  lng: number
): Promise<MapsContext> {
  try {
    console.log(`Getting neighborhood context for: ${address}`);
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a real estate neighborhood expert. Analyze the neighborhood around ${address} for real estate investment analysis.

      Use your knowledge of this area to provide:
      1. Nearby points of interest (schools, parks, shopping, transit within 1 mile)
      2. Neighborhood insights and characteristics
      3. Area quality rating (1-10 scale based on schools, safety, amenities)
      
      Respond ONLY with a JSON object in this exact format (no markdown, no extra text):
      {
        "nearbyPOIs": [
          {
            "name": "Example Elementary School",
            "type": "school",
            "distanceMiles": 0.3
          }
        ],
        "neighborhoodInsights": "Describe the neighborhood characteristics, demographics, and market trends.",
        "areaRating": 8.5
      }`,
    });

    const responseText = response.text;
    const data = safeParseGeminiJson<{
      nearbyPOIs?: Array<{ name: string; type: string; distanceMiles?: number }>;
      neighborhoodInsights?: string;
      areaRating?: number;
    }>(responseText, "Neighborhood Context");
    
    return {
      nearbyPOIs: data.nearbyPOIs,
      neighborhoodInsights: data.neighborhoodInsights,
      areaRating: data.areaRating,
    };
  } catch (error) {
    console.error("Error getting neighborhood context:", error);
    throw new Error(`Failed to get neighborhood context: ${(error as Error).message}`);
  }
}

export async function analyzePropertyFromImages(
  imageUrls: string[],
  address: string,
  propertyData?: any
): Promise<VisionAnalysis> {
  try {
    console.log(`Analyzing property from ${imageUrls.length} images`);
    
    const prompt = `Analyze these property images for ${address} and provide a comprehensive visual assessment for renovation planning.

    Property details (if available):
    ${propertyData ? JSON.stringify(propertyData, null, 2) : 'No property data available'}

    Analyze:
    1. Property condition (exterior/interior if visible)
    2. Architectural style and features
    3. Visible features and characteristics
    4. Estimated size and lot analysis
    5. Renovation opportunities

    Respond ONLY with a JSON object in this exact format:
    {
      "propertyCondition": "Good - well-maintained with minor wear...",
      "architecturalStyle": "Mid-century modern single-story...",
      "visibleFeatures": ["Large corner lot", "Mature landscaping", "Two-car garage"],
      "estimatedSize": "Approximately 1,500 sq ft single-story",
      "renovationOpportunities": ["Add second story", "Modernize kitchen"],
      "lotAnalysis": "Large lot with room for ADU or expansion",
      "confidence": 0.85
    }`;

    const contentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: prompt }];
    
    for (const imageUrl of imageUrls.slice(0, 3)) {
      try {
        const imageResponse = await fetch(imageUrl);
        if (imageResponse.ok) {
          const buffer = await imageResponse.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          contentParts.push({
            inlineData: {
              mimeType: "image/jpeg",
              data: base64,
            },
          });
        }
      } catch (fetchError) {
        console.warn(`Failed to fetch image ${imageUrl}:`, fetchError);
      }
    }

    if (contentParts.length === 1) {
      console.warn("No images successfully fetched, falling back to text-only analysis");
      return {
        propertyCondition: "Unable to assess - no images available",
        architecturalStyle: "Unknown",
        visibleFeatures: [],
        confidence: 0,
      };
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contentParts,
    });

    const responseText = response.text;
    const data = safeParseGeminiJson<{
      propertyCondition?: string;
      architecturalStyle?: string;
      visibleFeatures?: string[];
      estimatedSize?: string;
      renovationOpportunities?: string[];
      lotAnalysis?: string;
      confidence?: number;
    }>(responseText, "Vision Analysis");
    
    return {
      propertyCondition: data.propertyCondition,
      architecturalStyle: data.architecturalStyle,
      visibleFeatures: data.visibleFeatures,
      estimatedSize: data.estimatedSize,
      renovationOpportunities: data.renovationOpportunities,
      lotAnalysis: data.lotAnalysis,
      confidence: data.confidence,
    };
  } catch (error) {
    console.error("Error analyzing property from images:", error);
    throw new Error(`Failed to analyze property images: ${(error as Error).message}`);
  }
}

export async function generateImageryUrls(
  lat: number,
  lng: number
): Promise<Imagery> {
  // Use GOOGLE_MAPS_API_KEY specifically for Maps Static API (Street View, Satellite)
  // GOOGLE_API_KEY and GEMINI_API_KEY are for Gemini AI, not Maps imagery
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
  
  if (!apiKey) {
    console.log('⚠️ GOOGLE_MAPS_API_KEY not set - Street View and Satellite imagery will not be available');
  }
  
  // Include API key in URLs for authenticated requests
  const streetViewUrl = apiKey 
    ? `https://maps.googleapis.com/maps/api/streetview?size=640x480&location=${lat},${lng}&fov=90&heading=0&pitch=0&key=${apiKey}`
    : '';
  const satelliteUrl = apiKey
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=19&size=640x480&maptype=satellite&key=${apiKey}`
    : '';
  
  return {
    streetViewUrl,
    satelliteUrl,
  };
}
