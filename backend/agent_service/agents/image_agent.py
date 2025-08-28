# agents/image_agent.py
from typing import Dict, Any, List
import json
import asyncio
import re
from agents.base import BaseAgent
from langchain_core.messages import HumanMessage

class ImageAnalysisAgent(BaseAgent):
    """Agent for evaluating renovation ideas based on property images."""
    
    # --- THIS IS THE FIX ---
    # The example in the prompt now includes the 'new_total_sqft' field.
    PROMPT_TEMPLATE = """
    Review the following renovation suggestions based on these property images:
    
    Renovation Ideas: {renovation_json}
    
    Your tasks:
    - Expand each feasible idea with detailed break downs.
    - Check if each renovation is structurally feasible based on the images.
    - Identify additional improvements visible in the images.
    - Flag any unrealistic suggestions.
    
    Return a refined JSON, preserving all original fields and adding your insights.
    Example format for ONE idea:
    {{
        "refined_renovation_ideas": [
            {{
                "name": "Renovation name",
                "description": "Detailed description with image-based insights",
                "new_total_sqft": 1800,
                "estimated_cost": {{"low": 1000, "medium": 2000, "high": 3000}},
                "estimated_value_add": {{"low": 2000, "medium": 3000, "high": 4000}},
                "roi": 150,
                "feasibility": "Easy/Moderate/Difficult",
                "timeline": "weeks/months",
                "image_insights": "Specific observations from images"
            }}
        ]
    }}
    """
    
    async def process(self, image_urls: List[str], renovation_ideas: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Evaluate renovation ideas based on property images, now with robust error handling."""
        # This function's logic is correct and does not need changes.
        try:
            print("[ImageAgent] Process started.")
            
            if not renovation_ideas:
                print("[ImageAgent] No initial ideas received. Skipping image analysis.")
                return {"refined_renovation_ideas": [], "additional_suggestions": []}

            if not image_urls:
                print("[ImageAgent] No images provided. Passing through initial ideas without changes.")
                return {"refined_renovation_ideas": renovation_ideas, "additional_suggestions": []}

            renovation_json = json.dumps(renovation_ideas, indent=2)
            prompt_text = self.PROMPT_TEMPLATE.format(renovation_json=renovation_json)
            content_parts = [{"type": "text", "text": prompt_text}]
            
            print(f"[ImageAgent] Preparing {len(image_urls)} image(s) for vision analysis.")
            for url in image_urls:
                content_parts.append({ "type": "image_url", "image_url": {"url": url} })
                
            message = HumanMessage(content=content_parts)

            print("[ImageAgent] Sending multi-modal prompt to LLM...")
            response = await asyncio.to_thread(self.llm.invoke, [message])
            print("[ImageAgent] Received response from LLM.")
            
            raw_content = response.content.strip()
            
            try:
                result = json.loads(raw_content)
            except json.JSONDecodeError:
                print("[ImageAgent] Direct JSON parsing failed. Trying to extract from markdown.")
                json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw_content, re.DOTALL | re.IGNORECASE)
                if json_match:
                    result = json.loads(json_match.group(1))
                else:
                    print("[ImageAgent] Could not extract valid JSON. Passing through initial ideas as fallback.")
                    return {"refined_renovation_ideas": renovation_ideas, "additional_suggestions": []}
            
            print("[ImageAgent] Process finished successfully.")
            return result
            
        except Exception as e:
            import traceback
            print(f"[ImageAgent] General error in process: {str(e)}")
            print(f"[ImageAgent] Traceback: {traceback.format_exc()}")
            return {
                "refined_renovation_ideas": renovation_ideas, 
                "additional_suggestions": [],
                "error": f"ImageAnalysisAgent error: {str(e)}"
            }