/**
 * Web search tool wrapper for construction cost research
 */

interface SearchResult {
  title?: string;
  content?: string;
  url?: string;
  snippet?: string;
}

/**
 * Perform web search using the available search tool
 * 
 * Note: This function is designed to be used from within the Replit subagent context
 * where web_search tool is available. When used in the main application context,
 * it will return empty results and log the query for debugging.
 */
export async function web_search(params: { query: string }): Promise<SearchResult[]> {
  try {
    console.log(`Web search request: ${params.query}`);
    
    // Check if we're in a context where web_search is available (subagent context)
    if (typeof globalThis !== 'undefined' && (globalThis as any).web_search) {
      const results = await (globalThis as any).web_search({ query: params.query });
      return results.map((result: any) => ({
        title: result.title,
        content: result.content,
        url: result.url,
        snippet: result.snippet || result.content
      }));
    }
    
    // Fallback: return empty array to trigger static pricing fallback
    console.log("Web search not available in this context, using static pricing fallback");
    return [];
    
  } catch (error) {
    console.error("Web search error:", error);
    return [];
  }
}