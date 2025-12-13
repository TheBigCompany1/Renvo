import { GoogleGenAI } from "@google/genai";

const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "" });

export interface PropertyResearchResult {
  propertyDetails: {
    address: string;
    beds: number;
    baths: number;
    sqft: number;
    lotSize?: string;
    yearBuilt?: number;
    propertyType?: string;
    lastSoldPrice?: number;
    lastSoldDate?: string;
    currentEstimate?: number;
    description: string;
  };
  comparables: Array<{
    address: string;
    beds: number;
    baths: number;
    sqft: number;
    price: number;
    pricePsf: number;
    dateSold: string;
    distanceMiles: number;
  }>;
  neighborhoodContext: {
    description: string;
    medianHomePrice?: number;
    pricePerSqft?: number;
    schoolRating?: number;
    walkScore?: number;
    crimeRating?: string;
    nearbyAmenities: string[];
  };
  marketTrends: {
    priceChange1Year?: number;
    daysOnMarket?: number;
    inventoryLevel?: string;
    buyerDemand?: string;
  };
  sources: string[];
  rawReport: string;
}

export interface ResearchStatus {
  status: 'in_progress' | 'completed' | 'failed';
  interactionId: string;
  result?: PropertyResearchResult;
  error?: string;
}

export async function startPropertyResearch(address: string): Promise<string> {
  console.log(`Starting Deep Research for property: ${address}`);
  
  const researchPrompt = `You are a real estate research analyst. Conduct comprehensive research on the following property address to provide accurate data for a renovation investment analysis.

Property Address: ${address}

Research the following information and provide ACCURATE, REAL data:

1. PROPERTY DETAILS:
   - Exact address with ZIP code
   - Number of bedrooms and bathrooms
   - Square footage (livable area)
   - Lot size
   - Year built
   - Property type (single family, condo, townhouse, etc.)
   - Last sold price and date
   - Current estimated value (from Zillow, Redfin, or similar)
   - Detailed property description

2. COMPARABLE SALES (find 3-5 recent sales within 1 mile):
   - Address
   - Beds/baths/sqft
   - Sale price and date
   - Price per square foot
   - Distance from subject property

3. NEIGHBORHOOD ANALYSIS:
   - Neighborhood name and description
   - Median home price in the area
   - Average price per square foot
   - School ratings
   - Walk score / transit score
   - Safety/crime information
   - Nearby amenities (shopping, restaurants, parks)

4. MARKET TRENDS:
   - Year-over-year price change
   - Average days on market
   - Current inventory levels
   - Buyer demand assessment

Please search real estate websites, public records, and market data to find ACCURATE information. Cite your sources.

At the END of your response, provide a JSON block with the structured data in this EXACT format:

\`\`\`json
{
  "propertyDetails": {
    "address": "full formatted address",
    "beds": 3,
    "baths": 2,
    "sqft": 1500,
    "lotSize": "6,000 sqft",
    "yearBuilt": 1960,
    "propertyType": "Single Family",
    "lastSoldPrice": 800000,
    "lastSoldDate": "2020-05-15",
    "currentEstimate": 1200000,
    "description": "Detailed property description..."
  },
  "comparables": [
    {
      "address": "123 Nearby St, City, State ZIP",
      "beds": 3,
      "baths": 2,
      "sqft": 1600,
      "price": 1150000,
      "pricePsf": 719,
      "dateSold": "2024-08-15",
      "distanceMiles": 0.3
    }
  ],
  "neighborhoodContext": {
    "description": "Neighborhood description...",
    "medianHomePrice": 1100000,
    "pricePerSqft": 750,
    "schoolRating": 8,
    "walkScore": 75,
    "crimeRating": "Low",
    "nearbyAmenities": ["Parks", "Shopping", "Restaurants"]
  },
  "marketTrends": {
    "priceChange1Year": 5.2,
    "daysOnMarket": 28,
    "inventoryLevel": "Low",
    "buyerDemand": "High"
  },
  "sources": ["Zillow", "Redfin", "Realtor.com", "Public Records"]
}
\`\`\``;

  try {
    const interaction = await (client as any).interactions.create({
      input: researchPrompt,
      agent: 'deep-research-pro-preview-12-2025',
      background: true
    });
    
    console.log(`Deep Research started with interaction ID: ${interaction.id}`);
    return interaction.id;
  } catch (error) {
    console.error('Error starting Deep Research:', error);
    throw new Error(`Failed to start Deep Research: ${(error as Error).message}`);
  }
}

export async function pollResearchStatus(interactionId: string): Promise<ResearchStatus> {
  try {
    const result = await (client as any).interactions.get(interactionId);
    
    if (result.status === 'completed') {
      const rawReport = result.outputs[result.outputs.length - 1]?.text || '';
      const parsedResult = parseResearchOutput(rawReport);
      
      return {
        status: 'completed',
        interactionId,
        result: parsedResult
      };
    } else if (result.status === 'failed') {
      return {
        status: 'failed',
        interactionId,
        error: result.error || 'Research failed'
      };
    } else {
      return {
        status: 'in_progress',
        interactionId
      };
    }
  } catch (error) {
    console.error('Error polling research status:', error);
    throw new Error(`Failed to poll research status: ${(error as Error).message}`);
  }
}

