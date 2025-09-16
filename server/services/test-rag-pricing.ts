/**
 * Test script for RAG pricing service
 */

import { getDynamicConstructionCosts, getCacheStats } from './rag-pricing';

export async function testRAGPricing() {
  console.log('🧪 Testing RAG Pricing Service...');
  
  try {
    // Test 1: Basic functionality with zip code
    console.log('\n1️⃣ Testing basic RAG pricing for 90066 (Los Angeles)...');
    const result1 = await getDynamicConstructionCosts('90066', 'adu', { city: 'Los Angeles', state: 'CA' });
    console.log('✅ Result:', {
      costs: { low: result1.low, medium: result1.medium, high: result1.high },
      source: result1.source,
      modelVersion: result1.modelVersion
    });
    
    // Test 2: Different project type
    console.log('\n2️⃣ Testing kitchen remodel pricing for same location...');
    const result2 = await getDynamicConstructionCosts('90066', 'kitchen_remodel', { city: 'Los Angeles', state: 'CA' });
    console.log('✅ Result:', {
      costs: { low: result2.low, medium: result2.medium, high: result2.high },
      source: result2.source
    });
    
    // Test 3: Different zip code
    console.log('\n3️⃣ Testing pricing for different zip code (10001 NYC)...');
    const result3 = await getDynamicConstructionCosts('10001', 'addition', { city: 'New York', state: 'NY' });
    console.log('✅ Result:', {
      costs: { low: result3.low, medium: result3.medium, high: result3.high },
      source: result3.source
    });
    
    // Test 4: Check cache statistics
    console.log('\n4️⃣ Cache statistics:');
    const cacheStats = getCacheStats();
    console.log('📊 Cache Stats:', cacheStats);
    
    console.log('\n🎉 RAG Pricing Service test completed successfully!');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testRAGPricing();
}