import { GoogleGenAI } from "@google/genai";

// DON'T DELETE THIS COMMENT
// Follow these instructions when using this blueprint:
// - Note that the newest Gemini model series is "gemini-2.5-flash" or gemini-2.5-pro"
//   - do not change this unless explicitly requested by the user

// This API key is from Gemini Developer API Key, not vertex AI API Key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface RenovationAnalysis {
  renovation_ideas: Array<{
    name: string;
    description: string;
    new_total_sqft: number;
    estimated_cost: {
      low: number;
      medium: number;
      high: number;
    };
    cost_source: string;
    estimated_value_add: {
      low: number;
      medium: number;
      high: number;
    };
    roi: number;
    feasibility: string;
    timeline: string;
    buyer_profile: string;
    roadmap_steps: string[];
    potential_risks: string[];
  }>;
}

export async function analyzePropertyForRenovations(
  propertyData: any,
  propertyImages?: string[]
): Promise<RenovationAnalysis> {
  try {
    console.log("DEBUG: Starting Gemini analysis...");
    console.log("DEBUG: GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
    console.log("DEBUG: Using Gemini 2.5 Pro model");

    const prompt = `You are an expert real estate renovation analyst with 20+ years of experience specializing in transformative, high-ROI projects. 
        
        Your mission: Generate 3–5 large, transformative renovation ideas that maximize property value and ROI. Think bigger than basic updates—consider ADUs, adding levels, duplex conversions, major additions, or complete reimagining of the space.
        
        Tasks:
        1) Generate 3–5 large, transformative renovation ideas tailored to the subject property
        2) For EACH idea, estimate the new_total_sqft (original sqft plus any additions; never use lot sqft)
        3) Calculate sqft_added (how much new square footage is being added)
        4) Provide cost_per_sqft for the construction work and value_per_sqft for the value added
        5) Include detailed_description with specific square footage details (e.g., "Add 600 sq ft second story...")
        6) Provide sourced local costs and a cost_source string (cite a realistic publication or index)
        7) Provide an estimated_value_add band and compute roi = ((medium value add - medium cost) / medium cost) * 100
        8) Include feasibility, timeline, buyer_profile, 3–6 roadmap_steps, and 2–4 potential_risks
        
        Output ONLY a JSON object that matches this schema exactly:
        {
          "renovation_ideas": [
            {
              "name": "ADU Addition with Second Story",
              "description": "Add a second story ADU above existing garage with full kitchen, bath, and living area",
              "detailed_description": "Add 800 sq ft second story ADU above existing garage featuring 1 bedroom, 1 bathroom, kitchen, and living area. Total addition: 800 sq ft at $250/sq ft construction cost.",
              "new_total_sqft": 2000,
              "sqft_added": 800,
              "cost_per_sqft": 250,
              "value_per_sqft": 312,
              "estimated_cost": { "low": 150000, "medium": 200000, "high": 250000 },
              "cost_source": "2024 Los Angeles Construction Cost Index via ENR",
              "estimated_value_add": { "low": 180000, "medium": 250000, "high": 320000 },
              "roi": 25,
              "feasibility": "High - existing garage foundation can support addition",
              "timeline": "16-24 weeks",
              "buyer_profile": "Multi-generational families, investors seeking rental income",
              "roadmap_steps": ["Structural engineering assessment", "Permit applications", "Foundation reinforcement", "Framing and utilities", "Interior finishing", "Final inspections"],
              "potential_risks": ["Permit delays in LA market", "Cost overruns due to foundation issues", "Neighbor objections to height increase"]
            }
          ]
        }

        Analyze this property for renovation opportunities:
        
        Property Details:
        - Address: ${propertyData.address}
        - Bedrooms: ${propertyData.beds}
        - Bathrooms: ${propertyData.baths}
        - Square Footage: ${propertyData.sqft}
        - Year Built: ${propertyData.yearBuilt}
        - Current Price: $${propertyData.price?.toLocaleString() || 'Not listed'}
        - Description: ${propertyData.description || 'No description available'}
        
        Consider the property's age, current condition based on description, and market standards for similar homes.
        Prioritize projects with highest ROI potential.`;

    console.log("DEBUG: About to call Gemini API...");
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
    });
    
    console.log("DEBUG: Gemini API call completed");

    const rawContent = response.text;
    console.log("Gemini Response Content:", rawContent);
    
    if (!rawContent) {
      throw new Error("Empty response from Gemini");
    }
    
    let analysis;
    try {
      // Clean the response content in case there are any markdown markers or extra text
      let cleanContent = rawContent.trim();
      
      // Remove any markdown code block markers if present
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Try to find JSON content if there's extra text
      const jsonStart = cleanContent.indexOf('{');
      const jsonEnd = cleanContent.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanContent = cleanContent.substring(jsonStart, jsonEnd + 1);
      }
      
      console.log("DEBUG: Cleaned content for parsing:", cleanContent.substring(0, 200) + "...");
      
      analysis = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.error("Raw content length:", rawContent.length);
      console.error("Raw content sample:", rawContent.substring(0, 500));
      throw new Error("Failed to parse Gemini response as JSON");
    }
    
    console.log("Parsed Analysis:", JSON.stringify(analysis, null, 2));
    
    // Handle both old and new response formats
    const projectsArray = analysis.renovation_ideas || analysis.projects;
    if (!projectsArray || !Array.isArray(projectsArray)) {
      console.error("Invalid analysis structure:", analysis);
      throw new Error("Invalid response format from Gemini - missing or invalid projects/renovation_ideas array");
    }
    
    // Normalize to the expected format for backward compatibility
    analysis.projects = projectsArray;

    return analysis;
  } catch (error) {
    console.error("Error analyzing property for renovations:", error);
    throw new Error("Failed to analyze property for renovations: " + (error as Error).message);
  }
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

    const result = await ai.models.generateContent({
      model: "gemini-2.5-pro",
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