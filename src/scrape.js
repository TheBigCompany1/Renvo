// scrape.js - Extracts property data from real estate websites

const SUPPORTED_SITES = {
    ZILLOW: 'zillow.com',
    REDFIN: 'redfin.com',
    REALTOR: 'realtor.com'
  };
    
  // Determine which website we're on
  function detectWebsite() {
    const url = window.location.href;
    
    if (url.includes(SUPPORTED_SITES.ZILLOW)) return SUPPORTED_SITES.ZILLOW;
    if (url.includes(SUPPORTED_SITES.REDFIN)) return SUPPORTED_SITES.REDFIN;
    if (url.includes(SUPPORTED_SITES.REALTOR)) return SUPPORTED_SITES.REALTOR;
    
    return null;
  }
    
  // Extract property data based on website
  function extractPropertyData() {
    const website = detectWebsite();
    let propertyData = {
      url: window.location.href,
      timestamp: new Date().toISOString(),
      source: website
    };
    
    switch (website) {
      case SUPPORTED_SITES.ZILLOW:
        propertyData = { ...propertyData, ...extractZillowData() };
        break;
      case SUPPORTED_SITES.REDFIN:
        propertyData = { ...propertyData, ...extractRedfinData() };
        break;
      case SUPPORTED_SITES.REALTOR:
        propertyData = { ...propertyData, ...extractRealtorData() };
        break;
      default:
        console.error('Unsupported website');
        return null;
    }
    
    return propertyData;
  }
    
  // Zillow-specific data extraction
  function extractZillowData() {
    try {
      const price = document.querySelector('[data-testid="price"]')?.textContent;
      const address = document.querySelector('[data-testid="home-details-address"]')?.textContent;
      const bedsBaths = document.querySelectorAll('[data-testid="bed-bath-item"]');
      const beds = bedsBaths[0]?.textContent;
      const baths = bedsBaths[1]?.textContent;
      const sqft = document.querySelector('[data-testid="home-details-chip-square-footage"]')?.textContent;
      
      // Detailed property info
      const yearBuilt = extractTextByLabel('Year built');
      const lotSize = extractTextByLabel('Lot size');
      const homeType = extractTextByLabel('Home type');
      
      // Extract images for analysis
      const images = Array.from(document.querySelectorAll('[data-testid="image-gallery"] img'))
        .map(img => img.src);
      
      return {
        price,
        address,
        beds,
        baths,
        sqft,
        yearBuilt,
        lotSize,
        homeType,
        images: images.slice(0, 10)
      };
    } catch (error) {
      console.error('Error extracting Zillow data:', error);
      return {};
    }
  }
  
  // Helper to extract text by label on Zillow
  function extractTextByLabel(label) {
    const elements = Array.from(document.querySelectorAll('dt, dd'));
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].textContent.includes(label) && elements[i+1]) {
        return elements[i+1].textContent.trim();
      }
    }
    return null;
  }
    
  // Updated function to extract property data from Redfin pages
  function extractRedfinData() {
    try {
      // Extract address components from meta tags
      const address = document.querySelector('meta[name="twitter:text:street_address"]')?.content;
      const city = document.querySelector('meta[name="twitter:text:city"]')?.content;
      const state = document.querySelector('meta[name="twitter:text:state_code"]')?.content;
      const zipCode = document.querySelector('meta[name="twitter:text:zip"]')?.content;
      
      // Build full address
      const fullAddress = [address, city, state, zipCode].filter(Boolean).join(', ');
      
      // Extract basic details using meta tags
      const price = document.querySelector('meta[name="twitter:text:price"]')?.content;
      const beds = document.querySelector('meta[name="twitter:text:beds"]')?.content;
      const baths = document.querySelector('meta[name="twitter:text:baths"]')?.content;
      const sqft = document.querySelector('meta[name="twitter:text:sqft"]')?.content;
      
      // Extract additional details from house-info section
      const houseInfoDiv = document.getElementById('house-info');
      let propertyType = null;
      let yearBuilt = null;
      let lotSize = null;
      let description = null;
      let lastSold = null;
      
      if (houseInfoDiv) {
        const houseInfoText = houseInfoDiv.textContent;
        
        // Extract property type (e.g., Single-family, Townhouse, Condo)
        const propertyTypeMatch = /((Single-family|Townhouse|Condo|Multi-family))/i.exec(houseInfoText);
        propertyType = propertyTypeMatch ? propertyTypeMatch[1] : null;
        
        // Extract year built using regex
        const yearBuiltMatch = /Built in (\d{4})/i.exec(houseInfoText);
        yearBuilt = yearBuiltMatch ? yearBuiltMatch[1] : null;
        
        // Extract lot size using regex
        const lotSizeMatch = /(?<!Built in )(\d{1,3}(?:,\d{3})*) sq ft lot/i.exec(houseInfoText);
        lotSize = lotSizeMatch ? lotSizeMatch[1] + ' sq ft' : null;
        
        // Extract description (using "Show more" as separator)
        if (houseInfoText.includes("Show more")) {
           description = houseInfoText.split("Show more")[0].trim();
        } else {
           description = houseInfoText.trim();
        }
        
        // Attempt to extract "last sold" information (if available)
        const lastSoldMatch = /Last Sold:\s*([^\n]+)/i.exec(houseInfoText);
        lastSold = lastSoldMatch ? lastSoldMatch[1].trim() : null;
      }
      
      // Extract images
      const images = Array.from(document.querySelectorAll('meta[name^="twitter:image:photo"]'))
        .map(meta => meta.content);
      
      // Additional fields with default values
      const projectedRentalIncome = "N/A";
      const cashFlowAnalysis = "N/A";
      const comparableProperties = "N/A";
      const marketTrends = "N/A";
      const zoningAndPermits = "N/A";
      const sustainabilityMetrics = "N/A";
      const riskAssessment = "N/A";
      
      return {
        url: window.location.href,
        address: fullAddress,
        price,
        beds,
        baths,
        sqft,
        yearBuilt,
        lotSize,
        homeType: propertyType,
        description,
        last_sold: lastSold,
        images: images.slice(0, 10),
        projected_rental_income: projectedRentalIncome,
        cash_flow_analysis: cashFlowAnalysis,
        comparable_properties: comparableProperties,
        market_trends: marketTrends,
        zoning_and_permits: zoningAndPermits,
        sustainability_metrics: sustainabilityMetrics,
        risk_assessment: riskAssessment
      };
    } catch (error) {
      console.error('Error extracting Redfin data:', error);
      return {};
    }
  }
  
  // Realtor.com-specific data extraction
  function extractRealtorData() {
    try {
      const price = document.querySelector('[data-testid="property-price"]')?.textContent;
      const address = document.querySelector('[data-testid="address-block"]')?.textContent;
      const beds = document.querySelector('[data-testid="property-meta-beds"]')?.textContent;
      const baths = document.querySelector('[data-testid="property-meta-baths"]')?.textContent;
      const sqft = document.querySelector('[data-testid="property-meta-sqft"]')?.textContent;
      
      const propertyDetails = document.querySelectorAll('[data-testid="propertyDetails"] li');
      let yearBuilt = null;
      let lotSize = null;
      let homeType = null;
      
      propertyDetails.forEach(detail => {
        const text = detail.textContent;
        if (text.includes('Year built')) {
          yearBuilt = text.replace('Year built', '').trim();
        } else if (text.includes('Lot size')) {
          lotSize = text.replace('Lot size', '').trim();
        } else if (text.includes('Type')) {
          homeType = text.replace('Type', '').trim();
        }
      });
      
      const images = Array.from(document.querySelectorAll('[data-testid="gallery"] img'))
        .map(img => img.src);
      
      return {
        price,
        address,
        beds,
        baths,
        sqft,
        yearBuilt,
        lotSize,
        homeType,
        images: images.slice(0, 10)
      };
    } catch (error) {
      console.error('Error extracting Realtor.com data:', error);
      return {};
    }
  }
    
  // Only add the onMessage listener if chrome.runtime is available
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'extractData') {
      const data = extractPropertyData();
      sendResponse({ success: true, data });
    }
  });
}

// Only send a message on page load if chrome.runtime is available
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
  window.addEventListener('load', () => {
    const website = detectWebsite();
    if (website) {
      chrome.runtime.sendMessage({ 
        action: 'propertyPageDetected',
        website 
      });
    }
  });
}