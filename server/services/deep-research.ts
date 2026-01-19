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
    
    console.log(`Deep Research status for ${interactionId}: ${result.status}`);
    
    if (result.status === 'completed') {
      // Extract text from all text-type outputs in the outputs array
      let rawReport = '';
      
      if (result.outputs && Array.isArray(result.outputs)) {
        // Concatenate all text content from outputs
        const textOutputs = result.outputs
          .filter((output: any) => output.type === 'text' && output.text)
          .map((output: any) => output.text);
        
        rawReport = textOutputs.join('\n\n');
        console.log(`Extracted ${textOutputs.length} text outputs, total length: ${rawReport.length}`);
      }
      
      // If no text found, check for alternative response structures
      if (!rawReport) {
        // Some responses may have output directly
        if (result.output?.text) {
          rawReport = result.output.text;
        } else if (result.text) {
          rawReport = result.text;
        }
        console.log(`Fallback extraction, length: ${rawReport.length}`);
      }
      
      // If still no text, this is a problem - don't return fake data
      if (!rawReport || rawReport.length < 100) {
        console.error('Deep Research completed but no meaningful text output found');
        console.log('Full response structure:', JSON.stringify(result, null, 2).substring(0, 1000));
        return {
          status: 'failed',
          interactionId,
          error: 'Research completed but no results were returned'
        };
      }
      
      const parsedResult = parseResearchOutput(rawReport);
      
      // Validate that we got real data, not defaults
      if (!parsedResult.propertyDetails.address || parsedResult.propertyDetails.address === '') {
        console.error('Parsed result has no address - likely parsing failed');
        return {
          status: 'failed',
          interactionId,
          error: 'Failed to parse research results'
        };
      }
      
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

// New function: Find Redfin URL for a property address using Deep Research
export interface RedfinUrlResult {
  found: boolean;
  redfinUrl?: string;
  confidence: 'high' | 'medium' | 'low';
  alternativeUrls?: string[];
  error?: string;
}

export async function findRedfinUrl(address: string): Promise<RedfinUrlResult> {
  console.log(`🔍 Finding Redfin URL for: ${address}`);
  
  const searchPrompt = `Find the Redfin listing URL for this property address: ${address}

Your ONLY task is to find the Redfin.com URL for this exact property. 

Search for "${address} site:redfin.com" and find the property listing page.

IMPORTANT:
- Only return a URL from redfin.com domain
- The URL should be a property listing page (format: redfin.com/STATE/City/address/home/id)
- If you cannot find an exact match, say so clearly
- Do NOT make up or guess URLs

Respond with ONLY this JSON format:
\`\`\`json
{
  "found": true or false,
  "redfinUrl": "https://www.redfin.com/...",
  "confidence": "high" or "medium" or "low",
  "alternativeUrls": ["other relevant URLs if found"],
  "notes": "any relevant notes about the search"
}
\`\`\``;

  try {
    console.log('🌐 Searching for Redfin URL with Google Search grounding...');
    const startTime = Date.now();
    
    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: searchPrompt }] }],
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️ Search completed in ${elapsed}s`);
    
    // Extract text from response - try multiple access patterns for SDK compatibility
    let responseText = '';
    if (typeof response.text === 'string') {
      responseText = response.text;
    } else if ((response as any).response?.candidates?.[0]?.content?.parts?.[0]?.text) {
      responseText = (response as any).response.candidates[0].content.parts[0].text;
    } else if ((response as any).candidates?.[0]?.content?.parts?.[0]?.text) {
      responseText = (response as any).candidates[0].content.parts[0].text;
    }
    
    console.log(`📝 Response text length: ${responseText.length}`);
    
    // Log grounding sources for debugging
    const groundingMetadata = (response as any).candidates?.[0]?.groundingMetadata;
    if (groundingMetadata?.groundingChunks) {
      console.log('🔗 Sources found:');
      groundingMetadata.groundingChunks.forEach((chunk: any, i: number) => {
        if (chunk.web?.uri) {
          console.log(`  ${i + 1}. ${chunk.web.uri}`);
        }
      });
    }
    
    // Helper to validate Redfin domain (supports both redfin.com and redf.in)
    const isValidRedfinUrl = (url: string): boolean => {
      return url.includes('redfin.com') || url.includes('redf.in');
    };
    
    // Parse the JSON response - try fenced first, then unfenced
    let parsed: any = null;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.log('Failed to parse fenced JSON');
      }
    }
    
    // Try parsing as raw JSON if fenced parsing failed
    if (!parsed) {
      try {
        // Look for JSON object pattern
        const jsonObjMatch = responseText.match(/\{[\s\S]*"found"[\s\S]*\}/);
        if (jsonObjMatch) {
          parsed = JSON.parse(jsonObjMatch[0]);
        }
      } catch (e) {
        console.log('Failed to parse unfenced JSON');
      }
    }
    
    if (parsed) {
      // Validate the URL is actually from Redfin (supports redfin.com and redf.in)
      if (parsed.redfinUrl && !isValidRedfinUrl(parsed.redfinUrl)) {
        console.log('⚠️ URL is not from redfin.com or redf.in, rejecting');
        return {
          found: false,
          confidence: 'low',
          error: 'Found URL but not from Redfin'
        };
      }
      
      if (parsed.found && parsed.redfinUrl) {
        console.log(`✅ Found Redfin URL: ${parsed.redfinUrl}`);
        return {
          found: true,
          redfinUrl: parsed.redfinUrl,
          confidence: parsed.confidence || 'medium',
          alternativeUrls: parsed.alternativeUrls
        };
      } else {
        console.log('❌ No Redfin URL found in JSON response');
        return {
          found: false,
          confidence: 'low',
          error: parsed.notes || 'Property not found on Redfin'
        };
      }
    }
    
    // Fallback: try to extract Redfin URL directly from response (supports both domains)
    const redfinUrlMatch = responseText.match(/https?:\/\/(?:www\.)?(?:redfin\.com|redf\.in)\/[^\s"'<>\)]+/i);
    if (redfinUrlMatch) {
      // Clean up trailing punctuation
      let cleanUrl = redfinUrlMatch[0].replace(/[.,;:!?]+$/, '');
      console.log(`✅ Extracted Redfin URL from response: ${cleanUrl}`);
      return {
        found: true,
        redfinUrl: cleanUrl,
        confidence: 'medium'
      };
    }
    
    return {
      found: false,
      confidence: 'low',
      error: 'Could not find Redfin listing for this address'
    };
    
  } catch (error) {
    console.error('❌ Error finding Redfin URL:', error);
    return {
      found: false,
      confidence: 'low',
      error: `Search failed: ${(error as Error).message}`
    };
  }
}

async function fallbackPropertyResearch(address: string): Promise<PropertyResearchResult> {
  console.log('\n========================================');
  console.log('🔬 DEEP RESEARCH - Starting property analysis');
  console.log('========================================');
  console.log(`📍 Property: ${address}`);
  console.log('🔧 Method: Gemini 3.0 Flash with Google Search grounding');
  console.log('----------------------------------------\n');
  
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
    console.log('🌐 Sending request to Gemini with Google Search grounding...');
    const startTime = Date.now();
    
    const response = await client.models.generateContent({
      model: 'gemini-3.0-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️ Response received in ${elapsed}s`);
    
    const rawReport = response.text || '';
    
    // Log grounding metadata if available
    const groundingMetadata = (response as any).candidates?.[0]?.groundingMetadata;
    if (groundingMetadata) {
      console.log('\n📚 GROUNDING SOURCES USED:');
      console.log('----------------------------------------');
      
      if (groundingMetadata.searchEntryPoint?.renderedContent) {
        console.log('🔍 Search query was executed');
      }
      
      if (groundingMetadata.groundingChunks) {
        const chunks = groundingMetadata.groundingChunks;
        console.log(`Found ${chunks.length} source(s):`);
        chunks.forEach((chunk: any, i: number) => {
          if (chunk.web) {
            console.log(`  ${i + 1}. ${chunk.web.title || 'Unknown'}`);
            console.log(`     URL: ${chunk.web.uri || 'N/A'}`);
          }
        });
      }
      
      if (groundingMetadata.webSearchQueries) {
        console.log('\n🔎 Search queries made:');
        groundingMetadata.webSearchQueries.forEach((query: string, i: number) => {
          console.log(`  ${i + 1}. "${query}"`);
        });
      }
      console.log('----------------------------------------\n');
    } else {
      console.log('⚠️ No grounding metadata available in response');
    }
    
    // Log raw response length
    console.log(`📝 Raw response length: ${rawReport.length} characters`);
    
    // Log first 500 chars of response for debugging
    console.log('\n📄 Response preview (first 500 chars):');
    console.log('----------------------------------------');
    console.log(rawReport.substring(0, 500));
    console.log('----------------------------------------\n');
    
    const result = parseResearchOutput(rawReport);
    
    // Log extracted data summary
    console.log('\n✅ EXTRACTED DATA SUMMARY:');
    console.log('========================================');
    console.log(`🏠 Address: ${result.propertyDetails.address || 'Not found'}`);
    console.log(`🛏️ Beds: ${result.propertyDetails.beds}`);
    console.log(`🛁 Baths: ${result.propertyDetails.baths}`);
    console.log(`📐 Sqft: ${result.propertyDetails.sqft?.toLocaleString() || 'N/A'}`);
    console.log(`📅 Year Built: ${result.propertyDetails.yearBuilt || 'N/A'}`);
    console.log(`💰 Current Estimate: $${result.propertyDetails.currentEstimate?.toLocaleString() || 'N/A'}`);
    console.log(`💵 Last Sold: $${result.propertyDetails.lastSoldPrice?.toLocaleString() || 'N/A'} (${result.propertyDetails.lastSoldDate || 'N/A'})`);
    console.log(`🏘️ Comparables found: ${result.comparables.length}`);
    if (result.comparables.length > 0) {
      result.comparables.forEach((comp, i) => {
        console.log(`   ${i + 1}. ${comp.address} - $${comp.price?.toLocaleString()} (${comp.sqft} sqft)`);
      });
    }
    console.log(`🏘️ Neighborhood: ${result.neighborhoodContext.description?.substring(0, 100) || 'N/A'}...`);
    console.log(`📊 Sources cited: ${result.sources?.join(', ') || 'None'}`);
    console.log('========================================\n');
    
    return result;
  } catch (error) {
    console.error('❌ Fallback research also failed:', error);
    throw new Error(`All research methods failed: ${(error as Error).message}`);
  }
}

