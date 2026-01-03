import OpenAI from "openai";
import { ConstructionCostResult } from "./pricing";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

// Cache for embeddings and pricing data
interface CachedPricingData {
  zipCode: string;
  projectType: string;
  costs: {
    low: number;
    medium: number;
    high: number;
  };
  source: string;
  timestamp: Date;
  embedding: number[];
  confidenceScore: number;
  region: string;
}

// In-memory cache (in production, this would be a proper database)
const pricingCache = new Map<string, CachedPricingData>();

// Embedding cache to avoid re-computing embeddings for same queries
const embeddingCache = new Map<string, number[]>();

/**
 * Generate embedding for location + project type combination
 */
async function generateLocationEmbedding(zipCode: string, projectType: string): Promise<number[]> {
  const key = `${zipCode}_${projectType}`;
  
  if (embeddingCache.has(key)) {
    return embeddingCache.get(key)!;
  }
  
  const text = `construction costs ${projectType} zip code ${zipCode} square foot pricing`;
  
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    
    const embedding = response.data[0].embedding;
    embeddingCache.set(key, embedding);
    return embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    // Return a default embedding vector if OpenAI fails
    return new Array(1536).fill(0);
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Extract numerical pricing data from search results
 */
function extractPricingFromContent(content: string, projectType: string): {
  costs: { low: number; medium: number; high: number } | null;
  confidenceScore: number;
} {
  const text = content.toLowerCase();
  
  // Confidence scoring factors
  let confidenceScore = 0.5; // Base confidence
  
  // Boost confidence for authoritative sources
  const authoritativeSources = [
    'rsmeansdata', 'homeadvisor', 'angie', 'thumbtack', 'contractor', 
    'construction', 'remodeling', 'estimate', 'cost guide', 'pricing'
  ];
  
  for (const source of authoritativeSources) {
    if (text.includes(source)) {
      confidenceScore += 0.1;
    }
  }
  
  // Look for currency patterns and square foot references
  const currencyPatterns = [
    // $150-300 per sq ft, $200-400/sqft, $250 to $350 per square foot
    /\$(\d{1,3}(?:,\d{3})*)\s*[-–to]\s*\$?(\d{1,3}(?:,\d{3})*)\s*(?:per|\/)\s*(?:sq\.?\s*ft\.?|sqft|square\s+foot)/gi,
    // $275 per sq ft (single value)
    /\$(\d{1,3}(?:,\d{3})*)\s*(?:per|\/)\s*(?:sq\.?\s*ft\.?|sqft|square\s+foot)/gi,
    // Cost ranges: $20,000-50,000 for 200 sq ft
    /\$(\d{1,3}(?:,\d{3})*(?:k|,000)?)\s*[-–to]\s*\$?(\d{1,3}(?:,\d{3})*(?:k|,000)?)\s*.*?(\d+(?:,\d{3})*)\s*(?:sq\.?\s*ft\.?|sqft|square\s+feet?)/gi
  ];
  
  const extractedPrices: number[] = [];
  
  for (const pattern of currencyPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.length >= 3) {
        // Range pattern
        const low = parseInt(match[1].replace(/[,$k]/g, ''));
        const high = parseInt(match[2].replace(/[,$k]/g, ''));
        
        if (match[1].includes('k') || match[1].includes(',000')) {
          // Convert thousands to actual numbers if needed for total cost extraction
          const sqft = match[3] ? parseInt(match[3].replace(/,/g, '')) : 1;
          if (sqft > 0) {
            extractedPrices.push((low * (match[1].includes('k') ? 1000 : 1)) / sqft);
            extractedPrices.push((high * (match[2].includes('k') ? 1000 : 1)) / sqft);
          }
        } else {
          extractedPrices.push(low, high);
        }
        confidenceScore += 0.15; // Found pricing data
      } else if (match.length >= 2) {
        // Single price pattern
        const price = parseInt(match[1].replace(/[,$k]/g, ''));
        extractedPrices.push(price);
        confidenceScore += 0.1;
      }
    }
  }
  
  if (extractedPrices.length === 0) {
    return { costs: null, confidenceScore: Math.min(confidenceScore, 0.3) };
  }
  
  // Filter reasonable prices (between $50 and $2000 per sq ft)
  const validPrices = extractedPrices.filter(price => price >= 50 && price <= 2000);
  
  if (validPrices.length === 0) {
    return { costs: null, confidenceScore: Math.min(confidenceScore, 0.3) };
  }
  
  // Calculate low, medium, high from extracted prices
  validPrices.sort((a, b) => a - b);
  
  const low = validPrices[0];
  const high = validPrices[validPrices.length - 1];
  const medium = validPrices[Math.floor(validPrices.length / 2)];
  
  // Boost confidence based on number of data points
  confidenceScore += Math.min(validPrices.length * 0.05, 0.2);
  
  // Cap confidence at 0.95
  confidenceScore = Math.min(confidenceScore, 0.95);
  
  return {
    costs: { low, medium, high },
    confidenceScore
  };
}

