/**
 * Comprehensive RAG Pricing System Test for Zip Code 90066 (Marina del Rey)
 * 
 * This test validates the RAG pricing system against local Marina del Rey market knowledge:
 * - Marina del Rey is an expensive coastal LA area with luxury condos and waterfront properties
 * - Construction costs should be $350-500+ per sq ft for high-end work
 * - Market prices should be $1000+ per sq ft for waterfront luxury properties
 * - Should significantly outperform static national pricing averages
 */

import { getDynamicConstructionCosts, getCacheStats } from './rag-pricing';
import { getDynamicMarketPpsf, getMarketCacheStats } from './rag-market-pricing';
import { getAggregatedPricing } from './pricing-aggregator';
import { estimateConstructionCostPpsf } from './pricing';

// Marina del Rey location data
const MARINA_DEL_REY_LOCATION = {
  city: 'Marina del Rey',
  state: 'California',
  zip: '90066'
};

// Expected pricing ranges for Marina del Rey based on local market knowledge
const EXPECTED_MARINA_PRICING = {
  construction: {
    adu: { min: 350, max: 550, expectedMid: 450 },
    kitchen: { min: 300, max: 500, expectedMid: 400 },
    addition: { min: 375, max: 575, expectedMid: 475 }
  },
  market: {
    min: 900, // Luxury condos start around $900/sqft
    max: 2000, // Waterfront luxury can go $1500-2000+/sqft
    expectedMid: 1200
  }
};

interface TestResult {
  testName: string;
  success: boolean;
  data: any;
  analysis: string;
  confidence: number;
  meetsPricingExpectations: boolean;
  dataSource: string;
  executionTime: number;
}

interface TestSummary {
  totalTests: number;
  successfulTests: number;
  failedTests: number;
  averageConfidence: number;
  ragVsStaticComparison: {
    constructionImprovement: number;
    marketImprovement: number;
  };
  marinaDelReyValidation: {
    constructionRealistic: boolean;
    marketRealistic: boolean;
    overallRealistic: boolean;
  };
  results: TestResult[];
}

/**
 * Validate if pricing makes sense for Marina del Rey market
 */
function validateMarinaDelReyPricing(
  type: 'construction' | 'market',
  value: number,
  projectType?: string
): { realistic: boolean; analysis: string; expectedRange: string } {
  
  if (type === 'construction' && projectType) {
    const expected = EXPECTED_MARINA_PRICING.construction[projectType as keyof typeof EXPECTED_MARINA_PRICING.construction];
    if (!expected) {
      return { realistic: false, analysis: `Unknown project type: ${projectType}`, expectedRange: 'N/A' };
    }
    
    const realistic = value >= expected.min && value <= expected.max;
    const withinReasonableRange = value >= expected.min * 0.8 && value <= expected.max * 1.2;
    
    return {
      realistic: realistic || withinReasonableRange,
      analysis: realistic 
        ? `✅ ${value}/sqft is realistic for ${projectType} in Marina del Rey`
        : withinReasonableRange
        ? `⚠️ ${value}/sqft is slightly outside expected range but reasonable for ${projectType} in Marina del Rey`
        : `❌ ${value}/sqft seems ${value < expected.min ? 'too low' : 'too high'} for ${projectType} in Marina del Rey`,
      expectedRange: `$${expected.min}-${expected.max}/sqft (expected ~$${expected.expectedMid}/sqft)`
    };
  }
  
  if (type === 'market') {
    const expected = EXPECTED_MARINA_PRICING.market;
    const realistic = value >= expected.min && value <= expected.max;
    const withinReasonableRange = value >= expected.min * 0.7 && value <= expected.max * 1.3;
    
    return {
      realistic: realistic || withinReasonableRange,
      analysis: realistic
        ? `✅ $${value}/sqft is realistic for Marina del Rey luxury market`
        : withinReasonableRange
        ? `⚠️ $${value}/sqft is outside expected range but could be reasonable for Marina del Rey`
        : `❌ $${value}/sqft seems ${value < expected.min ? 'too low' : 'too high'} for Marina del Rey luxury market`,
      expectedRange: `$${expected.min}-${expected.max}/sqft (expected ~$${expected.expectedMid}/sqft)`
    };
  }
  
  return { realistic: false, analysis: 'Invalid validation type', expectedRange: 'N/A' };
}

/**
 * Test dynamic construction costs for various project types
 */
