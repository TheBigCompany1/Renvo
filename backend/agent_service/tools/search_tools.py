# backend/agent_service/tools/search_tools.py
from langchain_core.tools import tool
from tavily import TavilyClient
import os

# It's recommended to get a free API key from Tavily for a better search experience.
# Add TAVILY_API_KEY to your .env file or Render environment variables.
# If not available, it will try to work without it.
tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

@tool
def search_for_comparable_properties(query: str) -> str:
    """
    Searches for real estate listings or sales data. 
    Use this to find comparable properties ('comps') to justify estimated values.
    Example query: "recently sold 3-bedroom homes in Santa Monica, CA"
    """
    print(f"[SearchTool] Performing search for: {query}")
    try:
        # Using Tavily search for a more agent-focused search experience
        result = tavily_client.search(query, search_depth="advanced", max_results=4)
        return f"Search results for '{query}':\n" + "\n".join([f"- {res['content']} (Source: {res['url']})" for res in result['results']])
    except Exception as e:
        print(f"[SearchTool] Error: {e}")
        return f"Error performing search: {e}"