/**
 * Use web search to find current construction costs for a location and project type
 */
async function searchConstructionCosts(zipCode: string, projectType: string): Promise<{
  costs: { low: number; medium: number; high: number } | null;
  sources: string[];
  confidenceScore: number;
}> {
  try {
    // Import web_search function dynamically
    const { web_search } = await import('../lib/web-search-tool');
    
    // Construct search queries for different aspects
    const queries = [
      `construction costs per square foot ${zipCode} ${projectType} 2024`,
      `${projectType} renovation cost ${zipCode} per sqft contractor pricing`,
      `home addition cost ${zipCode} square foot ${projectType} estimates`
    ];
    
    const allResults = [];
    const sources = [];
    
    // Execute multiple searches for comprehensive data
    for (const query of queries) {
      try {
        const results = await web_search({ query });
        if (results && results.length > 0) {
          allResults.push(...results);
          sources.push(`Web search: "${query}"`);
        }
      } catch (searchError) {
        console.log(`Search failed for query "${query}":`, searchError);
        continue;
      }
    }
    
    if (allResults.length === 0) {
      return { costs: null, sources: [], confidenceScore: 0 };
    }
    
    // Combine and extract pricing from all results
    const combinedContent = allResults
      .map(result => `${result.title || ''} ${result.content || ''}`)
      .join(' ');
    
    const { costs, confidenceScore } = extractPricingFromContent(combinedContent, projectType);
    
    return {
      costs,
      sources: sources.slice(0, 3), // Limit sources for readability
      confidenceScore
    };
    
  } catch (error) {
    console.error("Error in web search for construction costs:", error);
    return { costs: null, sources: [], confidenceScore: 0 };
  }
}

/**
 * Retrieve similar location pricing using vector similarity search
 */
export async function retrieveSimilarLocationPricing(
  zipCode: string, 
  projectType: string,
  threshold: number = 0.8
): Promise<CachedPricingData[]> {
  try {
    const queryEmbedding = await generateLocationEmbedding(zipCode, projectType);
    const similarResults: Array<{ data: CachedPricingData; similarity: number }> = [];
    
    // Calculate similarity with cached entries
    for (const cachedData of Array.from(pricingCache.values())) {
      const similarity = cosineSimilarity(queryEmbedding, cachedData.embedding);
      
      if (similarity >= threshold) {
        similarResults.push({ data: cachedData, similarity });
      }
    }
    
    // Sort by similarity and recency
    similarResults.sort((a, b) => {
      // Prioritize similarity, then recency
      if (Math.abs(a.similarity - b.similarity) < 0.05) {
        return b.data.timestamp.getTime() - a.data.timestamp.getTime();
      }
      return b.similarity - a.similarity;
    });
    
    return similarResults.slice(0, 5).map(r => r.data); // Top 5 similar results
    
  } catch (error) {
    console.error("Error retrieving similar location pricing:", error);
    return [];
  }
}

/**
 * Cache location pricing with embedding for future retrieval
 */
export async function cacheLocationPricing(
  zipCode: string, 
  projectType: string, 
  pricingData: {
    costs: { low: number; medium: number; high: number };
    source: string;
    confidenceScore: number;
    region: string;
  }
): Promise<void> {
  try {
    const embedding = await generateLocationEmbedding(zipCode, projectType);
    const key = `${zipCode}_${projectType}`;
    
    const cachedData: CachedPricingData = {
      zipCode,
      projectType,
      costs: pricingData.costs,
      source: pricingData.source,
      timestamp: new Date(),
      embedding,
      confidenceScore: pricingData.confidenceScore,
      region: pricingData.region
    };
    
    pricingCache.set(key, cachedData);
    
    // Cleanup old cache entries (keep last 1000)
    if (pricingCache.size > 1000) {
      const sortedEntries = Array.from(pricingCache.entries())
        .sort(([,a], [,b]) => b.timestamp.getTime() - a.timestamp.getTime());
      
      pricingCache.clear();
      sortedEntries.slice(0, 1000).forEach(([k, v]) => pricingCache.set(k, v));
    }
    
  } catch (error) {
    console.error("Error caching location pricing:", error);
  }
}

