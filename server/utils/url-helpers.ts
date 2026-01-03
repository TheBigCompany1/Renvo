/**
 * Extract property address information from Redfin/Zillow URLs
 */
export function extractAddressFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    
    // Handle Redfin URL patterns
    if (parsedUrl.hostname.includes('redfin.com')) {
      // Pattern: /CA/Los-Angeles/123-Test-St-90066
      const parts = pathname.split('/').filter(part => part.length > 0);
      if (parts.length >= 3) {
        const state = parts[0];
        const city = parts[1].replace(/-/g, ' ');
        const addressPart = parts[2];
        
        // Try to extract street address and ZIP from the last part
        const match = addressPart.match(/(.+)-(\d{5})/);
        if (match) {
          const streetPart = match[1].replace(/-/g, ' ');
          const zip = match[2];
          return `${streetPart}, ${city}, ${state} ${zip}`;
        } else {
          // Fallback without ZIP
          const streetPart = addressPart.replace(/-/g, ' ');
          return `${streetPart}, ${city}, ${state}`;
        }
      }
    }
    
    // Handle Zillow URL patterns (similar logic can be added)
    if (parsedUrl.hostname.includes('zillow.com')) {
      // Zillow URLs have different patterns, can be extended
      return null;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}