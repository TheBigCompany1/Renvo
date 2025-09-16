import OpenAI from "openai";
import { PricingResult } from "./pricing";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

// Cache for embeddings and market pricing data
interface CachedMarketData {
  zipCode: string;
  marketPpsf: number;
  medianPrice: number;
  recentSales: number;
  source: string;
  timestamp: Date;
  embedding: number[];
  confidenceScore: number;
  region: string;
  dataFreshness: 'current' | 'recent' | 'stale';
}

// In-memory cache (in production, this would be a proper database)
const marketPricingCache = new Map<string, CachedMarketData>();

// Embedding cache to avoid re-computing embeddings for same queries
const marketEmbeddingCache = new Map<string, number[]>();

/**
 * Generate embedding for location-based market queries
 */
async function generateMarketEmbedding(zipCode: string): Promise<number[]> {
  const key = `market_${zipCode}`;
  
  if (marketEmbeddingCache.has(key)) {
    return marketEmbeddingCache.get(key)!;
  }
  
  const text = `real estate market prices home sales per square foot zip code ${zipCode} median property values`;
  
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    
    const embedding = response.data[0].embedding;
    marketEmbeddingCache.set(key, embedding);
    return embedding;
  } catch (error) {
    console.error("Error generating market embedding:", error);
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
 * Extract market pricing data from search results
 */
function extractPricingFromMarketData(content: string, zipCode: string): {
  marketPpsf: number | null;
  medianPrice: number | null;
  recentSales: number | null;
  confidenceScore: number;
  dataFreshness: 'current' | 'recent' | 'stale';
} {
  const text = content.toLowerCase();
  
  // Base confidence score
  let confidenceScore = 0.4;
  
  // Boost confidence for authoritative real estate sources
  const realtorSources = [
    'redfin', 'zillow', 'realtor.com', 'trulia', 'mls', 'multiple listing',
    'real estate', 'home sales', 'market report', 'median price', 'sold homes'
  ];
  
  for (const source of realtorSources) {
    if (text.includes(source)) {
      confidenceScore += 0.1;
    }
  }
  
  // Data freshness assessment
  let dataFreshness: 'current' | 'recent' | 'stale' = 'stale';
  if (text.includes('2024') || text.includes('current') || text.includes('latest')) {
    dataFreshness = 'current';
    confidenceScore += 0.15;
  } else if (text.includes('2023') || text.includes('recent')) {
    dataFreshness = 'recent';
    confidenceScore += 0.1;
  }
  
  // Extract price per square foot patterns
  const ppsfPatterns = [
    // $450 per sq ft, $500/sqft, $350 per square foot
    /\$(\d{1,4}(?:,\d{3})*)\s*(?:per|\/)\s*(?:sq\.?\s*ft\.?|sqft|square\s+foot)/gi,
    // price per square foot: $425, selling for $380/sqft
    /(?:price\s+per\s+square\s+foot|selling\s+for|priced\s+at)\s*:?\s*\$(\d{1,4}(?:,\d{3})*)\s*(?:\/sq\.?\s*ft\.?|per\s+sq\.?\s*ft\.?|\/sqft)?/gi,
  ];
  
  const ppsfValues: number[] = [];
  for (const pattern of ppsfPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const price = parseInt(match[1].replace(/,/g, ''));
      if (price >= 100 && price <= 3000) { // Reasonable PPSF bounds
        ppsfValues.push(price);
        confidenceScore += 0.1;
      }
    }
  }
  
  // Extract median home prices
  const medianPricePatterns = [
    // median home price: $1,250,000, median sale price $1.2M
    /median\s+(?:home\s+)?(?:sale\s+)?price\s*:?\s*\$(\d{1,2}(?:,\d{3})*(?:\.\d+)?[km]?)/gi,
    // homes selling for median $850,000
    /homes?\s+selling\s+for\s+(?:median\s+)?\$(\d{1,2}(?:,\d{3})*(?:\.\d+)?[km]?)/gi,
    // average price $975,000
    /average\s+(?:sale\s+)?price\s*:?\s*\$(\d{1,2}(?:,\d{3})*(?:\.\d+)?[km]?)/gi,
  ];
  
  const medianPrices: number[] = [];
  for (const pattern of medianPricePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let price = parseFloat(match[1].replace(/,/g, ''));
      
      // Handle k/m suffixes
      if (match[1].toLowerCase().includes('k')) {
        price *= 1000;
      } else if (match[1].toLowerCase().includes('m')) {
        price *= 1000000;
      }
      
      if (price >= 100000 && price <= 10000000) { // Reasonable home price bounds
        medianPrices.push(price);
        confidenceScore += 0.1;
      }
    }
  }
  
  // Extract recent sales counts
  const salesCountPatterns = [
    // 45 homes sold, 23 recent sales, sold 67 properties
    /(?:sold\s+)?(\d+)\s+(?:homes?\s+sold|recent\s+sales|properties?\s+sold)/gi,
    // sales volume: 34, 28 transactions
    /(?:sales\s+volume|transactions)\s*:?\s*(\d+)/gi,
  ];
  
  const salesCounts: number[] = [];
  for (const pattern of salesCountPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const count = parseInt(match[1]);
      if (count >= 1 && count <= 1000) { // Reasonable sales count bounds
        salesCounts.push(count);
        confidenceScore += 0.05;
      }
    }
  }
  
  // Calculate final values
  const marketPpsf = ppsfValues.length > 0 ? 
    Math.round(ppsfValues.reduce((a, b) => a + b, 0) / ppsfValues.length) : null;
  
  const medianPrice = medianPrices.length > 0 ?
    Math.round(medianPrices.reduce((a, b) => a + b, 0) / medianPrices.length) : null;
  
  const recentSales = salesCounts.length > 0 ?
    Math.round(salesCounts.reduce((a, b) => a + b, 0) / salesCounts.length) : null;
  
  // Boost confidence if we found multiple data points
  if (ppsfValues.length >= 2) confidenceScore += 0.1;
  if (medianPrices.length >= 2) confidenceScore += 0.1;
  if (recentSales && recentSales > 10) confidenceScore += 0.1;
  
  // Cap confidence
  confidenceScore = Math.min(confidenceScore, 0.95);
  
  return {
    marketPpsf,
    medianPrice,
    recentSales,
    confidenceScore,
    dataFreshness
  };
}

