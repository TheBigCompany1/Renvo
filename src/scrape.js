/**
 * @fileoverview This script is injected into a Puppeteer browser instance
 * to scrape property data from Redfin or Zillow. It determines the source
 * website and calls the appropriate extraction function.
 *
 * This version contains a robust, universal Redfin scraper that handles
 * multiple page layouts while preserving the original Zillow scraper.
 */

// Function to determine the source website based on the URL.
function getDataSource(url) {
    if (url.includes('redfin.com')) return 'redfin';
    if (url.includes('zillow.com')) return 'zillow';
    return 'unknown';
}

// Helper to safely parse a string into an integer.
function safeParseInt(value) {
    if (value === null || value === undefined) return null;
    const cleaned = String(value).replace(/[^0-9]/g, '');
    return cleaned ? parseInt(cleaned, 10) : null;
}

// Helper to safely parse a string into a float.
function safeParseFloat(value) {
    if (value === null || value === undefined) return null;
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    return cleaned ? parseFloat(cleaned) : null;
}

// ==========================================================================
// REDFIN SCRAPER (REVISED - Universal & Complete)
// ==========================================================================
function extractRedfinData() {
    console.log("[Scrape.js] Starting extractRedfinData (Universal & Complete)...");
    let data = {
        address: null, price: null, beds: null, baths: null, sqft: null,
        yearBuilt: null, lotSize: null, homeType: null, description: null, images: [],
        source: 'redfin', url: window.location.href, timestamp: new Date().toISOString(),
        error: null
    };

    try {
        // --- STAGE 1: ATTEMPT TO EXTRACT FROM EMBEDDED JSON (Primary Method) ---
        console.log("Attempting JSON parse from __INITIAL_STATE__ or __reactServerState...");
        let jsonData = null;
        const scripts = Array.from(document.querySelectorAll('script'));
        const jsonScript = scripts.find(script => script.textContent.includes('__INITIAL_STATE__') || script.textContent.includes('root.__reactServerState'));

        if (jsonScript) {
            const scriptContent = jsonScript.textContent;
            const match = scriptContent.match(/(?:window\.__INITIAL_STATE__|root\.__reactServerState)\s*=\s*(\{.*?\});?/s);
            if (match && match[1]) {
                jsonData = JSON.parse(match[1]);
                console.log("JSON parse successful.");

                const aboveTheFoldPayload = jsonData?.InitialContext?.ReactServerAgent?.cache?.dataCache?.['/stingray/api/home/details/aboveTheFold']?.res?.payload;

                if (aboveTheFoldPayload) {
                    const propertyData = aboveTheFoldPayload.addressSectionInfo || {};
                    const mainInfo = aboveTheFoldPayload.mainHouseInfo || {};
                    
                    data.address = propertyData.streetAddress?.assembledAddress || data.address;
                    data.price = safeParseInt(propertyData.priceInfo?.amount) || data.price;
                    data.beds = safeParseFloat(propertyData.beds) || data.beds;
                    data.baths = safeParseFloat(propertyData.baths) || data.baths;
                    data.sqft = safeParseInt(propertyData.sqFt?.value) || data.sqft;
                    
                    const amenities = mainInfo.amenitiesInfo?.amenities;
                    if (amenities && Array.isArray(amenities)) {
                       const yearBuiltEntry = amenities.find(a => a.header === 'Year Built');
                       if (yearBuiltEntry) data.yearBuilt = safeParseInt(yearBuiltEntry.content);

                       const lotSizeEntry = amenities.find(a => a.header === 'Lot Size');
                       if (lotSizeEntry) data.lotSize = lotSizeEntry.content;

                       const homeTypeEntry = amenities.find(a => a.header === 'Property Type');
                       if (homeTypeEntry) data.homeType = homeTypeEntry.content;
                    }

                    const photos = aboveTheFoldPayload?.mediaBrowserInfo?.photos;
                    if (photos && Array.isArray(photos) && photos.length > 0) {
                        data.images = photos.map(p => p?.photoUrls?.fullScreenPhotoUrl?.replace(/p_[a-z]/, 'p_l')).filter(Boolean);
                        console.log(`Extracted ${data.images.length} images from JSON.`);
                    }

                    console.log("Extracted primary data from JSON.", data);
                }
            } else {
                 console.log("Could not find a valid JSON object within the script tag.");
            }
        } else {
            console.log("Embedded JSON script tag not found.");
        }
    } catch (e) {
        console.error("Error during JSON parse:", e.message);
    }

    // --- STAGE 2: Resilient HTML Waterfall (Fallback Method) ---
    console.log("Falling back to HTML waterfall for missing data points...");

    // Address Waterfall
    if (!data.address) {
        const addressSelectors = [ 'h1[data-rf-test-id="abp-address"]', 'h1.font-bold', '.homeAddress span.street-address', 'meta[name="twitter:text:street_address"]' ];
        for (const selector of addressSelectors) {
            const el = document.querySelector(selector);
            if (el) {
                data.address = el.tagName === 'META' ? el.content : el.textContent.trim();
                console.log(`Address found via selector: ${selector}`);
                break;
            }
        }
    }

    // Price Waterfall - *** THIS IS THE REVISED SECTION ***
    if (!data.price) {
        // Check standard "for sale" price locations first
        const priceSelectors = [
            'div[data-testid="price"]', // Modern layout
            '.price .statsValue'       // Simplified layout
        ];
        for (const selector of priceSelectors) {
            const el = document.querySelector(selector);
            if (el) {
                data.price = safeParseInt(el.textContent);
                console.log(`Price found via selector: ${selector}`);
                break; // Exit loop once found
            }
        }

        // If still not found, check for a "sold" price banner
        if (!data.price) {
            const soldBanner = document.querySelector('.ListingStatusBannerSection');
            if (soldBanner && soldBanner.textContent.includes('SOLD')) {
                const priceMatch = soldBanner.textContent.match(/FOR \$([0-9,]+)/);
                if (priceMatch && priceMatch[1]) {
                    data.price = safeParseInt(priceMatch[1]);
                    console.log("Price found via selector: .ListingStatusBannerSection");
                }
            }
        }
        
        // Final fallback to the meta tag
        if (!data.price) {
            const metaPrice = document.querySelector('meta[name="twitter:text:price"]');
            if (metaPrice) {
                data.price = safeParseInt(metaPrice.content);
                console.log("Price found via selector: meta[name='twitter:text:price']");
            }
        }
    }

    // Beds, Baths, SqFt Waterfall
    if (!data.beds) {
        const bedsEl = document.querySelector('[data-testid="beds-value"], [data-rf-test-id="abp-beds"] .statsValue');
        if (bedsEl) { data.beds = safeParseFloat(bedsEl.textContent); console.log("Beds found via HTML."); }
    }
    if (!data.baths) {
        const bathsEl = document.querySelector('[data-testid="baths-value"], [data-rf-test-id="abp-baths"] .statsValue');
        if (bathsEl) { data.baths = safeParseFloat(bathsEl.textContent); console.log("Baths found via HTML."); }
    }
    if (!data.sqft) {
        const sqftEl = document.querySelector('[data-testid="sqft-value"] span, .sqft-section .statsValue span');
        if (sqftEl) { data.sqft = safeParseInt(sqftEl.textContent); console.log("SqFt found via HTML."); }
    }
    
    // Description Fallback (to avoid regression)
    if (!data.description) {
        data.description = document.querySelector('.remarksContainer .remarks span, meta[name="description"]')?.content;
        if(data.description) console.log("Description found via HTML fallback.");
    }

    // Images Fallback (to avoid regression)
    if (data.images.length === 0) {
        console.log("Images not found in JSON, trying HTML selectors...");
        const collectedImages = new Set();
        document.querySelectorAll('.ImageCarousel img, .InlinePhotoPreviewRedesign--large img, .photo-carousel-container img').forEach(img => {
            if (img.src && !img.src.includes('maps.google.com')) {
                collectedImages.add(img.src.replace(/p_[a-z]\.jpg/, 'p_f.jpg'));
            }
        });
        data.images = Array.from(collectedImages).slice(0, 15);
        console.log(`Found ${data.images.length} images via HTML fallback.`);
    }

    // Details from Key Details Table (Universal Selector for Year Built, Lot Size, Home Type)
    if (!data.yearBuilt || !data.lotSize || !data.homeType) {
        console.log("Searching for details in Key Details table...");
        const detailRows = document.querySelectorAll('.KeyDetailsTable .keyDetails-row, .KeyDetails-Table .key-details-row');
        detailRows.forEach(row => {
            const labelEl = row.querySelector('.keyDetails-label, .key-details-label');
            const valueEl = row.querySelector('.keyDetails-value, .key-details-value');
            if (labelEl && valueEl) {
                const label = labelEl.textContent.toLowerCase();
                const value = valueEl.textContent.trim();
                if (!data.yearBuilt && label.includes('year built')) {
                    data.yearBuilt = safeParseInt(value);
                    console.log(`Year Built found via Key Details table: ${data.yearBuilt}`);
                }
                if (!data.lotSize && label.includes('lot size')) {
                    data.lotSize = value;
                    console.log(`Lot Size found via Key Details table: ${data.lotSize}`);
                }
                if (!data.homeType && label.includes('property type')) {
                    data.homeType = value;
                    console.log(`Home Type found via Key Details table: ${data.homeType}`);
                }
            }
        });
    }

    // --- STAGE 3: Final Verification ---
    console.log("Final verification of extracted data...");
    if (!data.price || data.price <= 0) {
        data.error = "The scraper could not find a valid price for this property.";
        console.log(`Final verification failed: Price is invalid (${data.price}).`);
    } else {
        console.log("Final verification passed.");
    }
    
    // Address fallback if still not found
    if (!data.address || data.address === 'Address not found') {
        data.address = document.title.split('|')[0].trim();
    }

    console.log(`FINAL REDFIN DATA: Price=${data.price}, Beds=${data.beds}, Baths=${data.baths}, SqFt=${data.sqft}, Images=${data.images.length}`);
    return data;
}


