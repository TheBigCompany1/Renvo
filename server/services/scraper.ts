import { PropertyData } from "@shared/schema";
import * as cheerio from "cheerio";

export async function scrapeRedfinProperty(url: string): Promise<PropertyData> {
  try {
    // Validate Redfin URL
    if (!url.includes('redfin.com')) {
      throw new Error("Invalid Redfin URL provided");
    }

    console.log(`Starting to scrape Redfin property: ${url}`);
    
    // Fetch the HTML content
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Redfin page: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    
    console.log('Successfully loaded HTML, extracting property data...');

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
      const element = $(selector).first();
      if (element.length && element.text()) {
        address = cleanText(element.text());
        if (address) break;
      }
    }

    // Extract from page title if address still not found
    if (!address) {
      const pageTitle = $('title').text();
      const match = pageTitle.match(/^([^|]+)/);
      if (match) {
        address = cleanText(match[1]);
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
      const element = $(selector).first();
      if (element.length && element.text()) {
        price = parseNumber(element.text());
        if (price) break;
      }
    }
    
    // Extract beds, baths, sqft from the page text
    let beds: number | undefined;
    let baths: number | undefined;
    let sqft: number | undefined;
    
    const pageText = $('body').text();
    
    // Extract beds
    const bedMatch = pageText.match(/(\d+)\s*bed/i);
    if (bedMatch) beds = parseInt(bedMatch[1]);
    
    // Extract baths
    const bathMatch = pageText.match(/(\d+(?:\.\d+)?)\s*bath/i);
    if (bathMatch) baths = parseFloat(bathMatch[1]);
    
    // Extract sqft
    const sqftMatch = pageText.match(/([\d,]+)\s*sq\s*ft/i);
    if (sqftMatch) sqft = parseNumber(sqftMatch[1]);
    
    // Extract year built
    let yearBuilt: number | undefined;
    const yearMatch = pageText.match(/built.*?(19\d{2}|20\d{2})|year.*?(19\d{2}|20\d{2})/i);
    if (yearMatch) {
      yearBuilt = parseInt(yearMatch[1] || yearMatch[2]);
    }
    
    // Extract lot size
    let lotSize: string | undefined;
    const lotMatch = pageText.match(/lot.*?([\d.,]+\s*(?:acres?|sq\s*ft))/i);
    if (lotMatch) {
      lotSize = lotMatch[1];
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
      const element = $(selector).first();
      if (element.length && element.text()) {
        description = cleanText(element.text());
        if (description.length > 50) break;
      }
    }
    
    // Extract images
    const images: string[] = [];
    const imageElements = $('img[src*="ssl.cdn-redfin.com"]');
    
    imageElements.each((_, img) => {
      const src = $(img).attr('src');
      if (src && !images.includes(src)) {
        images.push(src);
        if (images.length >= 6) return false; // Break the loop
      }
    });
    
    const propertyData = {
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
    
    console.log('Extracted property data:', propertyData);
    
    // Validate that we got meaningful data
    if (!propertyData.address) {
      throw new Error('Could not extract property address from Redfin page. The page structure may have changed.');
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
  }
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