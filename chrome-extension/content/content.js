// content.js - Extracts property data from real estate websites

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
      propertyData = {...propertyData, ...extractZillowData()};
      break;
    case SUPPORTED_SITES.REDFIN:
      propertyData = {...propertyData, ...extractRedfinData()};
      break;
    case SUPPORTED_SITES.REALTOR:
      propertyData = {...propertyData, ...extractRealtorData()};
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
    // These selectors need to be updated regularly as Zillow changes their DOM
    const price = document.querySelector('[data-testid="price"]')?.textContent;
    const address = document.querySelector('[data-testid="home-details-address"]')?.textContent;
    const bedsBaths = document.querySelectorAll('[data-testid="bed-bath-item"]');
    const beds = bedsBaths[0]?.textContent;
    const baths = bedsBaths[1]?.textContent;
    const sqft = document.querySelector('[data-testid="home-details-chip-square-footage"]')?.textContent;
    
    // Try to find more detailed property info
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
      images: images.slice(0, 10) // Limit to first 10 images
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
  
// Redfin-specific data extraction
function extractRedfinData() {
  try {
    const price = document.querySelector('.price-section .statsValue')?.textContent;
    const address = document.querySelector('.street-address')?.textContent;
    const city = document.querySelector('.locality')?.textContent;
    const state = document.querySelector('.region')?.textContent;
    const zip = document.querySelector('.postal-code')?.textContent;
    const fullAddress = `${address}, ${city}, ${state} ${zip}`;
    
    // Find property details
    const beds = document.querySelector('.beds .statsValue')?.textContent;
    const baths = document.querySelector('.baths .statsValue')?.textContent;
    const sqft = document.querySelector('.sqft .statsValue')?.textContent;
    
    // More details from the home facts section
    const yearBuilt = getRedfinFactValue('Year Built');
    const lotSize = getRedfinFactValue('Lot Size');
    const homeType = getRedfinFactValue('Style');
    
    // Extract images
    const images = Array.from(document.querySelectorAll('.InlinePhotoPreview img'))
      .map(img => img.src);
    
    return {
      price,
      address: fullAddress,
      beds,
      baths,
      sqft,
      yearBuilt,
      lotSize,
      homeType,
      images: images.slice(0, 10)
    };
  } catch (error) {
    console.error('Error extracting Redfin data:', error);
    return {};
  }
}

// Helper for Redfin facts
function getRedfinFactValue(factName) {
  const factElements = document.querySelectorAll('.table-row');
  for (const element of factElements) {
    if (element.textContent.includes(factName)) {
      return element.querySelector('.table-value')?.textContent.trim();
    }
  }
  return null;
}
  
// Realtor.com-specific data extraction
function extractRealtorData() {
  try {
    const price = document.querySelector('[data-testid="property-price"]')?.textContent;
    const address = document.querySelector('[data-testid="address-block"]')?.textContent;
    
    // Property details
    const beds = document.querySelector('[data-testid="property-meta-beds"]')?.textContent;
    const baths = document.querySelector('[data-testid="property-meta-baths"]')?.textContent;
    const sqft = document.querySelector('[data-testid="property-meta-sqft"]')?.textContent;
    
    // Additional details
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
    
    // Extract images
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
  
// Listen for messages from the overlay or background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractData') {
    const data = extractPropertyData();
    sendResponse({ success: true, data });
  }
});

// Initialize on page load
window.addEventListener('load', () => {
  // Check if we're on a supported site
  const website = detectWebsite();
  if (website) {
    // Notify background script that we're on a property page
    chrome.runtime.sendMessage({ 
      action: 'propertyPageDetected',
      website 
    });
  }
});