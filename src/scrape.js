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
// REDFIN SCRAPER (REVISED v10 - Focus on Stable Core Data + Estimate/Images)
// ==========================================================================
function extractRedfinData() {
  console.log("[Scrape.js] Starting extractRedfinData (Revised v10 - Stability Focus)...");

  let data = {
      address: 'Address not found', price: null, beds: null, baths: null, sqft: null,
      yearBuilt: null, lotSize: null, homeType: null,
      description: null, hoaFee: null, propertyTax: null, images: [],
      source: 'redfin', url: window.location.href, timestamp: new Date().toISOString(),
      estimate: null, estimatePerSqft: null,
      // --- Keep these minimal for now ---
      interiorFeatures: {}, parkingFeatures: { details: null }, // Only capture basic parking string
      communityFeatures: { schools: [] },
      priceHistory: [], taxHistory: [], daysOnMarket: null,
      constructionDetails: {}, utilityDetails: {},
      listingAgent: null, listingBrokerage: null,
      additionalDetails: {}, error: null
   };

  // --- Helper Functions ---
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
   function formatPrice(value) {
      const num = safeParseInt(value);
      return num ? `$${num.toLocaleString()}` : null;
   }

  // OUTER TRY-CATCH
  try {
      // --- 1. META TAGS (Address, Initial Price/Beds/Baths/Sqft/Image) ---
      console.log("[Scrape.js] 1. Extracting from META tags...");
      try {
          data.address = [
              document.querySelector('meta[name="twitter:text:street_address"]')?.content,
              document.querySelector('meta[name="twitter:text:city"]')?.content,
              document.querySelector('meta[name="twitter:text:state_code"]')?.content,
              document.querySelector('meta[name="twitter:text:zip"]')?.content
          ].filter(Boolean).join(', ').trim() || data.address;

          data.price = formatPrice(document.querySelector('meta[name="twitter:text:price"]')?.content);
          data.beds = safeParseFloat(document.querySelector('meta[name="twitter:text:beds"]')?.content);
          data.baths = safeParseFloat(document.querySelector('meta[name="twitter:text:baths"]')?.content);
          data.sqft = safeParseInt(document.querySelector('meta[name="twitter:text:sqft"]')?.content);

          let metaImages = Array.from(document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], meta[name="twitter:image:src"]')).map(meta => meta.content).filter(Boolean);
          data.images = [...new Set(metaImages)];
          console.log(`[Scrape.js] Meta Data Found - Addr OK: ${data.address !== 'Address not found'}, Price: ${!!data.price}, Beds: ${data.beds}, Baths: ${data.baths}, SqFt: ${data.sqft}, Imgs: ${data.images.length}`);
      } catch (metaError) {
           console.error("[Scrape.js] Error during META tag extraction:", metaError.message);
           // Continue even if meta tags fail
      }

      // --- 2. JSON DATA (__reactServerState) ---
      console.log("[Scrape.js] 2. Searching for and processing __reactServerState JSON...");
      let serverData = null;
      try {
          const scripts = document.querySelectorAll('script');
          let serverStateJsonString = null;
          scripts.forEach((script) => {
              if (!serverData && script.textContent.includes('root.__reactServerState =')) {
                  const match = script.textContent.match(/root\.__reactServerState\s*=\s*({.*);?\s*$/s);
                  if (match && match[1]) {
                      serverStateJsonString = match[1];
                      if (serverStateJsonString.endsWith(';')) serverStateJsonString = serverStateJsonString.slice(0, -1);
                  }
              }
          });
          if (serverStateJsonString) {
              serverData = JSON.parse(serverStateJsonString);
              console.log("[Scrape.js] Parsed serverData JSON.");
          } else {
              console.log("[Scrape.js] __reactServerState JSON content not found.");
          }
      } catch (jsonError) {
           console.error('[Scrape.js] Error finding/parsing Redfin JSON:', jsonError.message);
           serverData = null;
      }

      // --- 3. Extract Core Fields from JSON (if available) ---
      if (serverData) {
          console.log("[Scrape.js] 3. Extracting core fields from JSON...");
          const dataCache = serverData?.InitialContext?.ReactServerAgent?.cache?.dataCache;
          const getPayload = (apiPath) => dataCache?.[apiPath]?.res?.payload;
          const aboveTheFoldPayload = getPayload("\u002Fstingray\u002Fapi\u002Fhome\u002Fdetails\u002FaboveTheFold");

          if (aboveTheFoldPayload?.addressSectionInfo) {
              const addrInfo = aboveTheFoldPayload.addressSectionInfo;
              data.price = formatPrice(addrInfo.priceInfo?.amount) ?? data.price;
              data.beds = addrInfo.beds ?? data.beds;
              data.baths = addrInfo.baths ?? data.baths;
              data.sqft = addrInfo.sqFt?.value ?? data.sqft;
              if (data.address === 'Address not found') {
                  data.address = addrInfo.streetAddress?.assembledAddress || data.address;
              }
          }
           const estimateValue = aboveTheFoldPayload?.avmInfo?.predictedValue;
           if (estimateValue !== undefined && estimateValue !== null) {
              data.estimate = safeParseInt(estimateValue);
           }
           const photos = aboveTheFoldPayload?.mediaBrowserInfo?.photos;
           if (photos && Array.isArray(photos) && photos.length > 0) {
              const jsonImages = [];
              photos.forEach((p) => {
                  const urls = p?.photoUrls;
                  if (urls) { 
                      const urlToAdd = urls.fullScreenPhotoUrl?.replace(/p_[a-z]/, 'p_l') || urls.fullScreenPhotoUrl || urls.largePhotoUrl || urls.nonFullScreenPhotoUrl;
                      if (urlToAdd) jsonImages.push(urlToAdd);
                  }
              });
              if (jsonImages.length > 0) {
                  data.images = [...new Set([...jsonImages, ...data.images])]; 
              }
           }
      }

      // --- ADD THIS LOGGING LINE ---
      console.log(`[Scrape.js DEBUG] Price after JSON extraction: ${data.price}`);

      // --- 4. HTML FALLBACKS (For core fields missed by Meta/JSON) ---
      console.log("[Scrape.js] 4. Running HTML fallbacks...");
      const descriptionSelectors = ['.remarksContainer .remarks span', '#marketing-remarks-scroll', '.ListingRemarks .text-base', 'p.marketingRemarks', 'meta[name="description"]'];
      for (const selector of descriptionSelectors) {
           const element = document.querySelector(selector);
           if (element) {
               let descText = element.tagName === 'META' ? element.content?.split('. MLS#')[0].trim() : element.textContent.trim();
               if (descText) {
                   data.description = descText;
                   break;
               }
           }
       }
       document.querySelectorAll('.KeyDetailsTable .keyDetails-row').forEach(row => {
          const valueElement = row.querySelector('.keyDetails-value');
          if (!valueElement) return;
          const valueText = valueElement.querySelector('.valueText')?.textContent.trim();
          const valueType = valueElement.querySelector('.valueType')?.textContent.trim()?.toLowerCase();
          if (valueText && valueType) {
              if (!data.daysOnMarket && valueType.includes('on redfin')) data.daysOnMarket = safeParseInt(valueText);
              if (!data.homeType && valueType.includes('property type')) data.homeType = valueText;
              if (!data.yearBuilt && valueType.includes('year built')) data.yearBuilt = safeParseInt(valueText);
              if (!data.lotSize && valueType.includes('lot size')) data.lotSize = `${valueText} ${valueType.split(' ')[1] || 'sq ft'}`;
              if (!data.estimatePerSqft && valueType.includes('price/sq.ft.')) data.estimatePerSqft = safeParseInt(valueText);
              if (!data.parkingFeatures.details && valueType.includes('parking')) data.parkingFeatures.details = valueText;
          }
      });
       const statsPanel = document.querySelector('.stats-panel');
       if (statsPanel) {
           const statsRows = statsPanel.querySelectorAll('.stats-row');
           statsRows.forEach(row => {
               const label = row.querySelector('.stats-label')?.textContent;
               if (label && label.toLowerCase().includes('price per sq ft')) {
                   const value = row.querySelector('.stats-value')?.textContent;
                   data.estimatePerSqft = safeParseInt(value);
               }
           });
       }
       if (!data.listingAgent) data.listingAgent = document.querySelector('.listing-agent-item .agent-basic-details--heading span')?.textContent?.trim();
       if (!data.listingBrokerage) data.listingBrokerage = document.querySelector('.listing-agent-item .agent-basic-details--broker span')?.textContent?.trim()?.replace(/^•\s*/, '');
      if (!data.estimate) {
          const estimateElement = document.querySelector('.DPRedfinEstimateSection .homeCellValue, [data-rf-test-id="avm-price"] .value');
          if (estimateElement) data.estimate = safeParseInt(estimateElement.textContent);
      }
       if (data.estimate && !data.estimatePerSqft && data.sqft) {
          const numericSqft = safeParseInt(data.sqft);
          if (numericSqft > 0) data.estimatePerSqft = Math.round(data.estimate / numericSqft);
       }

      const historyTable = document.querySelector('.PropertyHistory--content');
      if (historyTable) {
          const historyRows = historyTable.querySelectorAll('tbody tr');
          historyRows.forEach((row, index) => {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 3) {
                  const eventData = {
                      date: cells[0]?.textContent.trim(),
                      event: cells[1]?.textContent.trim(),
                      price: safeParseInt(cells[2]?.textContent.trim())
                  };
                  if (eventData.date && eventData.price) {
                      data.priceHistory.push(eventData);
                  }
              }
          });
      }

      // --- 5. Final Data Cleaning ---
      if (data.price && typeof data.price === 'string' && !data.price.startsWith('$')) data.price = formatPrice(data.price); // Ensure $ formatting
      data.beds = safeParseFloat(data.beds); data.baths = safeParseFloat(data.baths); data.sqft = safeParseInt(data.sqft); data.yearBuilt = safeParseInt(data.yearBuilt); data.estimate = safeParseInt(data.estimate); data.estimatePerSqft = safeParseInt(data.estimatePerSqft); data.propertyTax = safeParseInt(data.propertyTax); data.daysOnMarket = safeParseInt(data.daysOnMarket);
      if (data.parkingFeatures && typeof data.parkingFeatures !== 'string') {
           data.parkingFeatures.details = data.parkingFeatures.details || null;
      }
      data.images = data.images.slice(0, 20);

  } catch (error) {
      console.error('[Scrape.js] CRITICAL Error during extractRedfinData execution:', error.message, error.stack);
      data.error = `Scraping failed critically inside extractRedfinData: ${error.message}`;
  }

  // --- ADD THIS LOGGING LINE ---
  console.log(`[Scrape.js DEBUG] FINAL DATA being sent: Price=${data.price}, Images Found=${data.images.length}`);

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
                 const findPropertyData = (obj) => {
                     if (typeof obj !== 'object' || obj === null) return null;
                     if (obj.zpid && obj.streetAddress && obj.homeStatus && obj.price) {
                          return obj;
                     }
                     if (obj?.gdpClientCache) { 
                         const cacheKey = Object.keys(obj.gdpClientCache).find(k => k.includes('Property') || k.includes('ForSale'));
                         if (cacheKey && obj.gdpClientCache[cacheKey]?.property) return obj.gdpClientCache[cacheKey].property;
                     }
  
                     for(const key in obj) {
                         if (typeof obj[key] === 'object') {
                             const result = findPropertyData(obj[key]);
                             if (result) return result;
                         }
                     }
                     return null;
                 };
  
                 hdpData = findPropertyData(rawHdpJson);
  
                 if (!hdpData) {
                     console.log("[Scrape.js] Could not automatically locate the main property data structure within hdpApolloPreloadedData. Will rely more on HTML.");
                 } else {
                     console.log("[Scrape.js] Located and assigned main property data object from JSON.");
                 }
  
            } catch (jsonError) {
                 console.error('[Scrape.js] Error parsing/processing Zillow JSON (hdpApolloPreloadedData):', jsonError.message);
                 hdpData = null;
                 rawHdpJson = null;
            }
        } else {
             console.log("[Scrape.js] hdpApolloPreloadedData script tag not found.");
        }
  
        // --- Extract Data from Zillow JSON (hdpData) if available ---
        if (hdpData) {
             console.log("[Scrape.js] Processing parsed Zillow hdpData property object...");
             const facts = hdpData.resoFacts || {};
  
             data.address = hdpData.streetAddress ? `${hdpData.streetAddress}, ${hdpData.city}, ${hdpData.state} ${hdpData.zipcode}` : data.address;
             data.price = safeParseInt(hdpData.price) || data.price;
             data.beds = safeParseFloat(hdpData.bedrooms) || data.beds;
             data.baths = safeParseFloat(hdpData.bathrooms) || data.baths;
             data.sqft = safeParseInt(hdpData.livingArea || facts.livingArea) || data.sqft;
             data.yearBuilt = safeParseInt(hdpData.yearBuilt || facts.yearBuilt) || data.yearBuilt;
             data.lotSize = hdpData.lotSize || facts.lotSize || data.lotSize;
             if (facts.lotSizeUnit && data.lotSize) data.lotSize = `${data.lotSize} ${facts.lotSizeUnit}`;
             data.homeType = hdpData.homeType || facts.propertySubType || data.homeType;
             data.description = hdpData.description || data.description;
             data.hoaFee = facts.hoaFee || data.hoaFee;
             if (facts.hoaFeeUnit && data.hoaFee) data.hoaFee = `${data.hoaFee}/${facts.hoaFeeUnit}`;
             data.propertyTax = safeParseInt(facts.taxAnnualAmount) || data.propertyTax;
  
             data.estimate = safeParseInt(hdpData.zestimate || facts.zestimate) || data.estimate;
             if (data.estimate && data.sqft) {
                 const numericSqft = safeParseInt(data.sqft);
                 if (numericSqft > 0) data.estimatePerSqft = Math.round(data.estimate / numericSqft);
             }
  
             const photos = hdpData.photos || hdpData.hugePhotos || hdpData.originalPhotos || [];
             if (photos.length > 0) {
                 const jsonImages = photos.map(p => p?.url || p?.mixedSources?.jpeg?.[p?.mixedSources?.jpeg?.length - 1]?.url).filter(Boolean);
                 if (jsonImages.length > 0) data.images = [...new Set([...jsonImages, ...data.images])];
             }
  
            if(facts) {
                 data.interiorFeatures.appliances = facts.appliances?.join(', ') || facts.appliancesIncluded;
                 data.interiorFeatures.flooring = facts.flooring?.join(', ');
                 data.interiorFeatures.cooling = facts.coolingSystems?.join(', ') || facts.cooling;
                 data.interiorFeatures.heating = facts.heatingSystems?.join(', ') || facts.heating;
                 data.interiorFeatures.fireplace = facts.fireplaces || facts.fireplaceFeatures;
                 data.interiorFeatures.other = facts.interiorFeatures?.join(', ');
                 data.parkingFeatures.details = facts.parkingFeatures?.join(', ');
                 data.parkingFeatures.garageSpaces = facts.garageSpaces;
                 data.parkingFeatures.totalSpaces = facts.parkingTotalSpaces || facts.parking?.spaces;
                 data.parkingFeatures.hasGarage = facts.parking?.hasGarage;
                 data.constructionDetails.roof = facts.roofType?.join(', ');
                 data.constructionDetails.foundation = facts.foundationDetails?.join(', ');
                 data.constructionDetails.materials = facts.constructionMaterials?.join(', ');
                 data.constructionDetails.exterior = facts.exteriorFeatures?.join(', ');
                 data.utilityDetails.water = facts.waterSource?.join(', ');
                 data.utilityDetails.sewer = facts.sewer?.join(', ');
                 const commonFactKeys = ['livingArea','yearBuilt','lotSize','propertySubType','hoaFee','taxAnnualAmount','zestimate','bedrooms','bathrooms', 'appliances','flooring','coolingSystems','heatingSystems','fireplaces','interiorFeatures','parkingFeatures','garageSpaces','parkingTotalSpaces','roofType','foundationDetails','constructionMaterials','exteriorFeatures','waterSource','sewer'];
                 Object.entries(facts).forEach(([key, value]) => {
                     if (!commonFactKeys.includes(key) && value && typeof value !== 'object') {
                         data.additionalDetails[key] = value;
                     }
                 });
            }
  
             data.communityFeatures.walkScore = hdpData.walkScore?.walkscore;
             data.communityFeatures.transitScore = hdpData.transitScore?.transitScore;
             if(hdpData.schools?.length > 0) {
                 data.communityFeatures.schools = hdpData.schools.map(s => ({ name: s.name, rating: s.rating, distance: s.distance }));
             }
  
             if (hdpData.priceHistory && Array.isArray(hdpData.priceHistory)) {
                 data.priceHistory = hdpData.priceHistory.map(e => ({
                     date: e.date || e.time,
                     price: safeParseInt(e.price),
                     event: e.event || e.priceChangeReason
                 })).filter(e => e.date && e.price);
                 data.priceHistory.forEach(e => {
                     if (typeof e.date === 'number' && e.date > 1000000000) {
                         try { e.date = new Date(e.date).toISOString().split('T')[0]; } catch { /* ignore */ }
                     }
                 });
             }
  
             if (hdpData.taxHistory && Array.isArray(hdpData.taxHistory)) {
                 data.taxHistory = hdpData.taxHistory.map(t => ({
                     year: safeParseInt(t.time),
                     taxAmount: safeParseInt(t.taxPaid),
                     assessment: safeParseInt(t.value)
                 })).filter(t => t.year && (t.taxAmount || t.assessment));
                 if (!data.propertyTax && data.taxHistory.length > 0) {
                     const latestTax = data.taxHistory.sort((a, b) => b.year - a.year)[0];
                     if (latestTax.taxAmount) data.propertyTax = latestTax.taxAmount;
                 }
             }
  
             data.daysOnMarket = safeParseInt(hdpData.daysOnZillow || facts.daysOnMarket);
  
              const attributionInfo = hdpData.attributionInfo || hdpData.listingProvider;
              if (attributionInfo) {
                  data.listingAgent = attributionInfo.agentName || attributionInfo.listingAgentName;
                  data.listingBrokerage = attributionInfo.brokerName || attributionInfo.brokerageName || attributionInfo.listingBrokerageName;
              }
  
        } else {
             console.log("[Scrape.js] Zillow hdpData property object not available. Relying heavily on HTML scraping.");
        }
  
         console.log("[Scrape.js] Extracting/Supplementing Zillow details from HTML elements...");
  
        if (data.address === 'Address not found') {
            data.address = document.querySelector('[data-testid="address"]')?.textContent || document.querySelector('h1[class*="addr"]')?.textContent || document.title.split('|')[0].trim();
        }
        if (!data.beds) data.beds = safeParseFloat(document.querySelector('[data-testid="bed-bath-item"] span')?.textContent.split(' ')[0]);
        if (!data.baths) data.baths = safeParseFloat(document.querySelectorAll('[data-testid="bed-bath-item"] span')[1]?.textContent.split(' ')[0]);
        if (!data.sqft) data.sqft = safeParseInt(document.querySelectorAll('[data-testid="bed-bath-item"] span')[2]?.textContent.split(' ')[0]);
  
        if (!data.estimate) {
             data.estimate = safeParseInt(document.querySelector('[data-testid="zestimate-value"]')?.textContent);
        }
        if (!data.estimatePerSqft) {
             const pricePerSqftText = document.querySelector('[data-testid="price-per-square-foot"]')?.textContent || document.querySelector('span[class*="PricePerSqft"]')?.textContent;
             if(pricePerSqftText) {
                data.estimatePerSqft = safeParseInt(pricePerSqftText);
                 if (!data.estimate && data.estimatePerSqft && data.sqft) {
                     const numericSqft = safeParseInt(data.sqft);
                     if (numericSqft > 0) data.estimate = data.estimatePerSqft * numericSqft;
                 }
             }
        }
  
        const detailItems = document.querySelectorAll('ul[class*="HomeDetails"] li, div[class*="fact-list"] div, .hdp__sc-details-list__item, [data-testid="facts-and-features"] ul li');
        if (detailItems.length > 0 && !hdpData) console.log(`[Scrape.js] Processing ${detailItems.length} detail list items from HTML...`);
        detailItems.forEach(item => {
             const textContent = item.textContent?.trim() || '';
             const parts = textContent.split(':');
             const label = parts[0]?.trim().toLowerCase();
             const value = parts.slice(1).join(':')?.trim();
  
             if (!label || !value) return;
  
             if (!data.yearBuilt && label.includes('built in')) data.yearBuilt = safeParseInt(value);
             if (!data.homeType && label === ('type')) data.homeType = value;
             if (!data.lotSize && label.includes('lot size')) data.lotSize = value;
             if (!data.hoaFee && label === ('hoa')) data.hoaFee = value;
             if (!data.propertyTax && label.includes('annual tax amount')) data.propertyTax = safeParseInt(value);
             if (!data.interiorFeatures.cooling && label.includes('cooling features')) data.interiorFeatures.cooling = value;
             if (!data.interiorFeatures.heating && label.includes('heating features')) data.interiorFeatures.heating = value;
             if (!data.interiorFeatures.appliances && label.includes('appliances included')) data.interiorFeatures.appliances = value;
             if (!data.interiorFeatures.flooring && label === ('flooring')) data.interiorFeatures.flooring = value;
             if (!data.parkingFeatures.details && label.includes('parking features')) data.parkingFeatures.details = value;
             if (!data.parkingFeatures.garageSpaces && label.includes('garage spaces')) data.parkingFeatures.garageSpaces = value;
             if (!data.constructionDetails.roof && label.includes('roof')) data.constructionDetails.roof = value;
             if (!data.constructionDetails.foundation && label.includes('foundation')) data.constructionDetails.foundation = value;
             if (!data.constructionDetails.materials && label.includes('construction materials')) data.constructionDetails.materials = value;
             if (!data.constructionDetails.exterior && label.includes('exterior features')) data.constructionDetails.exterior = value;
             if (!data.utilityDetails.water && label.includes('water source')) data.utilityDetails.water = value;
             if (!data.utilityDetails.sewer && label.includes('sewer information')) data.utilityDetails.sewer = value;
  
             const knownLabels = ['built in','type','lot size','hoa','annual tax amount','cooling','heating','appliances','flooring','parking','garage','roof','foundation','construction','exterior','water','sewer'];
             if (!knownLabels.some(kl => label.includes(kl))) {
                 data.additionalDetails[label.replace(/\s+/g, '_')] = value;
             }
        });
  
        if (!data.description) {
            data.description = document.querySelector('[data-testid="description"] span')?.textContent ||
                               (document.querySelector('div[class*="Text-c11n-"]')?.textContent) ||
                               document.querySelector('meta[name="description"]')?.content;
        }
  
         if (data.images.length === 0) {
             const imageElements = document.querySelectorAll('ul[class*="photo-tile-list"] img, div[class*="carousel-photo"] img, [data-testid="media-stream"] img');
             if(imageElements.length > 0) {
                  data.images = Array.from(imageElements).map(img => img.src || img.getAttribute('data-src')).filter(Boolean);
                  data.images = [...new Set(data.images)];
             }
         }
  
         if (data.priceHistory.length === 0) {
             const historyContainer = document.querySelector('[data-testid="price-history-container"]');
             if (historyContainer) {
                 const historyRows = historyContainer.querySelectorAll('tbody tr');
                 if (historyRows.length > 0) {
                     historyRows.forEach(row => {
                         const cells = row.querySelectorAll('td');
                         if (cells.length >= 3) {
                             data.priceHistory.push({
                                 date: cells[0]?.textContent?.trim(),
                                 event: cells[1]?.textContent?.trim(),
                                 price: safeParseInt(cells[2]?.textContent)
                             });
                         }
                     });
                     data.priceHistory = data.priceHistory.filter(e => e.date && e.price);
                 }
             }
         }
  
         if (data.taxHistory.length === 0) {
             const taxContainer = document.querySelector('[data-testid="TaxHistory"]');
             if (taxContainer) {
                  const taxRows = taxContainer.querySelectorAll('tbody tr');
                  if (taxRows.length > 0) {
                      taxRows.forEach(row => {
                          const cells = row.querySelectorAll('td');
                          if (cells.length >= 2) {
                               data.taxHistory.push({
                                   year: safeParseInt(cells[0]?.textContent),
                                   taxAmount: safeParseInt(cells[1]?.textContent),
                                   assessment: cells.length > 2 ? safeParseInt(cells[2]?.textContent) : null
                               });
                          }
                      });
                      data.taxHistory = data.taxHistory.filter(t => t.year && (t.taxAmount || t.assessment));
                      if (!data.propertyTax && data.taxHistory.length > 0) {
                          const latestTax = data.taxHistory.sort((a, b) => b.year - a.year)[0];
                          if (latestTax.taxAmount) data.propertyTax = latestTax.taxAmount;
                      }
                  }
             }
         }
  
         if (data.daysOnMarket === null) {
              const domElement = document.querySelector('[data-testid="DaysOnZillow"] .Text-c11n-8-101-0__sc-aiai24-0');
              if (domElement) {
                  data.daysOnMarket = safeParseInt(domElement.textContent);
              }
         }
  
         if (!data.listingAgent && !data.listingBrokerage) {
             data.listingAgent = document.querySelector('[data-testid="attribution-agent-name"]')?.textContent?.trim();
             data.listingBrokerage = document.querySelector('[data-testid="attribution-broker-name"]')?.textContent?.trim();
             if (!data.listingAgent) data.listingAgent = document.querySelector('.listing-attribution__agent-name')?.textContent?.trim();
             if (!data.listingBrokerage) data.listingBrokerage = document.querySelector('.listing-attribution__broker-name')?.textContent?.trim();
         }
  
        data.sqft = safeParseInt(data.sqft);
        data.yearBuilt = safeParseInt(data.yearBuilt);
        data.estimate = safeParseInt(data.estimate);
        data.estimatePerSqft = safeParseInt(data.estimatePerSqft);
        data.propertyTax = safeParseInt(data.propertyTax);
        data.daysOnMarket = safeParseInt(data.daysOnMarket);
        data.images = data.images.slice(0, 20);
  
  
    } catch (error) {
        console.error('[Scrape.js] CRITICAL Error during extractZillowData execution:', error.message, error.stack);
        data.error = `Scraping failed critically inside extractZillowData: ${error.message}`;
    }
  
     console.log("[Scrape.js] Returning final data object from Zillow:", {
         ...data,
         images: `[${data.images.length} images]`,
         priceHistory: `[${data.priceHistory.length} events]`,
         taxHistory: `[${data.taxHistory.length} entries]`,
         interiorFeatures: JSON.stringify(data.interiorFeatures),
         parkingFeatures: JSON.stringify(data.parkingFeatures),
         communityFeatures: JSON.stringify(data.communityFeatures),
         constructionDetails: JSON.stringify(data.constructionDetails),
         utilityDetails: JSON.stringify(data.utilityDetails),
         additionalDetails: JSON.stringify(data.additionalDetails)
     });
    return data;
  }
  
  
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
        return {
            address: 'Address not found', price: null, beds: null, baths: null, sqft: null, yearBuilt: null, lotSize: null, homeType: null, description: null, hoaFee: null, propertyTax: null, images: [], source: 'unknown', url: url, timestamp: new Date().toISOString(), estimate: null, estimatePerSqft: null, interiorFeatures: {}, parkingFeatures: {}, communityFeatures: {}, priceHistory: [], taxHistory: [], daysOnMarket: null, constructionDetails: {}, utilityDetails: {}, listingAgent: null, listingBrokerage: null, additionalDetails: {}, error: `Unsupported website: ${url}. Only Redfin and Zillow are supported.`
        };
    }
  })();