/**
 * Get dynamic construction costs using RAG approach with fallback to static pricing
 */
export async function getDynamicConstructionCosts(
  zipCode: string,
  projectType: string,
  location: { city?: string; state?: string } = {}
): Promise<ConstructionCostResult> {
  
  const region = `${location.city || 'Unknown'}, ${location.state || 'Unknown'} ${zipCode}`;
  
  try {
    // First, check cache for recent similar pricing
    const similarPricing = await retrieveSimilarLocationPricing(zipCode, projectType, 0.85);
    
    if (similarPricing.length > 0 && similarPricing[0].confidenceScore > 0.7) {
      const cached = similarPricing[0];
      // Check if cache is recent (within 30 days)
      const daysSinceCache = (new Date().getTime() - cached.timestamp.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceCache <= 30) {
        console.log(`Using cached pricing for ${zipCode} ${projectType} (${cached.confidenceScore.toFixed(2)} confidence)`);
        return {
          low: cached.costs.low,
          medium: cached.costs.medium,
          high: cached.costs.high,
          source: `Cached RAG data (${cached.source})`,
          modelVersion: "RAG-2024.1",
          region
        };
      }
    }
    
    // Perform web search for current data
    console.log(`Searching for construction costs: ${zipCode} ${projectType}`);
    const searchResult = await searchConstructionCosts(zipCode, projectType);
    
    if (searchResult.costs && searchResult.confidenceScore > 0.5) {
      // Cache the new pricing data
      await cacheLocationPricing(zipCode, projectType, {
        costs: searchResult.costs,
        source: searchResult.sources.join(', '),
        confidenceScore: searchResult.confidenceScore,
        region
      });
      
      console.log(`Found dynamic pricing for ${zipCode} ${projectType} (${searchResult.confidenceScore.toFixed(2)} confidence)`);
      
      return {
        low: searchResult.costs.low,
        medium: searchResult.costs.medium,
        high: searchResult.costs.high,
        source: `RAG Web Search (${searchResult.confidenceScore.toFixed(2)} confidence): ${searchResult.sources.join(', ')}`,
        modelVersion: "RAG-2024.1",
        region
      };
    }
    
    // Fallback to cached data with lower confidence threshold
    if (similarPricing.length > 0) {
      const cached = similarPricing[0];
      console.log(`Falling back to cached similar location data for ${zipCode} ${projectType}`);
      return {
        low: cached.costs.low,
        medium: cached.costs.medium,
        high: cached.costs.high,
        source: `Similar location cache (${cached.confidenceScore.toFixed(2)} confidence): ${cached.source}`,
        modelVersion: "RAG-2024.1",
        region
      };
    }
    
    // Final fallback to static pricing from existing system
    console.log(`No dynamic data found, falling back to static pricing for ${zipCode} ${projectType}`);
    
  } catch (error) {
    console.error(`Error in RAG pricing for ${zipCode} ${projectType}:`, error);
  }
  
  // Import and use static pricing as ultimate fallback
  const { estimateConstructionCostPpsf } = await import('./pricing');
  const staticResult = estimateConstructionCostPpsf(location, projectType);
  
  return {
    ...staticResult,
    source: `Static fallback: ${staticResult.source}`,
    modelVersion: "RAG-2024.1-Fallback"
  };
}

/**
 * Batch process multiple locations for improved efficiency
 */
export async function batchGetDynamicConstructionCosts(
  locations: Array<{
    zipCode: string;
    projectType: string;
    location: { city?: string; state?: string };
  }>
): Promise<ConstructionCostResult[]> {
  
  const results = await Promise.all(
    locations.map(({ zipCode, projectType, location }) => 
      getDynamicConstructionCosts(zipCode, projectType, location)
    )
  );
  
  return results;
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats() {
  const totalEntries = pricingCache.size;
  const averageConfidence = Array.from(pricingCache.values())
    .reduce((sum, entry) => sum + entry.confidenceScore, 0) / totalEntries;
  
  const recentEntries = Array.from(pricingCache.values())
    .filter(entry => {
      const daysSince = (new Date().getTime() - entry.timestamp.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince <= 7;
    }).length;
  
  return {
    totalEntries,
    recentEntries,
    averageConfidence: averageConfidence || 0,
    embeddingCacheSize: embeddingCache.size
  };
}