export async function waitForResearchCompletion(
  interactionId: string,
  maxWaitMs: number = 300000,
  pollIntervalMs: number = 10000
): Promise<PropertyResearchResult> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const status = await pollResearchStatus(interactionId);
    
    if (status.status === 'completed' && status.result) {
      console.log('Deep Research completed successfully');
      return status.result;
    } else if (status.status === 'failed') {
      throw new Error(`Deep Research failed: ${status.error}`);
    }
    
    console.log(`Deep Research in progress... waiting ${pollIntervalMs / 1000}s`);
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  throw new Error('Deep Research timed out');
}

function parseResearchOutput(rawReport: string): PropertyResearchResult {
  console.log('Parsing Deep Research output...');
  
  const jsonMatch = rawReport.match(/```json\s*([\s\S]*?)\s*```/);
  
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      
      // Clean up the description - remove any JSON formatting artifacts
      if (parsed.propertyDetails?.description) {
        let desc = parsed.propertyDetails.description;
        // Remove JSON intro text if present
        desc = desc.replace(/^Here's the.*?:\s*/i, '');
        desc = desc.replace(/```json[\s\S]*?```/g, '');
        desc = desc.trim();
        parsed.propertyDetails.description = desc;
      }
      
      // Ensure baths is a valid number
      if (parsed.propertyDetails?.baths) {
        const baths = parseFloat(parsed.propertyDetails.baths);
        parsed.propertyDetails.baths = isNaN(baths) || baths > 20 ? 2 : baths;
      }
      
      // Ensure beds is a valid number
      if (parsed.propertyDetails?.beds) {
        const beds = parseInt(parsed.propertyDetails.beds);
        parsed.propertyDetails.beds = isNaN(beds) || beds > 20 ? 3 : beds;
      }
      
      console.log(`Parsed property: ${parsed.propertyDetails?.beds}bd/${parsed.propertyDetails?.baths}ba, ${parsed.propertyDetails?.sqft}sqft`);
      
      return {
        ...parsed,
        rawReport
      };
    } catch (error) {
      console.error('Failed to parse JSON from research output:', error);
    }
  }
  
  console.log('Using fallback parsing for research output');
  return extractDataFromText(rawReport);
}

function extractDataFromText(text: string): PropertyResearchResult {
  const bedsMatch = text.match(/(\d+)\s*(?:bed(?:room)?s?|BR)/i);
  const bathsMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:bath(?:room)?s?|BA)/i);
  const sqftMatch = text.match(/(\d{1,3}(?:,\d{3})*)\s*(?:sq\.?\s*ft\.?|square\s*feet)/i);
  const yearMatch = text.match(/(?:built|year\s*built|constructed)[:\s]+(\d{4})/i);
  const priceMatch = text.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
  
  return {
    propertyDetails: {
      address: '',
      beds: bedsMatch ? parseInt(bedsMatch[1]) : 3,
      baths: bathsMatch ? parseFloat(bathsMatch[1]) : 2,
      sqft: sqftMatch ? parseInt(sqftMatch[1].replace(/,/g, '')) : 1500,
      yearBuilt: yearMatch ? parseInt(yearMatch[1]) : undefined,
      currentEstimate: priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : undefined,
      description: text.substring(0, 500)
    },
    comparables: [],
    neighborhoodContext: {
      description: '',
      nearbyAmenities: []
    },
    marketTrends: {},
    sources: [],
    rawReport: text
  };
}

export async function conductPropertyResearch(address: string): Promise<PropertyResearchResult> {
  console.log(`Conducting full property research for: ${address}`);
  
  try {
    const interactionId = await startPropertyResearch(address);
    const result = await waitForResearchCompletion(interactionId);
    return result;
  } catch (error) {
    console.error('Deep Research failed, attempting fallback:', error);
    return await fallbackPropertyResearch(address);
  }
}

async function fallbackPropertyResearch(address: string): Promise<PropertyResearchResult> {
  console.log('Using fallback research method with Gemini 2.5 Flash...');
  
  const prompt = `Research this property address and provide real estate data: ${address}

Search for:
1. Property details (beds, baths, sqft, year built, current value)
2. Recent comparable sales nearby (last 6 months, within 1 mile)
3. Neighborhood information and median home prices
4. Market trends

Provide your findings in JSON format at the end of your response:

\`\`\`json
{
  "propertyDetails": {
    "address": "...",
    "beds": 3,
    "baths": 2,
    "sqft": 1500,
    "yearBuilt": 1960,
    "currentEstimate": 1000000,
    "description": "..."
  },
  "comparables": [...],
  "neighborhoodContext": {...},
  "marketTrends": {...},
  "sources": [...]
}
\`\`\``;

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    
    const rawReport = response.text || '';
    return parseResearchOutput(rawReport);
  } catch (error) {
    console.error('Fallback research also failed:', error);
    throw new Error(`All research methods failed: ${(error as Error).message}`);
  }
}
