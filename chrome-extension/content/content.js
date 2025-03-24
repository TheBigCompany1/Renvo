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
  
// Function to extract property data from Redfin pages
function extractRedfinData() {
  try {
    // Extract address components
    const address = document.querySelector('meta[name="twitter:text:street_address"]')?.content;
    const city = document.querySelector('meta[name="twitter:text:city"]')?.content;
    const state = document.querySelector('meta[name="twitter:text:state_code"]')?.content;
    const zipCode = document.querySelector('meta[name="twitter:text:zip"]')?.content;
    
    // Full address
    const fullAddress = [address, city, state, zipCode].filter(Boolean).join(', ');
    
    // Extract basic property details using meta tags
    const price = document.querySelector('meta[name="twitter:text:price"]')?.content;
    const beds = document.querySelector('meta[name="twitter:text:beds"]')?.content;
    const baths = document.querySelector('meta[name="twitter:text:baths"]')?.content;
    const sqft = document.querySelector('meta[name="twitter:text:sqft"]')?.content;
    
    // Extract property type, year built, etc. from the house-info section
    const houseInfoDiv = document.getElementById('house-info');
    let propertyType = null;
    let yearBuilt = null;
    let lotSize = null;
    
    if (houseInfoDiv) {
      const houseInfoText = houseInfoDiv.textContent;
      
      // Extract property type using regex
      const propertyTypeMatch = /((Single-family|Townhouse|Condo|Multi-family))/i.exec(houseInfoText);
      propertyType = propertyTypeMatch ? propertyTypeMatch[1] : null;
      
      // Extract year built using regex
      const yearBuiltMatch = /Built in (\d{4})/i.exec(houseInfoText);
      yearBuilt = yearBuiltMatch ? yearBuiltMatch[1] : null;
      
      // Extract lot size using regex
      const lotSizeMatch = /(?<!Built in )(\d{1,3}(?:,\d{3})*) sq ft lot/i.exec(houseInfoText);
      lotSize = lotSizeMatch ? lotSizeMatch[1] + ' sq ft' : null;

      const remarksElement = document.getElementById('marketing-remarks-scroll');
      propertyDescription = remarksElement.textContent.trim();
    }
    
    // Extract images
    let images = Array.from(
      document.querySelectorAll('meta[name^="twitter:image:photo"]')
    ).map(meta => meta.content);
    
    console.log(`Found ${images.length} images from meta tags`);
    
    // STEP 2: Check if we've successfully extracted gallery images before
    try {
      const photoButton = document.querySelector('#photoPreviewButton button, div[data-buttonenum="photos"] button');
      
      if (photoButton) {
        console.log(`Found photo button: ${photoButton.textContent}`);
        
        // Try to click the button
        photoButton.click();
        console.log("Successfully clicked the photo button");
        
        // Wait a bit and try to extract gallery images
        setTimeout(() => {
          try {
            const galleryImages = Array.from(document.querySelectorAll('[id^="MB-image-card-"] img'))
              .map(img => img.src)
              .filter(url => url && url.includes('cdn-redfin.com'));
              
            console.log(`Found ${galleryImages.length} gallery images`);
            
            // Store these for future use
            window.redfinGalleryImages = galleryImages;
            
            closeGallery();
          } catch (extractError) {
            console.log(`Error extracting gallery images: ${extractError.message}`);
          }
        }, 2000);
      } else {
        console.log("Photo button not found");
      }
    } catch (buttonError) {
      console.log(`Error with photo button: ${buttonError.message}`);
    }


    if (window.redfinGalleryImages && window.redfinGalleryImages.length > 0) {
      console.log(`Adding ${window.redfinGalleryImages.length} previously extracted gallery images`);
      images = [...images, ...window.redfinGalleryImages];
    }
    
    // Return structured data
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
      propertyDescription,
      images: images.slice(0, 20)
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

function closeGallery() {
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    keyCode: 27,
    which: 27,
    bubbles: true
  }));
  
}