export interface LocationData {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
}

/**
 * Extract location data from property address and URL
 * @param address - Property address string
 * @param propertyUrl - Optional property URL (for extracting additional location data from Redfin URLs)
 */
export async function extractLocationFromProperty(
  address: string,
  propertyUrl?: string
): Promise<LocationData> {
  try {
    const location: LocationData = { address };
    
    // Parse location from address string
    const addressParts = address.split(',').map(part => part.trim());
    
    // Remove "USA" or "United States" from the end if present
    if (addressParts.length > 0) {
      const lastPart = addressParts[addressParts.length - 1].toLowerCase();
      if (lastPart === 'usa' || lastPart === 'united states') {
        addressParts.pop();
      }
    }
    
    if (addressParts.length >= 2) {
      // Try to extract city and state from address
      const lastPart = addressParts[addressParts.length - 1];
      const stateZipMatch = lastPart.match(/([A-Z]{2})\s+(\d{5})/);
      
      if (stateZipMatch) {
        location.state = stateZipMatch[1];
        location.zip = stateZipMatch[2];
        location.city = addressParts[addressParts.length - 2];
      } else {
        // Check if last part is just a state abbreviation
        const stateMatch = lastPart.match(/^([A-Z]{2})$/);
        if (stateMatch && addressParts.length >= 3) {
          location.state = stateMatch[1];
          // Check second to last part for ZIP
          const secondLast = addressParts[addressParts.length - 2];
          const zipMatch = secondLast.match(/(\d{5})/);
          if (zipMatch) {
            location.zip = zipMatch[1];
            // City would be the part before that
            if (addressParts.length >= 4) {
              location.city = addressParts[addressParts.length - 3];
            } else {
              // Extract city from the ZIP part (e.g., "Los Angeles 90066")
              const cityFromZipPart = secondLast.replace(/\d{5}/, '').trim();
              if (cityFromZipPart) {
                location.city = cityFromZipPart;
              }
            }
          } else {
            location.city = addressParts[addressParts.length - 2];
          }
        } else {
          // Try to parse city from second to last part
          if (addressParts.length >= 3) {
            location.city = addressParts[addressParts.length - 2];
            location.state = addressParts[addressParts.length - 1];
          }
        }
      }
    }
    
    // Extract additional location info from URL if possible
    if (propertyUrl && propertyUrl.includes('redfin.com')) {
      // Redfin URL format: /CA/Los-Angeles/12630-Bonaparte-Ave-90066/home/6732264
      const urlMatch = propertyUrl.match(/\/([A-Z]{2})\/([^\/]+)\/([^\/]+)/);
      if (urlMatch) {
        location.state = urlMatch[1]; // CA
        location.city = urlMatch[2].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); // Los Angeles
        
        // Extract ZIP from address part (e.g., "12630-Bonaparte-Ave-90066")
        const addressPart = urlMatch[3];
        const zipMatch = addressPart.match(/-(\d{5})$/);
        if (zipMatch && !location.zip) {
          location.zip = zipMatch[1]; // Extract 90066
        }
      }
    }
    
    // For now, we'll use a simple geocoding approach
    // In a production system, you'd integrate with Google Maps API, etc.
    if (location.zip) {
      const coords = getApproximateCoordinatesFromZip(location.zip);
      if (coords) {
        location.lat = coords.lat;
        location.lng = coords.lng;
      }
    }
    
    console.log('Extracted location:', location);
    return location;
  } catch (error) {
    console.error('Error extracting location:', error);
    return { address };
  }
}

/**
 * Simple ZIP code to coordinates mapping for major metro areas
 * In production, this would be replaced with a proper geocoding service
 */
function getApproximateCoordinatesFromZip(zip: string): { lat: number; lng: number } | null {
  const zipCoords: Record<string, { lat: number; lng: number }> = {
    // Los Angeles area
    '90066': { lat: 33.9836, lng: -118.4017 }, // Marina del Rey
    '90210': { lat: 34.0901, lng: -118.4065 }, // Beverly Hills
    '90028': { lat: 34.1016, lng: -118.3267 }, // Hollywood
    '90291': { lat: 33.9786, lng: -118.4668 }, // Venice
    '90405': { lat: 34.0195, lng: -118.4912 }, // Santa Monica
    
    // San Francisco area
    '94102': { lat: 37.7749, lng: -122.4194 }, // San Francisco
    '94110': { lat: 37.7487, lng: -122.4156 }, // Mission District
    '94107': { lat: 37.7630, lng: -122.3927 }, // SOMA
    
    // New York area
    '10001': { lat: 40.7505, lng: -73.9934 }, // Manhattan
    '11201': { lat: 40.6928, lng: -73.9903 }, // Brooklyn Heights
    '10014': { lat: 40.7342, lng: -74.006 },  // West Village
    
    // Add more as needed for other metro areas
  };
  
  return zipCoords[zip] || null;
}

/**
 * Get market context for pricing based on location
 */
export function getMarketContext(location: LocationData): {
  medianPricePsf: number;
  marketName: string;
} {
  const zip = location.zip;
  const city = location.city?.toLowerCase();
  const state = location.state;
  
  // Market-specific pricing data based on research
  if (zip?.startsWith('900') || city?.includes('los angeles') || city?.includes('hollywood')) {
    return { medianPricePsf: 1000, marketName: 'Los Angeles Metro' };
  } else if (zip?.startsWith('941') || city?.includes('san francisco')) {
    return { medianPricePsf: 1400, marketName: 'San Francisco Bay Area' };
  } else if (zip?.startsWith('100') || zip?.startsWith('112') || city?.includes('new york')) {
    return { medianPricePsf: 1200, marketName: 'New York Metro' };
  } else if (state === 'CA') {
    return { medianPricePsf: 800, marketName: 'California' };
  } else if (state === 'NY') {
    return { medianPricePsf: 600, marketName: 'New York State' };
  } else if (state === 'TX') {
    return { medianPricePsf: 400, marketName: 'Texas' };
  } else if (state === 'FL') {
    return { medianPricePsf: 500, marketName: 'Florida' };
  }
  
  // National fallback
  return { medianPricePsf: 300, marketName: 'National Average' };
}