/**
 * Use web search to find current market pricing data for a zip code
 */
async function searchMarketPricing(zipCode: string, location: { city?: string; state?: string }): Promise<{
  marketPpsf: number | null;
  medianPrice: number | null;
  recentSales: number | null;
  sources: string[];
  confidenceScore: number;
  dataFreshness: 'current' | 'recent' | 'stale';
}> {
  try {
    // Import web_search function dynamically
    const { web_search } = await import('../lib/web-search-tool');
    
    // Construct targeted search queries for market data
    const cityState = `${location.city || ''} ${location.state || ''}`.trim();
    const queries = [
      `median home prices per square foot ${zipCode} ${cityState} 2024 real estate market`,
      `${zipCode} home sales data market report recent prices per sqft`,
      `real estate prices ${cityState} ${zipCode} sold homes median price per square foot`
    ];
    
    const allResults = [];
    const sources = [];
    
    // Execute multiple searches for comprehensive market data
    for (const query of queries) {
      try {
        const results = await web_search({ query });
        if (results && results.length > 0) {
          allResults.push(...results);
          sources.push(`Market search: "${query}"`);
        }
      } catch (searchError) {
        console.log(`Market search failed for query "${query}":`, searchError);
        continue;
      }
    }
    
    if (allResults.length === 0) {
      return { 
        marketPpsf: null, 
        medianPrice: null, 
        recentSales: null, 
        sources: [], 
        confidenceScore: 0, 
        dataFreshness: 'stale' 
      };
    }
    
    // Combine and extract pricing from all results
    const combinedContent = allResults
      .map(result => `${result.title || ''} ${result.content || ''}`)
      .join(' ');
    
    const extractedData = extractPricingFromMarketData(combinedContent, zipCode);
    
    return {
      ...extractedData,
      sources: sources.slice(0, 3), // Limit sources for readability
    };
    
  } catch (error) {
    console.error("Error in web search for market pricing:", error);
    return { 
      marketPpsf: null, 
      medianPrice: null, 
      recentSales: null, 
      sources: [], 
      confidenceScore: 0, 
      dataFreshness: 'stale' 
    };
  }
}

/**
 * Retrieve similar market pricing using vector similarity search
 */