async function testConstructionCosts(): Promise<TestResult[]> {
  console.log('\n🏗️ Testing Dynamic Construction Costs for Marina del Rey (90066)...\n');
  
  const projectTypes = [
    { type: 'adu', description: 'Accessory Dwelling Unit (ADU)' },
    { type: 'kitchen', description: 'Kitchen Remodel' },
    { type: 'addition', description: 'Home Addition' }
  ];
  
  const results: TestResult[] = [];
  
  for (const project of projectTypes) {
    const startTime = Date.now();
    console.log(`📋 Testing ${project.description} (${project.type}) pricing...`);
    
    try {
      const result = await getDynamicConstructionCosts('90066', project.type, MARINA_DEL_REY_LOCATION);
      const executionTime = Date.now() - startTime;
      
      // Validate against Marina del Rey expectations
      const validation = validateMarinaDelReyPricing('construction', result.medium, project.type);
      
      // Check confidence (if available in result metadata)
      const confidence = (result as any).confidenceScore || 0.7; // Default confidence
      
      console.log(`   💰 Pricing: Low: $${result.low}, Med: $${result.medium}, High: $${result.high}`);
      console.log(`   📊 Source: ${result.source}`);
      console.log(`   🎯 Validation: ${validation.analysis}`);
      console.log(`   📈 Expected Range: ${validation.expectedRange}`);
      console.log(`   ⏱️ Execution Time: ${executionTime}ms\n`);
      
      results.push({
        testName: `Construction Costs - ${project.description}`,
        success: true,
        data: result,
        analysis: validation.analysis,
        confidence,
        meetsPricingExpectations: validation.realistic,
        dataSource: result.source,
        executionTime
      });
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.log(`   ❌ Error: ${error}`);
      console.log(`   ⏱️ Execution Time: ${executionTime}ms\n`);
      
      results.push({
        testName: `Construction Costs - ${project.description}`,
        success: false,
        data: { error: error instanceof Error ? error.message : String(error) },
        analysis: `Failed to get pricing: ${error}`,
        confidence: 0,
        meetsPricingExpectations: false,
        dataSource: 'Error',
        executionTime
      });
    }
  }
  
  return results;
}

/**
 * Test dynamic market pricing per square foot
 */
async function testMarketPricing(): Promise<TestResult[]> {
  console.log('\n🏘️ Testing Dynamic Market Pricing for Marina del Rey (90066)...\n');
  
  const startTime = Date.now();
  console.log(`📋 Testing market price per square foot...`);
  
  const results: TestResult[] = [];
  
  try {
    const result = await getDynamicMarketPpsf('90066', MARINA_DEL_REY_LOCATION);
    const executionTime = Date.now() - startTime;
    
    // Validate against Marina del Rey market expectations
    const validation = validateMarinaDelReyPricing('market', result.value);
    
    // Check confidence (if available in result metadata)
    const confidence = (result as any).confidenceScore || 0.7; // Default confidence
    
    console.log(`   💰 Market Price per Sq Ft: $${result.value}`);
    console.log(`   📊 Source: ${result.source}`);
    console.log(`   🎯 Validation: ${validation.analysis}`);
    console.log(`   📈 Expected Range: ${validation.expectedRange}`);
    console.log(`   ⏱️ Execution Time: ${executionTime}ms\n`);
    
    results.push({
      testName: 'Market Pricing - Price per Sq Ft',
      success: true,
      data: result,
      analysis: validation.analysis,
      confidence,
      meetsPricingExpectations: validation.realistic,
      dataSource: result.source,
      executionTime
    });
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.log(`   ❌ Error: ${error}`);
    console.log(`   ⏱️ Execution Time: ${executionTime}ms\n`);
    
    results.push({
      testName: 'Market Pricing - Price per Sq Ft',
      success: false,
      data: { error: error instanceof Error ? error.message : String(error) },
      analysis: `Failed to get market pricing: ${error}`,
      confidence: 0,
      meetsPricingExpectations: false,
      dataSource: 'Error',
      executionTime
    });
  }
  
  return results;
}

/**
 * Test aggregated pricing system
 */
