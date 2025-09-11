import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

export interface RenovationAnalysis {
  projects: Array<{
    name: string;
    description: string;
    costRangeLow: number;
    costRangeHigh: number;
    valueAdd: number;
    timeline: string;
    priority: number;
    reasoning: string;
  }>;
}

export async function analyzePropertyForRenovations(
  propertyData: any,
  propertyImages?: string[]
): Promise<RenovationAnalysis> {
  try {
    const messages: any[] = [
      {
        role: "system",
        content: `You are an expert real estate renovation analyst with 20+ years of experience. 
        Analyze property data and photos to identify the 3-5 most profitable renovation opportunities.
        Focus on projects that maximize ROI and align with current market trends.
        
        Respond with JSON in this exact format:
        {
          "projects": [
            {
              "name": "Kitchen Remodel",
              "description": "Brief description of the project scope",
              "costRangeLow": 25000,
              "costRangeHigh": 45000,
              "valueAdd": 55000,
              "timeline": "4-6 weeks",
              "priority": 1,
              "reasoning": "Why this project was recommended"
            }
          ]
        }`
      },
      {
        role: "user",
        content: `Analyze this property for renovation opportunities:
        
        Property Details:
        - Address: ${propertyData.address}
        - Bedrooms: ${propertyData.beds}
        - Bathrooms: ${propertyData.baths}
        - Square Footage: ${propertyData.sqft}
        - Year Built: ${propertyData.yearBuilt}
        - Current Price: $${propertyData.price?.toLocaleString() || 'Not listed'}
        - Description: ${propertyData.description || 'No description available'}
        
        Consider the property's age, current condition based on description, and market standards for similar homes.
        Prioritize projects with highest ROI potential.`
      }
    ];

    // Skip image analysis for now to avoid issues with external URLs
    // TODO: Re-enable once image processing is working properly
    /*
    if (propertyImages && propertyImages.length > 0) {
      for (const imageUrl of propertyImages.slice(0, 3)) { // Analyze up to 3 images
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this property image for renovation opportunities:"
            },
            {
              type: "image_url",
              image_url: { url: imageUrl }
            }
          ]
        });
      }
    }
    */

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      response_format: { type: "json_object" },
      max_tokens: 2000,
    });

    const rawContent = response.choices[0].message.content;
    console.log("OpenAI Response Content:", rawContent);
    
    if (!rawContent) {
      throw new Error("Empty response from OpenAI");
    }
    
    let analysis;
    try {
      analysis = JSON.parse(rawContent);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.error("Raw content:", rawContent);
      throw new Error("Failed to parse OpenAI response as JSON");
    }
    
    console.log("Parsed Analysis:", JSON.stringify(analysis, null, 2));
    
    if (!analysis.projects || !Array.isArray(analysis.projects)) {
      console.error("Invalid analysis structure:", analysis);
      throw new Error("Invalid response format from OpenAI - missing or invalid projects array");
    }

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
}>> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a local contractor directory expert. Generate realistic contractor recommendations 
          for a specific area and renovation type. Base recommendations on typical contractor profiles in the area.
          
          Respond with JSON in this exact format:
          {
            "contractors": [
              {
                "name": "Bay City Contractors",
                "specialty": "Kitchen Specialists",
                "rating": 4.9,
                "reviewCount": 127,
                "experience": "15+ years experience"
              }
            ]
          }`
        },
        {
          role: "user",
          content: `Find 3 top-rated contractors in the area of ${propertyAddress} specializing in ${topRenovationProject}.
          Focus on contractors with strong ratings and relevant experience.`
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return result.contractors || [];
  } catch (error) {
    console.error("Error generating contractor recommendations:", error);
    throw new Error("Failed to generate contractor recommendations: " + (error as Error).message);
  }
}
