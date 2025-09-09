/**
 * @fileoverview This script is injected into a Puppeteer browser instance
 * to scrape property data from Redfin or Zillow. It determines the source
 * website and calls the appropriate extraction function.
 *
 * This version contains the definitive, most resilient Redfin scraper that handles
 * all known page layouts while preserving the original Zillow scraper.
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
// REDFIN SCRAPER (FINAL v23 - Definitive Fallback Capture)
// ==========================================================================
function extractRedfinData() {
    console.log("[Scrape.js] Starting extractRedfinData (v23 - Definitive Fallback)...");
    let data = {
        address: null, price: null, beds: null, baths: null, sqft: null,
        yearBuilt: null, lotSize: null, homeType: null, description: null, images: [],
        source: 'redfin', url: window.location.href, timestamp: new Date().toISOString(),
        error: null
    };

    // --- HELPER 1: Finds values in structured "key-value" rows. ---
    const findValueInTable = (labelText) => {
        const allElements = Array.from(document.querySelectorAll('.key-detail-row, .table-row, .entryItem, .fact-group, .HomeInfo-property-facts > div'));
        for (const el of allElements) {
            const labelEl = el.querySelector('.label, .table-label, .title, .entryItem--title, .fact-label');
            if (labelEl && labelEl.textContent.toLowerCase().includes(labelText)) {
                const valueEl = el.querySelector('.content, .table-value, .value, .entryItem--value, .fact-value');
                if (valueEl) return valueEl.textContent.trim();
            }
        }
        return null;
    };

    // --- HELPER 2 (DEFINITIVE FIX): Finds values in unstructured, adjacent elements. ---
    // This is the fallback for "simplified" layouts where data isn't in a neat table.
    const findValueByAdjacentSibling = (label) => {
        console.log(`[Scrape.js] Adjacent sibling search initiated for: "${label}"`);
        const labelRegex = new RegExp(`^${label}$`, 'i');
        // Use a broad selector to find any potential label element
        const allTextElements = Array.from(document.querySelectorAll('div, span, p'));
    
        for (const el of allTextElements) {
            if (el && el.textContent && labelRegex.test(el.textContent.trim())) {
                // Found a potential label. Check its direct next sibling.
                const nextEl = el.nextElementSibling;
                if (nextEl && nextEl.textContent) {
                    const value = nextEl.textContent.trim();
                    if (value) {
                         console.log(`[Scrape.js] Adjacent sibling success for "${label}". Found value: "${value}"`);
                         return value;
                    }
                }
            }
        }
        console.log(`[Scrape.js] Adjacent sibling search for "${label}" did not find a value.`);
        return null;
    }
    
    try {
        // --- STAGE 1: ATTEMPT TO EXTRACT FROM EMBEDDED JSON (Primary Method) ---
        console.log("Attempting JSON parse from __INITIAL_STATE__ or __reactServerState...");
        try {
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
                        }
                        console.log("Extracted from JSON:", { address: data.address, price: data.price, beds: data.beds, baths: data.baths, sqft: data.sqft, yearBuilt: data.yearBuilt, lotSize: data.lotSize, images: `${data.images.length} found` });
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
        console.log("Running HTML waterfall for any missing data...");

        if (!data.address) {
            const addressSelectors = [ 'h1[data-rf-test-id="abp-address"]', 'h1.font-bold', '.homeAddress span.street-address', 'meta[name="twitter:text:street_address"]' ];
            for (const selector of addressSelectors) {
                const el = document.querySelector(selector);
                if (el) { data.address = (el.tagName === 'META' ? el.content : el.textContent.trim()).replace(/\s+/g, ' '); break; }
            }
        }
        if (!data.price) {
            const priceSelectors = [ 'div[data-testid="price"]', '.price .statsValue' ];
            for (const selector of priceSelectors) {
                const el = document.querySelector(selector);
                if (el) { data.price = safeParseInt(el.textContent); break; }
            }
            if (!data.price) {
                const soldBanner = document.querySelector('.ListingStatusBannerSection');
                if (soldBanner && soldBanner.textContent.includes('SOLD')) {
                    const priceMatch = soldBanner.textContent.match(/FOR \$([0-9,]+)/);
                    if (priceMatch && priceMatch[1]) { data.price = safeParseInt(priceMatch[1]); }
                }
            }
            if (!data.price) {
                const metaPrice = document.querySelector('meta[name="twitter:text:price"]');
                if (metaPrice) { data.price = safeParseInt(metaPrice.content); }
            }
        }

        if (!data.beds) {
             const bedsEl = document.querySelector('[data-testid="beds-value"], [data-rf-test-id="abp-beds"] .statsValue, .beds-section .statsValue');
             if (bedsEl) { data.beds = safeParseFloat(bedsEl.textContent); }
        }
        if (!data.baths) {
             const bathsEl = document.querySelector('[data-testid="baths-value"], [data-rf-test-id="abp-baths"] .statsValue, .baths-section .statsValue');
             if (bathsEl) { data.baths = safeParseFloat(bathsEl.textContent); }
        }
        if (!data.sqft) {
             const sqftEl = document.querySelector('[data-testid="sqft-value"] span, .sqft-section .statsValue, [data-rf-test-id="abp-sqFt"] .statsValue');
             if (sqftEl) { data.sqft = safeParseInt(sqftEl.textContent); }
        }
        
        // Year Built Waterfall
        if (!data.yearBuilt) {
            console.log("Attempting to find Year Built in HTML...");
            data.yearBuilt = safeParseInt(findValueInTable('year built'));
            if(!data.yearBuilt) { // If table search fails, use the adjacent sibling fallback
                data.yearBuilt = safeParseInt(findValueByAdjacentSibling('Year Built'));
            }
        }

        // Lot Size Waterfall
        if (!data.lotSize) {
            console.log("Attempting to find Lot Size in HTML...");
            data.lotSize = findValueInTable('lot size');
            if(!data.lotSize) { // If table search fails, use the adjacent sibling fallback
                data.lotSize = findValueByAdjacentSibling('Lot Size');
            }
        }
        // Final conversion for lot size to sqft if it contains 'acre'
        if (data.lotSize && typeof data.lotSize === 'string') {
            if (data.lotSize.toLowerCase().includes('acre')) {
                const acres = safeParseFloat(data.lotSize);
                if (acres) data.lotSize = Math.round(acres * 43560);
            } else {
                data.lotSize = safeParseInt(data.lotSize);
            }
        }

        if (!data.homeType) data.homeType = findValueInTable('property type');
        if (!data.description) {
            const descEl = document.querySelector('.remarksContainer .remarks span, meta[name="description"]');
            if (descEl) { data.description = descEl.tagName === 'META' ? descEl.content : descEl.textContent; }
        }

        if (data.images.length === 0) {
            const collectedImages = new Set();
            document.querySelectorAll('.ImageCarousel img, .InlinePhotoPreviewRedesign--large img, .photo-carousel-container img').forEach(img => {
                if (img.src && !img.src.includes('maps.google.com')) { collectedImages.add(img.src.replace(/p_[a-z]\.jpg/, 'p_f.jpg')); }
            });
            data.images = Array.from(collectedImages).slice(0, 15);
        }
        
    } catch (error) {
        console.error('[Scrape.js] CRITICAL Error during extractRedfinData:', error.message, error.stack);
        data.error = `Scraping failed critically: ${error.message}`;
    }

    // --- STAGE 3: Final Verification ---
    if (!data.price || data.price <= 0) {
        data.error = "The scraper could not find a valid price for this property.";
    }
    if (!data.address) {
        data.address = document.title.split('|')[0].trim();
    }

    console.log("[Scrape.js] FINAL Redfin Data Summary:", { address: data.address, price: data.price, beds: data.beds, baths: data.baths, sqft: data.sqft, yearBuilt: data.yearBuilt, lotSize: data.lotSize, image_count: data.images.length, error: data.error });
    return data;
}


// ==========================================================================
// ZILLOW SCRAPER (Original complete code to prevent regressions)
// ==========================================================================
function extractZillowData() {
    console.log("[Scrape.js] Starting extractZillowData (Enhanced Version 2 - More Data)...");
  
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
        console.log("[Scrape.js] Searching for hdpApolloPreloadedData JSON...");
        let hdpData = null;
        let rawHdpJson = null;
        const scriptElement = document.getElementById('hdpApolloPreloadedData');
        if (scriptElement) {
            try {
                 rawHdpJson = JSON.parse(scriptElement.textContent);
                 const findPropertyData = (obj) => {
                     if (typeof obj !== 'object' || obj === null) return null;
                     if (obj.zpid && obj.streetAddress && obj.homeStatus && obj.price) return obj;
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
            } catch (jsonError) {
                 console.error('[Scrape.js] Error parsing/processing Zillow JSON (hdpApolloPreloadedData):', jsonError.message);
            }
        }
  
        if (hdpData) {
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
                     if (!commonFactKeys.includes(key) && value && typeof value !== 'object') data.additionalDetails[key] = value;
                 });
            }
             data.communityFeatures.walkScore = hdpData.walkScore?.walkscore;
             data.communityFeatures.transitScore = hdpData.transitScore?.transitScore;
             if(hdpData.schools?.length > 0) data.communityFeatures.schools = hdpData.schools.map(s => ({ name: s.name, rating: s.rating, distance: s.distance }));
             if (hdpData.priceHistory && Array.isArray(hdpData.priceHistory)) {
                 data.priceHistory = hdpData.priceHistory.map(e => ({ date: e.date || e.time, price: safeParseInt(e.price), event: e.event || e.priceChangeReason })).filter(e => e.date && e.price);
                 data.priceHistory.forEach(e => {
                     if (typeof e.date === 'number' && e.date > 1000000000) { try { e.date = new Date(e.date).toISOString().split('T')[0]; } catch { /* ignore */ } }
                 });
             }
             if (hdpData.taxHistory && Array.isArray(hdpData.taxHistory)) {
                 data.taxHistory = hdpData.taxHistory.map(t => ({ year: safeParseInt(t.time), taxAmount: safeParseInt(t.taxPaid), assessment: safeParseInt(t.value) })).filter(t => t.year && (t.taxAmount || t.assessment));
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
        }
  
        if (!data.address || data.address === 'Address not found') data.address = document.querySelector('[data-testid="address"]')?.textContent || document.querySelector('h1[class*="addr"]')?.textContent || document.title.split('|')[0].trim();
        if (!data.beds) data.beds = safeParseFloat(document.querySelector('[data-testid="bed-bath-item"] span')?.textContent.split(' ')[0]);
        if (!data.baths) data.baths = safeParseFloat(document.querySelectorAll('[data-testid="bed-bath-item"] span')[1]?.textContent.split(' ')[0]);
        if (!data.sqft) data.sqft = safeParseInt(document.querySelectorAll('[data-testid="bed-bath-item"] span')[2]?.textContent.split(' ')[0]);
        if (!data.estimate) data.estimate = safeParseInt(document.querySelector('[data-testid="zestimate-value"]')?.textContent);
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
             if (!knownLabels.some(kl => label.includes(kl))) data.additionalDetails[label.replace(/\s+/g, '_')] = value;
        });
  
        if (!data.description) data.description = document.querySelector('[data-testid="description"] span')?.textContent || (document.querySelector('div[class*="Text-c11n-"]')?.textContent) || document.querySelector('meta[name="description"]')?.content;
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
                         if (cells.length >= 3) data.priceHistory.push({ date: cells[0]?.textContent?.trim(), event: cells[1]?.textContent?.trim(), price: safeParseInt(cells[2]?.textContent) });
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
                          if (cells.length >= 2) data.taxHistory.push({ year: safeParseInt(cells[0]?.textContent), taxAmount: safeParseInt(cells[1]?.textContent), assessment: cells.length > 2 ? safeParseInt(cells[2]?.textContent) : null });
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
              if (domElement) data.daysOnMarket = safeParseInt(domElement.textContent);
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
  
     console.log("[Scrape.js] Returning final Zillow data object (summary):", { address: data.address, price: data.price, beds: data.beds, baths: data.baths, sqft: data.sqft, yearBuilt: data.yearBuilt, lotSize: data.lotSize, image_count: data.images.length, price_history_events: data.priceHistory.length, tax_history_entries: data.taxHistory.length });
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