// ==========================================================================
// ZILLOW SCRAPER (Original complete code to prevent regressions)
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
                          console.log("[Scrape.js] Found likely property data object via zpid/address/status/price keys.");
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
                 console.log(`[Scrape.js] Zestimate / SqFt (JSON): ${data.estimate} / ${data.estimatePerSqft}`);
             } else { console.log("[Scrape.js] Zestimate not found in JSON."); }
  
             const photos = hdpData.photos || hdpData.hugePhotos || hdpData.originalPhotos || [];
             if (photos.length > 0) {
                 const jsonImages = photos.map(p => p?.url || p?.mixedSources?.jpeg?.[p?.mixedSources?.jpeg?.length - 1]?.url).filter(Boolean);
                 if (jsonImages.length > 0) data.images = [...new Set([...jsonImages, ...data.images])];
                 console.log(`[Scrape.js] Total unique images after Zillow JSON: ${data.images.length}`);
             } else { console.log("[Scrape.js] No photos found in Zillow JSON."); }
  
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
                 console.log("[Scrape.js] Extracted interior/parking/construction/utility features from resoFacts (JSON).");
            }
  
             data.communityFeatures.walkScore = hdpData.walkScore?.walkscore;
             data.communityFeatures.transitScore = hdpData.transitScore?.transitScore;
             if(hdpData.schools?.length > 0) {
                 data.communityFeatures.schools = hdpData.schools.map(s => ({ name: s.name, rating: s.rating, distance: s.distance }));
                 console.log(`[Scrape.js] Found ${data.communityFeatures.schools.length} schools (Zillow JSON).`);
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
                 console.log(`[Scrape.js] Found ${data.priceHistory.length} price history events (Zillow JSON).`);
             } else { console.log("[Scrape.js] Price history not found in Zillow JSON."); }
  
             if (hdpData.taxHistory && Array.isArray(hdpData.taxHistory)) {
                 data.taxHistory = hdpData.taxHistory.map(t => ({
                     year: safeParseInt(t.time),
                     taxAmount: safeParseInt(t.taxPaid),
                     assessment: safeParseInt(t.value)
                 })).filter(t => t.year && (t.taxAmount || t.assessment));
                 console.log(`[Scrape.js] Found ${data.taxHistory.length} tax history entries (Zillow JSON).`);
                 if (!data.propertyTax && data.taxHistory.length > 0) {
                     const latestTax = data.taxHistory.sort((a, b) => b.year - a.year)[0];
                     if (latestTax.taxAmount) data.propertyTax = latestTax.taxAmount;
                 }
             } else { console.log("[Scrape.js] Tax history not found in Zillow JSON."); }
  
             data.daysOnMarket = safeParseInt(hdpData.daysOnZillow || facts.daysOnMarket);
             if (data.daysOnMarket !== null) {
                 console.log(`[Scrape.js] Found Days on Market (Zillow JSON): ${data.daysOnMarket}`);
             } else { console.log("[Scrape.js] Days on Market not found in Zillow JSON."); }
  
              const attributionInfo = hdpData.attributionInfo || hdpData.listingProvider;
              if (attributionInfo) {
                  data.listingAgent = attributionInfo.agentName || attributionInfo.listingAgentName;
                  data.listingBrokerage = attributionInfo.brokerName || attributionInfo.brokerageName || attributionInfo.listingBrokerageName;
                  if (data.listingAgent || data.listingBrokerage) console.log(`[Scrape.js] Found Listing Agent/Brokerage (Zillow JSON).`);
              } else { console.log("[Scrape.js] Listing Agent/Brokerage info not found in Zillow JSON."); }
  
        } else {
             console.log("[Scrape.js] Zillow hdpData property object not available. Relying heavily on HTML scraping.");
        }
  
        console.log("[Scrape.js] Extracting/Supplementing Zillow details from HTML elements...");
  
        if (!data.address || data.address === 'Address not found') {
            data.address = document.querySelector('[data-testid="address"]')?.textContent || document.querySelector('h1[class*="addr"]')?.textContent || document.title.split('|')[0].trim();
            if(data.address !== 'Address not found') console.log(`[Scrape.js] Address found via HTML: ${data.address}`);
        }
        if (!data.beds) data.beds = safeParseFloat(document.querySelector('[data-testid="bed-bath-item"] span')?.textContent.split(' ')[0]);
        if (!data.baths) data.baths = safeParseFloat(document.querySelectorAll('[data-testid="bed-bath-item"] span')[1]?.textContent.split(' ')[0]);
        if (!data.sqft) data.sqft = safeParseInt(document.querySelectorAll('[data-testid="bed-bath-item"] span')[2]?.textContent.split(' ')[0]);
  
        if (!data.estimate) {
             data.estimate = safeParseInt(document.querySelector('[data-testid="zestimate-value"]')?.textContent);
             if(data.estimate) console.log(`[Scrape.js] Zestimate found via HTML: ${data.estimate}`);
        }
        if (!data.estimatePerSqft) {
             const pricePerSqftText = document.querySelector('[data-testid="price-per-square-foot"]')?.textContent || document.querySelector('span[class*="PricePerSqft"]')?.textContent;
             if(pricePerSqftText) {
                data.estimatePerSqft = safeParseInt(pricePerSqftText);
                 if(data.estimatePerSqft) console.log(`[Scrape.js] Price/SqFt found via HTML: ${data.estimatePerSqft}`);
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
            if(data.description) console.log(`[Scrape.js] Description found via HTML fallback.`);
        }
  
         if (data.images.length === 0) {
             const imageElements = document.querySelectorAll('ul[class*="photo-tile-list"] img, div[class*="carousel-photo"] img, [data-testid="media-stream"] img');
             if(imageElements.length > 0) {
                  data.images = Array.from(imageElements).map(img => img.src || img.getAttribute('data-src')).filter(Boolean);
                  data.images = [...new Set(data.images)];
                  if(data.images.length > 0) console.log(`[Scrape.js] Found ${data.images.length} images via HTML image tag fallback.`);
             }
         }
  
         if (data.priceHistory.length === 0) {
             const historyContainer = document.querySelector('[data-testid="price-history-container"]');
             if (historyContainer) {
                 const historyRows = historyContainer.querySelectorAll('tbody tr');
                 if (historyRows.length > 0) {
                     console.log(`[Scrape.js] Attempting Price History extraction from HTML table (${historyRows.length} rows)...`);
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
                     if(data.priceHistory.length > 0) console.log(`[Scrape.js] Found ${data.priceHistory.length} price history events (HTML Fallback).`);
                 }
             }
         }
  
         if (data.taxHistory.length === 0) {
             const taxContainer = document.querySelector('[data-testid="TaxHistory"]');
             if (taxContainer) {
                  const taxRows = taxContainer.querySelectorAll('tbody tr');
                  if (taxRows.length > 0) {
                      console.log(`[Scrape.js] Attempting Tax History extraction from HTML table (${taxRows.length} rows)...`);
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
                      if(data.taxHistory.length > 0) console.log(`[Scrape.js] Found ${data.taxHistory.length} tax history entries (HTML Fallback).`);
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
                  if(data.daysOnMarket !== null) console.log(`[Scrape.js] Found Days on Market (HTML Fallback): ${data.daysOnMarket}`);
              }
         }
  
         if (!data.listingAgent && !data.listingBrokerage) {
             data.listingAgent = document.querySelector('[data-testid="attribution-agent-name"]')?.textContent?.trim();
             data.listingBrokerage = document.querySelector('[data-testid="attribution-broker-name"]')?.textContent?.trim();
             if (!data.listingAgent) data.listingAgent = document.querySelector('.listing-attribution__agent-name')?.textContent?.trim();
             if (!data.listingBrokerage) data.listingBrokerage = document.querySelector('.listing-attribution__broker-name')?.textContent?.trim();
  
             if(data.listingAgent || data.listingBrokerage) console.log(`[Scrape.js] Found Listing Agent/Brokerage (HTML Fallback).`);
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
// MAIN EXECUTION BLOCK
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