async function testAggregatedPricing(): Promise<TestResult[]> {
  console.log('\n🔄 Testing Aggregated Pricing System for Marina del Rey (90066)...\n');
  
  const projectTypes = ['adu', 'kitchen'];
  const results: TestResult[] = [];
  
  for (const projectType of projectTypes) {
    const startTime = Date.now();
    console.log(`📋 Testing aggregated pricing for ${projectType}...`);
    
    try {
      const result = await getAggregatedPricing(
        '90066',
        projectType,
        MARINA_DEL_REY_LOCATION
      );
      const executionTime = Date.now() - startTime;
      
      // Validate construction pricing
      const constructionValidation = validateMarinaDelReyPricing('construction', result.construction.medium, projectType);
      
      // Validate market pricing
      const marketValidation = validateMarinaDelReyPricing('market', result.market.ppsf);
      
      console.log(`   🏗️ Construction: Low: $${result.construction.low}, Med: $${result.construction.medium}, High: $${result.construction.high}`);
      console.log(`   🏘️ Market: $${result.market.ppsf}/sqft`);
      console.log(`   📊 Strategy: ${result.overall.strategy}`);
      console.log(`   🎯 Overall Confidence: ${(result.overall.confidence * 100).toFixed(1)}%`);
      console.log(`   ✅ Cross-Validation: ${result.overall.crossValidationStatus}`);
      console.log(`   📈 Construction Validation: ${constructionValidation.analysis}`);
      console.log(`   🏠 Market Validation: ${marketValidation.analysis}`);
      console.log(`   ⏱️ Execution Time: ${executionTime}ms\n`);
      
      results.push({
        testName: `Aggregated Pricing - ${projectType}`,
        success: true,
        data: result,
        analysis: `Construction: ${constructionValidation.analysis} | Market: ${marketValidation.analysis}`,
        confidence: result.overall.confidence,
        meetsPricingExpectations: constructionValidation.realistic && marketValidation.realistic,
        dataSource: `Construction: ${result.construction.source} | Market: ${result.market.source}`,
        executionTime
      });
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.log(`   ❌ Error: ${error}`);
      console.log(`   ⏱️ Execution Time: ${executionTime}ms\n`);
      
      results.push({
        testName: `Aggregated Pricing - ${projectType}`,
        success: false,
        data: { error: error instanceof Error ? error.message : String(error) },
        analysis: `Failed to get aggregated pricing: ${error}`,
        confidence: 0,
        meetsPricingExpectations: false,
        dataSource: 'Error',
        executionTime
      });
    }
  }
  
  return results;
}

/**
 * Compare RAG pricing against static pricing to show improvement
 */
async function compareRAGvsStatic(): Promise<{ constructionImprovement: number; marketImprovement: number }> {
  console.log('\n⚖️ Comparing RAG vs Static Pricing...\n');
  
  try {
    // Get static construction pricing for comparison
    const staticConstruction = estimateConstructionCostPpsf(MARINA_DEL_REY_LOCATION, 'adu');
    
    // Get RAG construction pricing
    const ragConstruction = await getDynamicConstructionCosts('90066', 'adu', MARINA_DEL_REY_LOCATION);
    
    // Calculate improvements (how much closer to Marina del Rey expectations)
    const expectedADU = EXPECTED_MARINA_PRICING.construction.adu.expectedMid;
    
    const staticDistance = Math.abs(staticConstruction.medium - expectedADU);
    const ragDistance = Math.abs(ragConstruction.medium - expectedADU);
    
    const constructionImprovement = staticDistance > 0 ? 
      ((staticDistance - ragDistance) / staticDistance) * 100 : 0;
    
    console.log(`   🏗️ Static Construction (ADU): $${staticConstruction.medium}/sqft`);
    console.log(`   🧠 RAG Construction (ADU): $${ragConstruction.medium}/sqft`);
    console.log(`   🎯 Expected for Marina del Rey: $${expectedADU}/sqft`);
    console.log(`   📊 Construction Improvement: ${constructionImprovement.toFixed(1)}% closer to expected\n`);
    
    return {
      constructionImprovement,
      marketImprovement: 0 // Market improvement would require static market comparison
    };
    
  } catch (error) {
    console.log(`   ❌ Error in comparison: ${error}\n`);
    return { constructionImprovement: 0, marketImprovement: 0 };
  }
}

/**
 * Display cache statistics
 */
function displayCacheStats(): void {
  console.log('\n📊 Cache Statistics...\n');
  
  try {
    const constructionStats = getCacheStats();
    const marketStats = getMarketCacheStats();
    
    console.log(`   🏗️ Construction Cache:`);
    console.log(`      • Total Entries: ${constructionStats.totalEntries}`);
    console.log(`      • Recent Entries (7 days): ${constructionStats.recentEntries}`);
    console.log(`      • Average Confidence: ${(constructionStats.averageConfidence * 100).toFixed(1)}%`);
    console.log(`      • Embedding Cache Size: ${constructionStats.embeddingCacheSize}\n`);
    
    console.log(`   🏘️ Market Cache:`);
    console.log(`      • Total Entries: ${marketStats.totalEntries}`);
    console.log(`      • Recent Entries (3 days): ${marketStats.recentEntries}`);
    console.log(`      • Average Confidence: ${(marketStats.averageConfidence * 100).toFixed(1)}%`);
    console.log(`      • Embedding Cache Size: ${marketStats.embeddingCacheSize}`);
    console.log(`      • Data Freshness: ${JSON.stringify(marketStats.dataFreshnessBreakdown)}\n`);
    
  } catch (error) {
    console.log(`   ❌ Error getting cache stats: ${error}\n`);
  }
}

