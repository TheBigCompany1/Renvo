# agents/image_agent.py
from typing import Dict, Any, List
import json
import asyncio
import re # <-- ADDED: Import re at the top level
from agents.base import BaseAgent
from langchain_core.messages import HumanMessage # <-- ADDED: Required for multi-modal messages

class ImageAnalysisAgent(BaseAgent):
    """Agent for evaluating renovation ideas based on property images."""
    
    # The PROMPT_TEMPLATE remains the same.
    PROMPT_TEMPLATE = """
    Review the following renovation suggestions based on these property images:
    
    Renovation Ideas: {renovation_json}
    
    Your tasks:
    - Expand each feasible idea with detailed break downs, for example, smart home technology integration can be broken down into specific devices and their benefits
    - Check if each renovation is structurally feasible based on the images
    - Identify additional improvements visible in the images
    - Flag any unrealistic suggestions
    
    Return a refined JSON with the following format and sorted by feasibility:
    {{
        "refined_renovation_ideas": [
            {{
                "name": "Renovation name",
                "description": "Detailed description with image-based insights",
                "estimated_cost": {{"low": 1000, "medium": 2000, "high": 3000}},
                "estimated_value_add": {{"low": 2000, "medium": 3000, "high": 4000}},
                "roi": 150,
                "feasibility": "Easy/Moderate/Difficult",
                "timeline": "weeks/months",
                "image_insights": "Specific observations from images"
            }}
        ],
        "additional_suggestions": [
            {{
                "name": "New suggestion based on images",
                "description": "Detailed description",
                "reason": "Explanation of why this was identified from images"
            }}
        ]
    }}
    """
    
    async def process(self, renovation_ideas: Dict[str, Any], image_urls: List[str]) -> Dict[str, Any]:
        """Evaluate renovation ideas based on property images."""
        try:
            print("[ImageAgent] Process started.")
            renovation_json = json.dumps(renovation_ideas, indent=2)
            
            # --- START OF UPDATED LOGIC ---

            # 1. Create the text part of the prompt.
            #    We no longer include the image_urls as text here.
            prompt_text = self.PROMPT_TEMPLATE.format(renovation_json=renovation_json)
            
            # 2. Create a list to hold all parts of our multi-modal message.
            content_parts = []
            
            # 3. Add the text part first.
            content_parts.append({"type": "text", "text": prompt_text})
            
            # 4. Add each image URL in the special format the API requires.
            print(f"[ImageAgent] Preparing {len(image_urls)} image(s) for vision analysis.")
            for url in image_urls:
                content_parts.append({
                    "type": "image_url",
                    "image_url": {"url": url},
                })
                
            # 5. Create the final message payload using HumanMessage.
            message = HumanMessage(content=content_parts)

            # --- END OF UPDATED LOGIC ---

            print("[ImageAgent] Sending multi-modal prompt to LLM...")
            # Use asyncio to make the LLM call non-blocking, passing the new message object
            response = await asyncio.to_thread(
                self.llm.invoke,
                [message] # The message must be passed inside a list
            )
            print("[ImageAgent] Received response from LLM.")
            
            # The rest of your JSON parsing logic is preserved to prevent regressions.
            raw_content = response.content.strip()
            print(f"[ImageAgent] Raw LLM content (stripped): {raw_content[:500]}...")
            
            try:
                result = json.loads(raw_content)
            except json.JSONDecodeError:
                print("[ImageAgent] Direct JSON parsing failed. Trying to extract from markdown.")
                json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw_content, re.DOTALL | re.IGNORECASE)
                if json_match:
                    result = json.loads(json_match.group(1))
                else:
                    raise ValueError("Could not extract valid JSON from LLM response.")
            
            print("[ImageAgent] Process finished successfully.")
            return result
            
        except Exception as e:
            import traceback
            print(f"[ImageAgent] General error in process: {str(e)}")
            print(f"[ImageAgent] Traceback: {traceback.format_exc()}")
            return {
                "refined_renovation_ideas": renovation_ideas.get("renovation_ideas", []),
                "additional_suggestions": [],
                "error": f"ImageAnalysisAgent error: {str(e)}"
            }