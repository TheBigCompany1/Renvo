// Updated src/scrape.js - Incorporating more data points

// Function to determine the source website
function getDataSource(url) {
    if (url.includes('redfin.com')) return 'redfin';
    if (url.includes('zillow.com')) return 'zillow';
    return 'unknown';
  }
  
  // Helper to safely parse numeric values
  function safeParseInt(value) {
    if (value === null || value === undefined) return null;
    const cleaned = String(value).replace(/[^0-9]/g, '');
    return cleaned ? parseInt(cleaned, 10) : null;
  }
  function safeParseFloat(value) {
    if (value === null || value === undefined) return null;
     // Keep decimal point and numbers
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    return cleaned ? parseFloat(cleaned) : null;
  }
  
  // ==========================================================================
// REDFIN SCRAPER (REVISED v12 - FINAL)
// ==========================================================================
function extractRedfinData() {
    console.log("[Scrape.js] Starting extractRedfinData (v12 - Final)...");
  
    let data = {
        address: 'Address not found', price: null, beds: null, baths: null, sqft: null,
        yearBuilt: null, lotSize: null, homeType: null,
        description: null, images: [],
        source: 'redfin', url: window.location.href, timestamp: new Date().toISOString(),
        error: null
     };
  
     // Using your existing helper functions
     function safeParseInt(value) {
        if (value === null || value === undefined) return null;
        const cleaned = String(value).replace(/[^0-9]/g, '');
        return cleaned ? parseInt(cleaned, 10) : null;
     }
     function safeParseFloat(value) {
        if (value === null || value === undefined) return null;
        const cleaned = String(value).replace(/[^0-9.]/g, '');
        return cleaned ? parseFloat(cleaned) : null;
     }
  
    try {
        // --- 1. CORE DETAILS (Address, Beds, Baths, SqFt) ---
        // These selectors are more robust than meta tags for core details.
        data.address = document.querySelector('.address-section .homeAddress span')?.textContent || 'Address not found';
        data.beds = safeParseFloat(document.querySelector('[data-testid="beds-value"]')?.textContent);
        data.baths = safeParseFloat(document.querySelector('[data-testid="baths-value"]')?.textContent);
        data.sqft = safeParseInt(document.querySelector('[data-testid="sqft-value"] span')?.textContent) || 
                    safeParseInt(document.querySelector('meta[name="twitter:text:sqft"]')?.content);
  
        // --- 2. FIX FOR PRICE ---
        // Prioritize the visible price element, falling back to your original method.
        const priceElement = document.querySelector('[data-testid="price-wrapper"] [data-testid="price"]');
        if (priceElement) {
            data.price = safeParseInt(priceElement.textContent);
        } else {
            console.log("[Scrape.js] Primary price element not found, falling back to meta tag.");
            data.price = safeParseInt(document.querySelector('meta[name="twitter:text:price"]')?.content);
        }
  
        // --- 3. FIX FOR IMAGES ---
        // Use a more direct method to get all images from the page.
        let collectedImages = new Set();
        try {
            // Primary Method: Scrape the main photo carousel/gallery on the page.
            document.querySelectorAll('.ImageCarousel .carousel-photo img, .inline-gallery-photo-item img, .Photo-ScrollView img').forEach(img => {
                if (img.src && !img.src.includes('maps.googleapis.com')) {
                    // Request a full-size image instead of a thumbnail
                    collectedImages.add(img.src.replace('p_l.jpg', 'p_f.jpg')); 
                }
            });
            console.log(`[Scrape.js] Found ${collectedImages.size} images from primary HTML carousels.`);
        } catch (e) { console.error("Error scraping carousels:", e); }
        
        // Fallback: If no images were found, try your original meta tag method.
        if (collectedImages.size === 0) {
            console.warn("[Scrape.js] No images in carousel, falling back to meta tags.");
            document.querySelectorAll('meta[property="og:image"]').forEach(meta => {
                if (meta.content && !meta.content.includes('logo')) {
                    collectedImages.add(meta.content);
                }
            });
        }
        data.images = Array.from(collectedImages).slice(0, 15); // Limit to 15 images
  
        // --- 4. OTHER DETAILS (Using your existing stable logic) ---
        data.description = document.querySelector('.remarksContainer .remarks span')?.textContent.trim();
        document.querySelectorAll('.KeyDetailsTable .keyDetails-row').forEach(row => {
            const label = row.querySelector('.keyDetails-label')?.textContent.toLowerCase();
            const value = row.querySelector('.keyDetails-value')?.textContent;
            if (label && value) {
                if (label.includes('year built')) data.yearBuilt = safeParseInt(value);
                if (label.includes('lot size')) data.lotSize = value;
                if (label.includes('property type')) data.homeType = value;
            }
        });
  
    } catch (error) {
        console.error('[Scrape.js] CRITICAL Error during extractRedfinData:', error.message);
        data.error = `Scraping failed critically: ${error.message}`;
    }
  
    console.log(`[Scrape.js] FINAL: Returning data. Images: ${data.images.length}. Price: ${data.price}. SqFt: ${data.sqft}`);
    return data;
  }
  
  // ==========================================================================
  // ZILLOW SCRAPER
  // ==========================================================================
  function extractZillowData() {
    console.log("[Scrape.js] Starting extractZillowData (Enhanced Version 2 - More Data)...");
  
    // --- Define CORE variables with defaults ---
    let data = {
        address: 'Address not found',
        price: null, beds: null, baths: null, sqft: null,
        yearBuilt: null, lotSize: null, homeType: null,
        description: null, hoaFee: null, propertyTax: null,
        images: [], source: 'zillow', url: window.location.href,
        timestamp: new Date().toISOString(),
        estimate: null, estimatePerSqft: null,
        interiorFeatures: {}, parkingFeatures: {}, communityFeatures: {},
        // --- NEW FIELDS ---
        priceHistory: [], taxHistory: [], daysOnMarket: null,
        constructionDetails: {}, utilityDetails: {},
        listingAgent: null, listingBrokerage: null,
        additionalDetails: {},
        error: null
    };
  
    try {
        // --- Attempt Zillow JSON extraction (hdpApolloPreloadedData) ---
        console.log("[Scrape.js] Searching for hdpApolloPreloadedData JSON...");
        let hdpData = null;
        let rawHdpJson = null; // Keep the raw JSON for broader searching if needed
        const scriptElement = document.getElementById('hdpApolloPreloadedData');
        if (scriptElement) {
            try {
                 console.log("[Scrape.js] Found hdpApolloPreloadedData script tag. Parsing...");
                 rawHdpJson = JSON.parse(scriptElement.textContent); // Parse the whole thing
                 console.log("[Scrape.js] Successfully parsed raw hdpApolloPreloadedData.");
  
                 // --- Find the actual property data object within the raw JSON ---
                 // Heuristic: Look for an object containing 'zpid', 'streetAddress', etc.
                 const findPropertyData = (obj) => {
                     if (typeof obj !== 'object' || obj === null) return null;
                     // More robust check for property object
                     if (obj.zpid && obj.streetAddress && obj.homeStatus && obj.price) {
                          console.log("[Scrape.js] Found likely property data object via zpid/address/status/price keys.");
                          return obj;
                     }
                     // Check specific known paths (these change often!)
                     if (obj?.gdpClientCache) { // Try drilling into client cache
                         const cacheKey = Object.keys(obj.gdpClientCache).find(k => k.includes('Property') || k.includes('ForSale'));
                         if (cacheKey && obj.gdpClientCache[cacheKey]?.property) return obj.gdpClientCache[cacheKey].property;
                     }
  
                     // Recursive search (can be slow on large JSON)
                     for(const key in obj) {
                         if (typeof obj[key] === 'object') {
                             const result = findPropertyData(obj[key]);
                             if (result) return result;
                         }
                     }
                     return null;
                 };
  
                 hdpData = findPropertyData(rawHdpJson); // Find the nested property object
  
                 if (!hdpData) {
                     console.log("[Scrape.js] Could not automatically locate the main property data structure within hdpApolloPreloadedData. Will rely more on HTML.");
                 } else {
                     console.log("[Scrape.js] Located and assigned main property data object from JSON.");
                 }
  
            } catch (jsonError) {
                 console.error('[Scrape.js] Error parsing/processing Zillow JSON (hdpApolloPreloadedData):', jsonError.message);
                 hdpData = null; // Ensure it's null if parsing fails
                 rawHdpJson = null;
            }
        } else {
             console.log("[Scrape.js] hdpApolloPreloadedData script tag not found.");
        }
  
        // --- Extract Data from Zillow JSON (hdpData) if available ---
        if (hdpData) {
             console.log("[Scrape.js] Processing parsed Zillow hdpData property object...");
             const facts = hdpData.resoFacts || {}; // Use resoFacts sub-object frequently
  
             // Address, Basic Facts (Keep previous logic, use facts object)
             data.address = hdpData.streetAddress ? `${hdpData.streetAddress}, ${hdpData.city}, ${hdpData.state} ${hdpData.zipcode}` : data.address;
             data.price = safeParseInt(hdpData.price) || data.price;
             data.beds = safeParseFloat(hdpData.bedrooms) || data.beds;
             data.baths = safeParseFloat(hdpData.bathrooms) || data.baths;
             data.sqft = safeParseInt(hdpData.livingArea || facts.livingArea) || data.sqft;
             data.yearBuilt = safeParseInt(hdpData.yearBuilt || facts.yearBuilt) || data.yearBuilt;
             data.lotSize = hdpData.lotSize || facts.lotSize || data.lotSize; // Keep as string for now
             if (facts.lotSizeUnit && data.lotSize) data.lotSize = `${data.lotSize} ${facts.lotSizeUnit}`;
             data.homeType = hdpData.homeType || facts.propertySubType || data.homeType;
             data.description = hdpData.description || data.description;
             data.hoaFee = facts.hoaFee || data.hoaFee;
             if (facts.hoaFeeUnit && data.hoaFee) data.hoaFee = `${data.hoaFee}/${facts.hoaFeeUnit}`;
             data.propertyTax = safeParseInt(facts.taxAnnualAmount) || data.propertyTax; // Annual tax amount
  
             // Estimate (Zestimate) (Keep previous)
             data.estimate = safeParseInt(hdpData.zestimate || facts.zestimate) || data.estimate;
             if (data.estimate && data.sqft) {
                 const numericSqft = safeParseInt(data.sqft);
                 if (numericSqft > 0) data.estimatePerSqft = Math.round(data.estimate / numericSqft);
                 console.log(`[Scrape.js] Zestimate / SqFt (JSON): ${data.estimate} / ${data.estimatePerSqft}`);
             } else { console.log("[Scrape.js] Zestimate not found in JSON."); }
  
             // Images (Keep previous)
             const photos = hdpData.photos || hdpData.hugePhotos || hdpData.originalPhotos || [];
             if (photos.length > 0) {
                 const jsonImages = photos.map(p => p?.url || p?.mixedSources?.jpeg?.[p?.mixedSources?.jpeg?.length - 1]?.url).filter(Boolean);
                 if (jsonImages.length > 0) data.images = [...new Set([...jsonImages, ...data.images])];
                 console.log(`[Scrape.js] Total unique images after Zillow JSON: ${data.images.length}`);
             } else { console.log("[Scrape.js] No photos found in Zillow JSON."); }
  
            // Interior Features (Keep previous, enhance from facts)
            if(facts) {
                 data.interiorFeatures.appliances = facts.appliances?.join(', ') || facts.appliancesIncluded;
                 data.interiorFeatures.flooring = facts.flooring?.join(', ');
                 data.interiorFeatures.cooling = facts.coolingSystems?.join(', ') || facts.cooling;
                 data.interiorFeatures.heating = facts.heatingSystems?.join(', ') || facts.heating;
                 data.interiorFeatures.fireplace = facts.fireplaces || facts.fireplaceFeatures; // Use features string
                 data.interiorFeatures.other = facts.interiorFeatures?.join(', ');
                 // Parking Features (Keep previous)
                 data.parkingFeatures.details = facts.parkingFeatures?.join(', ');
                 data.parkingFeatures.garageSpaces = facts.garageSpaces;
                 data.parkingFeatures.totalSpaces = facts.parkingTotalSpaces || facts.parking?.spaces;
                 data.parkingFeatures.hasGarage = facts.parking?.hasGarage;
                 // Construction Details (NEW - from facts)
                 data.constructionDetails.roof = facts.roofType?.join(', ');
                 data.constructionDetails.foundation = facts.foundationDetails?.join(', ');
                 data.constructionDetails.materials = facts.constructionMaterials?.join(', ');
                 data.constructionDetails.exterior = facts.exteriorFeatures?.join(', ');
                 // Utility Details (NEW - from facts)
                 data.utilityDetails.water = facts.waterSource?.join(', ');
                 data.utilityDetails.sewer = facts.sewer?.join(', ');
                  // Add other potentially useful facts to additionalDetails
                 const commonFactKeys = ['livingArea','yearBuilt','lotSize','propertySubType','hoaFee','taxAnnualAmount','zestimate','bedrooms','bathrooms', 'appliances','flooring','coolingSystems','heatingSystems','fireplaces','interiorFeatures','parkingFeatures','garageSpaces','parkingTotalSpaces','roofType','foundationDetails','constructionMaterials','exteriorFeatures','waterSource','sewer'];
                 Object.entries(facts).forEach(([key, value]) => {
                     if (!commonFactKeys.includes(key) && value && typeof value !== 'object') { // Add simple values
                         data.additionalDetails[key] = value;
                     }
                 });
                 console.log("[Scrape.js] Extracted interior/parking/construction/utility features from resoFacts (JSON).");
            }
  
             // Community Features (Keep previous)
             data.communityFeatures.walkScore = hdpData.walkScore?.walkscore;
             data.communityFeatures.transitScore = hdpData.transitScore?.transitScore;
             if(hdpData.schools?.length > 0) {
                 data.communityFeatures.schools = hdpData.schools.map(s => ({ name: s.name, rating: s.rating, distance: s.distance }));
                 console.log(`[Scrape.js] Found ${data.communityFeatures.schools.length} schools (Zillow JSON).`);
             }
  
             // Price History (NEW - from JSON)
             if (hdpData.priceHistory && Array.isArray(hdpData.priceHistory)) {
                 data.priceHistory = hdpData.priceHistory.map(e => ({
                     date: e.date || e.time, // Time is often epoch ms
                     price: safeParseInt(e.price),
                     event: e.event || e.priceChangeReason
                 })).filter(e => e.date && e.price);
                 // Convert epoch time if needed
                 data.priceHistory.forEach(e => {
                     if (typeof e.date === 'number' && e.date > 1000000000) { // Likely epoch ms
                         try { e.date = new Date(e.date).toISOString().split('T')[0]; } catch { /* ignore */ }
                     }
                 });
                 console.log(`[Scrape.js] Found ${data.priceHistory.length} price history events (Zillow JSON).`);
             } else { console.log("[Scrape.js] Price history not found in Zillow JSON."); }
  
            // Tax History (NEW - from JSON)
             if (hdpData.taxHistory && Array.isArray(hdpData.taxHistory)) {
                 data.taxHistory = hdpData.taxHistory.map(t => ({
                     year: safeParseInt(t.time), // Year might be in 'time'
                     taxAmount: safeParseInt(t.taxPaid),
                     assessment: safeParseInt(t.value) // Assessment might be 'value'
                 })).filter(t => t.year && (t.taxAmount || t.assessment));
                 console.log(`[Scrape.js] Found ${data.taxHistory.length} tax history entries (Zillow JSON).`);
                  // Update main tax field
                 if (!data.propertyTax && data.taxHistory.length > 0) {
                     const latestTax = data.taxHistory.sort((a, b) => b.year - a.year)[0];
                     if (latestTax.taxAmount) data.propertyTax = latestTax.taxAmount; // Store as number if possible
                 }
             } else { console.log("[Scrape.js] Tax history not found in Zillow JSON."); }
  
  
             // Days on Market (DOM) (NEW - from JSON)
             data.daysOnMarket = safeParseInt(hdpData.daysOnZillow || facts.daysOnMarket);
             if (data.daysOnMarket !== null) {
                 console.log(`[Scrape.js] Found Days on Market (Zillow JSON): ${data.daysOnMarket}`);
             } else { console.log("[Scrape.js] Days on Market not found in Zillow JSON."); }
  
             // Listing Agent/Brokerage (NEW - from JSON)
             // Often deeply nested or in separate structures, paths are guesses
              const attributionInfo = hdpData.attributionInfo || hdpData.listingProvider; // Common parent objects
              if (attributionInfo) {
                  data.listingAgent = attributionInfo.agentName || attributionInfo.listingAgentName;
                  data.listingBrokerage = attributionInfo.brokerName || attributionInfo.brokerageName || attributionInfo.listingBrokerageName;
                  if (data.listingAgent || data.listingBrokerage) console.log(`[Scrape.js] Found Listing Agent/Brokerage (Zillow JSON).`);
              } else { console.log("[Scrape.js] Listing Agent/Brokerage info not found in Zillow JSON."); }
  
        } else {
             console.log("[Scrape.js] Zillow hdpData property object not available. Relying heavily on HTML scraping.");
        }
         // --- End Zillow JSON extraction attempt ---
  
  
        // --- HTML ELEMENT SCRAPING (Zillow Fallback/Supplement) ---
         console.log("[Scrape.js] Extracting/Supplementing Zillow details from HTML elements...");
  
        // Address Fallback (Keep previous)
        if (data.address === 'Address not found') {
            data.address = document.querySelector('[data-testid="address"]')?.textContent || document.querySelector('h1[class*="addr"]')?.textContent || document.title.split('|')[0].trim();
            if(data.address !== 'Address not found') console.log(`[Scrape.js] Address found via HTML: ${data.address}`);
        }
        // Basic Facts Fallback (Keep previous)
        if (!data.beds) data.beds = safeParseFloat(document.querySelector('[data-testid="bed-bath-item"] span')?.textContent.split(' ')[0]);
        if (!data.baths) data.baths = safeParseFloat(document.querySelectorAll('[data-testid="bed-bath-item"] span')[1]?.textContent.split(' ')[0]);
        if (!data.sqft) data.sqft = safeParseInt(document.querySelectorAll('[data-testid="bed-bath-item"] span')[2]?.textContent.split(' ')[0]);
  
        // Estimate (Zestimate) Fallback (Keep previous)
        if (!data.estimate) {
             data.estimate = safeParseInt(document.querySelector('[data-testid="zestimate-value"]')?.textContent);
             if(data.estimate) console.log(`[Scrape.js] Zestimate found via HTML: ${data.estimate}`);
        }
        if (!data.estimatePerSqft) {
             const pricePerSqftText = document.querySelector('[data-testid="price-per-square-foot"]')?.textContent || document.querySelector('span[class*="PricePerSqft"]')?.textContent;
             if(pricePerSqftText) {
                data.estimatePerSqft = safeParseInt(pricePerSqftText);
                 if(data.estimatePerSqft) console.log(`[Scrape.js] Price/SqFt found via HTML: ${data.estimatePerSqft}`);
                 // Recalculate estimate if needed
                 if (!data.estimate && data.estimatePerSqft && data.sqft) {
                     const numericSqft = safeParseInt(data.sqft);
                     if (numericSqft > 0) data.estimate = data.estimatePerSqft * numericSqft;
                 }
             }
        }
  
        // Home Details Section Fallback (Enhance previous)
        const detailItems = document.querySelectorAll('ul[class*="HomeDetails"] li, div[class*="fact-list"] div, .hdp__sc-details-list__item, [data-testid="facts-and-features"] ul li'); // Added facts-and-features
        if (detailItems.length > 0 && !hdpData) console.log(`[Scrape.js] Processing ${detailItems.length} detail list items from HTML...`);
        detailItems.forEach(item => {
             const textContent = item.textContent?.trim() || '';
             const parts = textContent.split(':'); // Simple split by colon
             const label = parts[0]?.trim().toLowerCase();
             const value = parts.slice(1).join(':')?.trim(); // Join back potential colons in value
  
             if (!label || !value) return; // Skip if no label or value
  
             // Basic Info
             if (!data.yearBuilt && label.includes('built in')) data.yearBuilt = safeParseInt(value);
             if (!data.homeType && label === ('type')) data.homeType = value;
             if (!data.lotSize && label.includes('lot size')) data.lotSize = value;
             if (!data.hoaFee && label === ('hoa')) data.hoaFee = value;
             if (!data.propertyTax && label.includes('annual tax amount')) data.propertyTax = safeParseInt(value); // Store number
             // Interior
             if (!data.interiorFeatures.cooling && label.includes('cooling features')) data.interiorFeatures.cooling = value;
             if (!data.interiorFeatures.heating && label.includes('heating features')) data.interiorFeatures.heating = value;
             if (!data.interiorFeatures.appliances && label.includes('appliances included')) data.interiorFeatures.appliances = value;
             if (!data.interiorFeatures.flooring && label === ('flooring')) data.interiorFeatures.flooring = value;
             // Parking
             if (!data.parkingFeatures.details && label.includes('parking features')) data.parkingFeatures.details = value;
             if (!data.parkingFeatures.garageSpaces && label.includes('garage spaces')) data.parkingFeatures.garageSpaces = value;
             // Construction (NEW)
             if (!data.constructionDetails.roof && label.includes('roof')) data.constructionDetails.roof = value;
             if (!data.constructionDetails.foundation && label.includes('foundation')) data.constructionDetails.foundation = value;
             if (!data.constructionDetails.materials && label.includes('construction materials')) data.constructionDetails.materials = value;
             if (!data.constructionDetails.exterior && label.includes('exterior features')) data.constructionDetails.exterior = value;
             // Utilities (NEW)
             if (!data.utilityDetails.water && label.includes('water source')) data.utilityDetails.water = value;
             if (!data.utilityDetails.sewer && label.includes('sewer information')) data.utilityDetails.sewer = value;
  
             // Add other details
             const knownLabels = ['built in','type','lot size','hoa','annual tax amount','cooling','heating','appliances','flooring','parking','garage','roof','foundation','construction','exterior','water','sewer'];
             if (!knownLabels.some(kl => label.includes(kl))) {
                 data.additionalDetails[label.replace(/\s+/g, '_')] = value;
             }
        });
  
        // Description Fallback (Keep previous)
        if (!data.description) {
            data.description = document.querySelector('[data-testid="description"] span')?.textContent || // Inner span often has cleaner text
                               (document.querySelector('div[class*="Text-c11n-"]')?.textContent) ||
                               document.querySelector('meta[name="description"]')?.content;
            if(data.description) console.log(`[Scrape.js] Description found via HTML fallback.`);
        }
  
         // Image Fallback (Keep previous)
         if (data.images.length === 0) {
             const imageElements = document.querySelectorAll('ul[class*="photo-tile-list"] img, div[class*="carousel-photo"] img, [data-testid="media-stream"] img');
             if(imageElements.length > 0) {
                  data.images = Array.from(imageElements).map(img => img.src || img.getAttribute('data-src')).filter(Boolean);
                  data.images = [...new Set(data.images)];
                  if(data.images.length > 0) console.log(`[Scrape.js] Found ${data.images.length} images via HTML image tag fallback.`);
             }
         }
  
        // Price History Fallback (HTML - NEW)
         if (data.priceHistory.length === 0) {
             const historyContainer = document.querySelector('[data-testid="price-history-container"]');
             if (historyContainer) {
                 const historyRows = historyContainer.querySelectorAll('tbody tr');
                 if (historyRows.length > 0) {
                     console.log(`[Scrape.js] Attempting Price History extraction from HTML table (${historyRows.length} rows)...`);
                     historyRows.forEach(row => {
                         const cells = row.querySelectorAll('td');
                         if (cells.length >= 3) { // Expect Date, Event, Price
                             data.priceHistory.push({
                                 date: cells[0]?.textContent?.trim(),
                                 event: cells[1]?.textContent?.trim(),
                                 price: safeParseInt(cells[2]?.textContent)
                             });
                         }
                     });
                     data.priceHistory = data.priceHistory.filter(e => e.date && e.price);
                     if(data.priceHistory.length > 0) console.log(`[Scrape.js] Found ${data.priceHistory.length} price history events (HTML Fallback).`);
                 }
             }
         }
  
         // Tax History Fallback (HTML - NEW)
         if (data.taxHistory.length === 0) {
             const taxContainer = document.querySelector('[data-testid="TaxHistory"]'); // Look for specific container
             if (taxContainer) {
                  const taxRows = taxContainer.querySelectorAll('tbody tr');
                  if (taxRows.length > 0) {
                      console.log(`[Scrape.js] Attempting Tax History extraction from HTML table (${taxRows.length} rows)...`);
                      taxRows.forEach(row => {
                          const cells = row.querySelectorAll('td');
                          if (cells.length >= 2) { // Expect Year, Amount (Assessment might be separate)
                               data.taxHistory.push({
                                   year: safeParseInt(cells[0]?.textContent),
                                   taxAmount: safeParseInt(cells[1]?.textContent),
                                   // Try finding assessment if present
                                   assessment: cells.length > 2 ? safeParseInt(cells[2]?.textContent) : null
                               });
                          }
                      });
                      data.taxHistory = data.taxHistory.filter(t => t.year && (t.taxAmount || t.assessment));
                      if(data.taxHistory.length > 0) console.log(`[Scrape.js] Found ${data.taxHistory.length} tax history entries (HTML Fallback).`);
                       // Update main tax field
                      if (!data.propertyTax && data.taxHistory.length > 0) {
                          const latestTax = data.taxHistory.sort((a, b) => b.year - a.year)[0];
                          if (latestTax.taxAmount) data.propertyTax = latestTax.taxAmount;
                      }
                  }
             }
         }
  
        // DOM Fallback (HTML - NEW)
         if (data.daysOnMarket === null) {
              const domElement = document.querySelector('[data-testid="DaysOnZillow"] .Text-c11n-8-101-0__sc-aiai24-0'); // More specific selector
              if (domElement) {
                  data.daysOnMarket = safeParseInt(domElement.textContent);
                  if(data.daysOnMarket !== null) console.log(`[Scrape.js] Found Days on Market (HTML Fallback): ${data.daysOnMarket}`);
              }
         }
  
        // Listing Agent/Brokerage Fallback (HTML - NEW)
         if (!data.listingAgent && !data.listingBrokerage) {
             // Zillow often uses data-testid for attribution
             data.listingAgent = document.querySelector('[data-testid="attribution-agent-name"]')?.textContent?.trim();
             data.listingBrokerage = document.querySelector('[data-testid="attribution-broker-name"]')?.textContent?.trim();
              // Fallback to less specific selectors if needed
             if (!data.listingAgent) data.listingAgent = document.querySelector('.listing-attribution__agent-name')?.textContent?.trim();
             if (!data.listingBrokerage) data.listingBrokerage = document.querySelector('.listing-attribution__broker-name')?.textContent?.trim();
  
             if(data.listingAgent || data.listingBrokerage) console.log(`[Scrape.js] Found Listing Agent/Brokerage (HTML Fallback).`);
         }
  
  
        // --- Final Data Cleaning ---
        // beds, baths already parsed as float
        data.sqft = safeParseInt(data.sqft);
        data.yearBuilt = safeParseInt(data.yearBuilt);
        data.estimate = safeParseInt(data.estimate);
        data.estimatePerSqft = safeParseInt(data.estimatePerSqft);
        data.propertyTax = safeParseInt(data.propertyTax); // Try parsing at the end
        data.daysOnMarket = safeParseInt(data.daysOnMarket);
        data.images = data.images.slice(0, 20);
  
  
    } catch (error) {
        console.error('[Scrape.js] CRITICAL Error during extractZillowData execution:', error.message, error.stack);
        data.error = `Scraping failed critically inside extractZillowData: ${error.message}`;
    }
  
     console.log("[Scrape.js] Returning final data object from Zillow:", {
         ...data, // Spread existing data
         images: `[${data.images.length} images]`, // Avoid logging large arrays
         priceHistory: `[${data.priceHistory.length} events]`,
         taxHistory: `[${data.taxHistory.length} entries]`,
         interiorFeatures: JSON.stringify(data.interiorFeatures), // Log objects as strings
         parkingFeatures: JSON.stringify(data.parkingFeatures),
         communityFeatures: JSON.stringify(data.communityFeatures),
         constructionDetails: JSON.stringify(data.constructionDetails),
         utilityDetails: JSON.stringify(data.utilityDetails),
         additionalDetails: JSON.stringify(data.additionalDetails)
     });
    return data;
  } // End of extractZillowData
  
  
  // ==========================================================================
  // MAIN EXPORT (or execution context in Puppeteer)
  // ==========================================================================
  (() => {
    const url = window.location.href;
    const source = getDataSource(url);
    console.log(`[Scrape.js] Detected source: ${source} for URL: ${url}`);
  
    if (source === 'redfin') {
        return extractRedfinData();
    } else if (source === 'zillow') {
        return extractZillowData();
    } else {
        console.error(`[Scrape.js] Unknown or unsupported URL: ${url}`);
        // Return the full default structure for consistency
        return {
            address: 'Address not found', price: null, beds: null, baths: null, sqft: null, yearBuilt: null, lotSize: null, homeType: null, description: null, hoaFee: null, propertyTax: null, images: [], source: 'unknown', url: url, timestamp: new Date().toISOString(), estimate: null, estimatePerSqft: null, interiorFeatures: {}, parkingFeatures: {}, communityFeatures: {}, priceHistory: [], taxHistory: [], daysOnMarket: null, constructionDetails: {}, utilityDetails: {}, listingAgent: null, listingBrokerage: null, additionalDetails: {}, error: `Unsupported website: ${url}. Only Redfin and Zillow are supported.`
        };
    }
  })(); // Immediately execute the logic