/**
 * Main test function for RAG pricing system with 90066
 */
export async function testRAGPricing90066(): Promise<TestSummary> {
  console.log('🚀 Starting Comprehensive RAG Pricing Test for Marina del Rey (90066)');
  console.log('='.repeat(80));
  console.log('This test validates RAG pricing against local Marina del Rey market knowledge:');
  console.log('• High-cost coastal LA area with luxury condos and waterfront properties');
  console.log('• Construction costs should be $350-500+/sqft for premium work');
  console.log('• Market prices should be $900-2000+/sqft for luxury properties');
  console.log('• Should significantly outperform national static pricing averages');
  console.log('='.repeat(80));
  
  const startTime = Date.now();
  
  // Display initial cache state
  displayCacheStats();
  
  // Run all tests
  const constructionResults = await testConstructionCosts();
  const marketResults = await testMarketPricing();
  const aggregatedResults = await testAggregatedPricing();
  
  // Compare against static pricing
  const ragVsStatic = await compareRAGvsStatic();
  
  // Display final cache state
  displayCacheStats();
  
  // Compile results
  const allResults = [...constructionResults, ...marketResults, ...aggregatedResults];
  const successfulTests = allResults.filter(r => r.success).length;
  const failedTests = allResults.length - successfulTests;
  const averageConfidence = allResults.reduce((sum, r) => sum + r.confidence, 0) / allResults.length;
  
  // Validate Marina del Rey realism
  const constructionRealistic = constructionResults.every(r => r.success && r.meetsPricingExpectations);
  const marketRealistic = marketResults.every(r => r.success && r.meetsPricingExpectations);
  const overallRealistic = constructionRealistic && marketRealistic;
  
  const totalTime = Date.now() - startTime;
  
  // Generate summary
  const summary: TestSummary = {
    totalTests: allResults.length,
    successfulTests,
    failedTests,
    averageConfidence,
    ragVsStaticComparison: ragVsStatic,
    marinaDelReyValidation: {
      constructionRealistic,
      marketRealistic,
      overallRealistic
    },
    results: allResults
  };
  
  // Display final summary
  console.log('\n📋 Test Summary');
  console.log('='.repeat(50));
  console.log(`   ✅ Successful Tests: ${successfulTests}/${allResults.length}`);
  console.log(`   ❌ Failed Tests: ${failedTests}`);
  console.log(`   📊 Average Confidence: ${(averageConfidence * 100).toFixed(1)}%`);
  console.log(`   🎯 Marina del Rey Validation: ${overallRealistic ? '✅ REALISTIC' : '❌ NEEDS REVIEW'}`);
  console.log(`   ⚡ Construction Improvement over Static: ${ragVsStatic.constructionImprovement.toFixed(1)}%`);
  console.log(`   ⏱️ Total Execution Time: ${totalTime}ms`);
  
  if (overallRealistic && successfulTests > failedTests) {
    console.log('\n🎉 RAG pricing system successfully validated for Marina del Rey market!');
  } else {
    console.log('\n⚠️ RAG pricing system may need calibration for Marina del Rey market.');
  }
  
  return summary;
}

/**
 * Quick test function for demonstration
 */
export async function quickRAGTest90066(): Promise<void> {
  console.log('\n🔬 Quick RAG Test for 90066 (Marina del Rey)\n');
  
  try {
    // Test one construction project
    const aduCosts = await getDynamicConstructionCosts('90066', 'adu', MARINA_DEL_REY_LOCATION);
    console.log(`🏗️ ADU Construction: $${aduCosts.low}-${aduCosts.high}/sqft (avg: $${aduCosts.medium}/sqft)`);
    console.log(`   Source: ${aduCosts.source}\n`);
    
    // Test market pricing
    const marketPrice = await getDynamicMarketPpsf('90066', MARINA_DEL_REY_LOCATION);
    console.log(`🏘️ Market Price: $${marketPrice.value}/sqft`);
    console.log(`   Source: ${marketPrice.source}\n`);
    
    // Validate expectations
    const constructionValid = validateMarinaDelReyPricing('construction', aduCosts.medium, 'adu');
    const marketValid = validateMarinaDelReyPricing('market', marketPrice.value);
    
    console.log(`🎯 Validation:`);
    console.log(`   Construction: ${constructionValid.analysis}`);
    console.log(`   Market: ${marketValid.analysis}\n`);
    
  } catch (error) {
    console.error(`❌ Quick test failed: ${error}`);
  }
}