// New comprehensive property data function that replaces scraping
export interface AIPropertyData {
  address: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt?: number;
  lotSize?: string;
  propertyType?: string;
  description?: string;
  images: string[];
  dataSource: 'ai_research';
  confidence: 'high' | 'medium' | 'low';
  sources: string[];
}

export async function getPropertyDataFromAddress(address: string): Promise<AIPropertyData> {
  console.log('\n========================================');
  console.log('🔍 AI PROPERTY RESEARCH - Getting comprehensive data');
  console.log('========================================');
  console.log(`📍 Property: ${address}`);
  console.log('----------------------------------------\n');

  const searchPrompt = `You are a real estate data researcher. I need ACCURATE, REAL property data for this address:

${address}

Search real estate websites (Redfin, Zillow, Realtor.com, public records) and provide:

1. PROPERTY DETAILS (REQUIRED - search carefully for each):
   - Current listing price OR most recent sale price (REQUIRED - find the actual price)
   - Number of bedrooms (REQUIRED)
   - Number of bathrooms (REQUIRED)
   - Square footage (REQUIRED)
   - Year built
   - Lot size
   - Property type (Single Family, Condo, Townhouse, etc.)
   - Property description

2. PROPERTY IMAGES (IMPORTANT):
   - Find 3-5 actual property listing image URLs from Redfin, Zillow, or Realtor
   - These should be direct image URLs (ending in .jpg, .png, or containing image parameters)
   - Look for URLs like: ssl.cdn-redfin.com, photos.zillowstatic.com, etc.
   - If you cannot find listing images, note that

IMPORTANT:
- Only provide REAL data you find from your search
- Do NOT make up or estimate values
- If you cannot find a piece of data, say "not found"
- The price is CRITICAL - search multiple sources if needed

Respond with this EXACT JSON format:
\`\`\`json
{
  "found": true,
  "address": "Full formatted address",
  "price": 850000,
  "priceSource": "Redfin listing" or "Last sold price" or "Zillow estimate",
  "beds": 3,
  "baths": 2,
  "sqft": 1500,
  "yearBuilt": 1960,
  "lotSize": "6,500 sqft",
  "propertyType": "Single Family",
  "description": "Property description from listing...",
  "images": [
    "https://ssl.cdn-redfin.com/photo/...",
    "https://photos.zillowstatic.com/..."
  ],
  "sources": ["redfin.com", "zillow.com"],
  "confidence": "high" or "medium" or "low",
  "notes": "Any relevant notes about data accuracy"
}
\`\`\`

If you cannot find the property at all, respond with:
\`\`\`json
{
  "found": false,
  "error": "Reason why property was not found"
}
\`\`\``;

  try {
    console.log('🌐 Searching with Gemini + Google Search grounding...');
    const startTime = Date.now();
    
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: searchPrompt }] }],
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️ Search completed in ${elapsed}s`);
    
    // Debug: Log full response structure
    console.log('📋 Response keys:', Object.keys(response || {}));
    
    // Extract text from response - try multiple access patterns
    let responseText = '';
    
    // Try direct text property first
    if (typeof response.text === 'string' && response.text.length > 0) {
      responseText = response.text;
      console.log('✓ Got text from response.text');
    } 
    // Try response.response.candidates path
    else if ((response as any).response?.candidates?.[0]?.content?.parts?.[0]?.text) {
      responseText = (response as any).response.candidates[0].content.parts[0].text;
      console.log('✓ Got text from response.response.candidates');
    } 
    // Try direct candidates path
    else if ((response as any).candidates?.[0]?.content?.parts?.[0]?.text) {
      responseText = (response as any).candidates[0].content.parts[0].text;
      console.log('✓ Got text from response.candidates');
    }
    // Try text() method if it exists
    else if (typeof (response as any).text === 'function') {
      responseText = await (response as any).text();
      console.log('✓ Got text from response.text()');
    }
    
    console.log(`📝 Response length: ${responseText.length} chars`);
    
    // Log first 500 chars if we have content
    if (responseText.length > 0) {
      console.log('📄 Response preview:', responseText.substring(0, 500));
    } else {
      console.log('⚠️ Response is empty, logging raw response:');
      console.log(JSON.stringify(response, null, 2).substring(0, 1000));
    }
    
    // Log grounding sources
    const groundingMetadata = (response as any).candidates?.[0]?.groundingMetadata;
    if (groundingMetadata?.groundingChunks) {
      console.log('🔗 Sources found:');
      const imageUrls: string[] = [];
      groundingMetadata.groundingChunks.forEach((chunk: any, i: number) => {
        if (chunk.web?.uri) {
          console.log(`  ${i + 1}. ${chunk.web.uri}`);
          // Try to extract images from grounding metadata
          if (chunk.web.uri.match(/\.(jpg|jpeg|png|webp)/i) || 
              chunk.web.uri.includes('photo') || 
              chunk.web.uri.includes('image')) {
            imageUrls.push(chunk.web.uri);
          }
        }
      });
      if (imageUrls.length > 0) {
        console.log(`📸 Found ${imageUrls.length} potential image URLs from grounding`);
      }
    }
    
    // Parse JSON response
    let parsed: any = null;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.log('Failed to parse fenced JSON, trying unfenced...');
      }
    }
    
    if (!parsed) {
      const jsonObjMatch = responseText.match(/\{[\s\S]*"found"[\s\S]*\}/);
      if (jsonObjMatch) {
        try {
          parsed = JSON.parse(jsonObjMatch[0]);
        } catch (e) {
          console.log('Failed to parse unfenced JSON');
        }
      }
    }
    
    if (!parsed || !parsed.found) {
      throw new Error(parsed?.error || 'Could not find property data');
    }
    
    // Validate required fields
    if (!parsed.price || parsed.price <= 0) {
      throw new Error('Could not determine property price from search results');
    }
    
    // Extract and validate images
    let images: string[] = [];
    if (parsed.images && Array.isArray(parsed.images)) {
      images = parsed.images.filter((url: string) => {
        return url && typeof url === 'string' && 
               (url.startsWith('http://') || url.startsWith('https://'));
      });
    }
    
    console.log('\n✅ PROPERTY DATA EXTRACTED:');
    console.log('========================================');
    console.log(`🏠 Address: ${parsed.address}`);
    console.log(`💰 Price: $${parsed.price?.toLocaleString()} (${parsed.priceSource || 'source unknown'})`);
    console.log(`🛏️ Beds: ${parsed.beds}`);
    console.log(`🛁 Baths: ${parsed.baths}`);
    console.log(`📐 Sqft: ${parsed.sqft?.toLocaleString()}`);
    console.log(`📅 Year Built: ${parsed.yearBuilt || 'N/A'}`);
    console.log(`🏷️ Type: ${parsed.propertyType || 'N/A'}`);
    console.log(`📸 Images: ${images.length} found`);
    console.log(`📊 Confidence: ${parsed.confidence || 'medium'}`);
    console.log(`🔗 Sources: ${parsed.sources?.join(', ') || 'N/A'}`);
    console.log('========================================\n');
    
    return {
      address: parsed.address || address,
      price: parsed.price,
      beds: parsed.beds || 0,
      baths: parsed.baths || 0,
      sqft: parsed.sqft || 0,
      yearBuilt: parsed.yearBuilt,
      lotSize: parsed.lotSize,
      propertyType: parsed.propertyType,
      description: parsed.description,
      images: images,
      dataSource: 'ai_research',
      confidence: parsed.confidence || 'medium',
      sources: parsed.sources || []
    };
    
  } catch (error) {
    console.error('❌ AI property research failed:', error);
    throw new Error(`AI_RESEARCH_FAILED: ${(error as Error).message}`);
  }
}