export async function retrieveSimilarMarketPricing(
  zipCode: string,
  threshold: number = 0.8
): Promise<CachedMarketData[]> {
  try {
    const queryEmbedding = await generateMarketEmbedding(zipCode);
    const similarResults: Array<{ data: CachedMarketData; similarity: number }> = [];
    
    // Calculate similarity with cached market data
    for (const cachedData of Array.from(marketPricingCache.values())) {
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
    console.error("Error retrieving similar market pricing:", error);
    return [];
  }
}

/**
 * Cache market pricing data with embedding for future retrieval
 */
export async function cacheMarketPricing(
  zipCode: string,
  marketData: {
    marketPpsf: number;
    medianPrice?: number;
    recentSales?: number;
    source: string;
    confidenceScore: number;
    region: string;
    dataFreshness: 'current' | 'recent' | 'stale';
  }
): Promise<void> {
  try {
    const embedding = await generateMarketEmbedding(zipCode);
    const key = `market_${zipCode}`;
    
    const cachedData: CachedMarketData = {
      zipCode,
      marketPpsf: marketData.marketPpsf,
      medianPrice: marketData.medianPrice || 0,
      recentSales: marketData.recentSales || 0,
      source: marketData.source,
      timestamp: new Date(),
      embedding,
      confidenceScore: marketData.confidenceScore,
      region: marketData.region,
      dataFreshness: marketData.dataFreshness
    };
    
    marketPricingCache.set(key, cachedData);
    
    // Cleanup old cache entries (keep last 500 for market data)
    if (marketPricingCache.size > 500) {
      const sortedEntries = Array.from(marketPricingCache.entries())
        .sort(([,a], [,b]) => b.timestamp.getTime() - a.timestamp.getTime());
      
      marketPricingCache.clear();
      sortedEntries.slice(0, 500).forEach(([k, v]) => marketPricingCache.set(k, v));
    }
    
  } catch (error) {
    console.error("Error caching market pricing:", error);
  }
}

/**
 * Get dynamic market pricing per square foot using RAG approach
 */
export async function getDynamicMarketPpsf(
  zipCode: string,
  location: { city?: string; state?: string } = {}
): Promise<PricingResult> {
  
  const region = `${location.city || 'Unknown'}, ${location.state || 'Unknown'} ${zipCode}`;
  
  try {
    // First, check cache for recent similar market data
    const similarMarketData = await retrieveSimilarMarketPricing(zipCode, 0.85);
    
    if (similarMarketData.length > 0 && similarMarketData[0].confidenceScore > 0.6) {
      const cached = similarMarketData[0];
      // Check if cache is recent (within 7 days for market data)
      const daysSinceCache = (new Date().getTime() - cached.timestamp.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceCache <= 7 && cached.dataFreshness !== 'stale') {
        console.log(`Using cached market data for ${zipCode} (${cached.confidenceScore.toFixed(2)} confidence)`);
        return {
          value: cached.marketPpsf,
          source: `Cached RAG market data (${cached.source})`,
          modelVersion: "RAG-Market-2024.1",
          region
        };
      }
    }
    
    // Perform web search for current market data
    console.log(`Searching for market pricing: ${zipCode}`);
    const searchResult = await searchMarketPricing(zipCode, location);
    
    if (searchResult.marketPpsf && searchResult.confidenceScore > 0.5) {
      // Cache the new market data
      await cacheMarketPricing(zipCode, {
        marketPpsf: searchResult.marketPpsf,
        medianPrice: searchResult.medianPrice || undefined,
        recentSales: searchResult.recentSales || undefined,
        source: searchResult.sources.join(', '),
        confidenceScore: searchResult.confidenceScore,
        region,
        dataFreshness: searchResult.dataFreshness
      });
      
      console.log(`Found dynamic market pricing for ${zipCode} (${searchResult.confidenceScore.toFixed(2)} confidence)`);
      
      return {
        value: searchResult.marketPpsf,
        source: `RAG Market Search (${searchResult.confidenceScore.toFixed(2)} confidence, ${searchResult.dataFreshness}): ${searchResult.sources.join(', ')}`,
        modelVersion: "RAG-Market-2024.1",
        region
      };
    }
    
    // Fallback to cached data with lower confidence threshold
    if (similarMarketData.length > 0) {
      const cached = similarMarketData[0];
      console.log(`Falling back to cached similar market data for ${zipCode}`);
      return {
        value: cached.marketPpsf,
        source: `Similar location market cache (${cached.confidenceScore.toFixed(2)} confidence): ${cached.source}`,
        modelVersion: "RAG-Market-2024.1",
        region
      };
    }
    
    // No dynamic data found - signal to use static fallback
    console.log(`No dynamic market data found for ${zipCode}, will use static fallback`);
    return {
      value: 0, // Signal to use static pricing
      source: `No dynamic market data available`,
      modelVersion: "RAG-Market-2024.1-NoData",
      region
    };
    
  } catch (error) {
    console.error(`Error in RAG market pricing for ${zipCode}:`, error);
    
    // Return signal to use static fallback
    return {
      value: 0,
      source: `Error in dynamic market search: ${error}`,
      modelVersion: "RAG-Market-2024.1-Error",
      region
    };
  }
}

/**
 * Get cache statistics for monitoring
 */
export function getMarketCacheStats() {
  const totalEntries = marketPricingCache.size;
  const averageConfidence = Array.from(marketPricingCache.values())
    .reduce((sum, entry) => sum + entry.confidenceScore, 0) / totalEntries;
  
  const recentEntries = Array.from(marketPricingCache.values())
    .filter(entry => {
      const daysSince = (new Date().getTime() - entry.timestamp.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince <= 3;
    }).length;
  
  const dataFreshnessBreakdown = Array.from(marketPricingCache.values())
    .reduce((acc, entry) => {
      acc[entry.dataFreshness] = (acc[entry.dataFreshness] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  
  return {
    totalEntries,
    recentEntries,
    averageConfidence: averageConfidence || 0,
    embeddingCacheSize: marketEmbeddingCache.size,
    dataFreshnessBreakdown
  };
}