import { PropertyData } from "@shared/schema";
import puppeteer from "puppeteer";

export async function scrapeRedfinProperty(url: string): Promise<PropertyData> {
  let browser;
  try {
    // Validate Redfin URL
    if (!url.includes('redfin.com')) {
      throw new Error("Invalid Redfin URL provided");
    }

    console.log(`Starting to scrape Redfin property: ${url}`);
    
    // Launch Puppeteer browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    
    const page = await browser.newPage();
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to the property page
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Wait for key elements to load
    await page.waitForSelector('.street-address, .address, h1', { timeout: 10000 });
    
    // Extract property data
    const propertyData = await page.evaluate(() => {
      // Helper function to clean text
      const cleanText = (text: string | null) => text?.trim().replace(/\s+/g, ' ') || '';
      
      // Helper function to parse numbers
      const parseNumber = (text: string | null) => {
        if (!text) return undefined;
        const num = parseInt(text.replace(/[^0-9]/g, ''));
        return isNaN(num) ? undefined : num;
      };
      
      // Extract address
      let address = '';
      const addressSelectors = [
        '.street-address',
        '.address-line', 
        'h1',
        '[data-rf-test-name="abp-streetLine"]',
        '.address'
      ];
      
      for (const selector of addressSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent) {
          address = cleanText(element.textContent);
          if (address) break;
        }
      }
      
      // Extract price
      let price: number | undefined;
      const priceSelectors = [
        '.price-section .price',
        '.home-main-stats-price .price',
        '[data-rf-test-name="abp-price"]',
        '.price'
      ];
      
      for (const selector of priceSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent) {
          price = parseNumber(element.textContent);
          if (price) break;
        }
      }
      
      // Extract beds, baths, sqft
      let beds: number | undefined;
      let baths: number | undefined;
      let sqft: number | undefined;
      
      // Try to find bed/bath/sqft info
      const statsSelectors = [
        '.home-main-stats',
        '.property-details',
        '.listing-summary-table',
        '.stats-list'
      ];
      
      for (const selector of statsSelectors) {
        const container = document.querySelector(selector);
        if (container) {
          const text = container.textContent || '';
          
          // Extract beds
          const bedMatch = text.match(/(\d+)\s*bed/i);
          if (bedMatch && !beds) beds = parseInt(bedMatch[1]);
          
          // Extract baths
          const bathMatch = text.match(/(\d+(?:\.\d+)?)\s*bath/i);
          if (bathMatch && !baths) baths = parseFloat(bathMatch[1]);
          
          // Extract sqft
          const sqftMatch = text.match(/([\d,]+)\s*sq\s*ft/i);
          if (sqftMatch && !sqft) sqft = parseNumber(sqftMatch[1]);
        }
      }
      
      // Extract year built
      let yearBuilt: number | undefined;
      const yearElements = document.querySelectorAll('*');
      for (const element of yearElements) {
        const text = element.textContent || '';
        const yearMatch = text.match(/built.*?(19\d{2}|20\d{2})|year.*?(19\d{2}|20\d{2})/i);
        if (yearMatch) {
          yearBuilt = parseInt(yearMatch[1] || yearMatch[2]);
          break;
        }
      }
      
      // Extract lot size
      let lotSize: string | undefined;
      for (const element of yearElements) {
        const text = element.textContent || '';
        const lotMatch = text.match(/lot.*?([\d.,]+\s*(?:acres?|sq\s*ft))/i);
        if (lotMatch) {
          lotSize = lotMatch[1];
          break;
        }
      }
      
      // Extract description
      let description = '';
      const descriptionSelectors = [
        '.remarks',
        '.listing-description',
        '.public-remarks',
        '[data-rf-test-name="abp-remarks"]'
      ];
      
      for (const selector of descriptionSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent) {
          description = cleanText(element.textContent);
          if (description.length > 50) break;
        }
      }
      
      // Extract images
      const images: string[] = [];
      const imageSelectors = [
        '.media-stream img',
        '.photo-carousel img',
        '.listing-photo img',
        'img[src*="ssl.cdn-redfin.com"]'
      ];
      
      for (const selector of imageSelectors) {
        const imageElements = document.querySelectorAll(selector);
        for (const img of imageElements) {
          const src = (img as HTMLImageElement).src;
          if (src && src.includes('ssl.cdn-redfin.com') && !images.includes(src)) {
            images.push(src);
            if (images.length >= 6) break;
          }
        }
        if (images.length >= 6) break;
      }
      
      return {
        address,
        price,
        beds,
        baths,
        sqft,
        yearBuilt,
        lotSize,
        description,
        images
      };
    });
    
    console.log('Extracted property data:', propertyData);
    
    // Validate that we got meaningful data
    if (!propertyData.address) {
      throw new Error('Could not extract property address from Redfin page');
    }
    
    // Return the extracted data with proper typing
    const result: PropertyData = {
      address: propertyData.address,
      price: propertyData.price,
      beds: propertyData.beds || 0,
      baths: propertyData.baths || 0,
      sqft: propertyData.sqft || 0,
      yearBuilt: propertyData.yearBuilt,
      lotSize: propertyData.lotSize,
      description: propertyData.description || 'No description available.',
      images: propertyData.images.length > 0 ? propertyData.images : undefined
    };
    
    console.log('Final property data:', result);
    return result;
    
  } catch (error) {
    console.error("Error scraping Redfin property:", error);
    throw new Error("Failed to extract property data from Redfin URL: " + (error as Error).message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function extractAddressFromUrl(url: string): string {
  // Extract address from Redfin URL pattern
  // Real implementation would parse the actual URL structure
  const addresses = [
    "1234 Oak Street, San Francisco, CA 94102",
    "456 Pine Avenue, Oakland, CA 94610",
    "789 Cedar Drive, Berkeley, CA 94704",
    "321 Maple Lane, Palo Alto, CA 94301"
  ];
  
  return addresses[Math.floor(Math.random() * addresses.length)];
}

export async function findComparableProperties(propertyData: PropertyData): Promise<Array<{
  address: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  dateSold: string;
  pricePsf: number;
}>> {
  try {
    // Mock comparable properties - in production this would search real estate databases
    const comparables = [];
    const basePrice = propertyData.price || 800000;
    
    for (let i = 0; i < 3; i++) {
      const price = Math.floor(basePrice * (0.85 + Math.random() * 0.3)); // ±15% price variation
      const sqft = propertyData.sqft + (Math.random() * 200 - 100); // ±100 sqft variation
      
      comparables.push({
        address: generateRandomAddress(),
        price,
        beds: propertyData.beds + (Math.random() > 0.5 ? 0 : Math.random() > 0.5 ? 1 : -1),
        baths: propertyData.baths + (Math.random() > 0.7 ? 0.5 : 0),
        sqft: Math.floor(sqft),
        dateSold: generateRecentDate(),
        pricePsf: Math.floor(price / sqft)
      });
    }
    
    return comparables;
  } catch (error) {
    console.error("Error finding comparable properties:", error);
    throw new Error("Failed to find comparable properties: " + (error as Error).message);
  }
}

function generateRandomAddress(): string {
  const streets = ["Pine St", "Cedar Ave", "Maple Dr", "Oak Ln", "Elm Way", "Birch Ct"];
  const numbers = Math.floor(Math.random() * 9000) + 1000;
  return `${numbers} ${streets[Math.floor(Math.random() * streets.length)]}`;
}

function generateRecentDate(): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[Math.floor(Math.random() * 12)];
  const year = Math.random() > 0.5 ? "2024" : "2023";
  return `${month} ${year}`;
}
