# agents/image_agent.py
from typing import Dict, Any, List
import json
import asyncio
from agents.base import BaseAgent

class ImageAnalysisAgent(BaseAgent):
    """Agent for evaluating renovation ideas based on property images."""
    
    PROMPT_TEMPLATE = """
    Review the following renovation suggestions based on these property images:
    
    Renovation Ideas: {renovation_json}
    
    Images: {image_urls}
    
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
            renovation_json = json.dumps(renovation_ideas)
            images_str = json.dumps(image_urls)
            
            prompt = self._create_prompt(
                self.PROMPT_TEMPLATE,
                renovation_json=renovation_json,
                image_urls=images_str
            )
            
            # Use asyncio to make the LLM call non-blocking
            response = await asyncio.to_thread(
                self.llm.invoke,
                prompt
            )
            
            # Parse the response as JSON
            try:
                # First attempt to parse the entire response as JSON
                result = json.loads(response.content)
            except json.JSONDecodeError:
                # If that fails, try to extract JSON from the text
                import re
                json_match = re.search(r'```json\n(.*?)\n```', response.content, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group(1))
                else:
                    raise ValueError("Could not extract valid JSON from response")
            
            return result
            
        except Exception as e:
            # Log the error
            print(f"ImageAnalysisAgent error: {str(e)}")
            return {
                "refined_renovation_ideas": renovation_ideas.get("renovation_ideas", []),
                "additional_suggestions": [],
                "error": str(e)
            }