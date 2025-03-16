# agents/text_agent.py
from typing import Dict, Any
import json
import asyncio
from .base import BaseAgent

class TextAnalysisAgent(BaseAgent):
    """Agent for generating renovation ideas based on property text data."""
    
    PROMPT_TEMPLATE = """
    Given the following detailed property description, generate renovation ideas to increase its value:
    
    Property: {property_json}
    
    - Renovation ideas should include both structural and cosmetic improvements. Example renovation options include adding bedrooms, building an ADU, replacing carpet.
    - Provide detailed explanations for each suggestion.
    - Estimate the financial cost and required time based on property's geolocation and size.
    
    Return a structured JSON with the following format:
    {{
        "renovation_ideas": [
            {{
                "name": "Renovation name",
                "description": "Detailed description",
                "estimated_cost": {{"low": 1000, "medium": 2000, "high": 3000}},
                "estimated_value_add": {{"low": 2000, "medium": 3000, "high": 4000}},
                "roi": 150,
                "feasibility": "Easy/Moderate/Difficult",
                "timeline": "1-2 weeks"
            }}
        ]
    }}
    """
    
    async def process(self, property_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate renovation ideas based on property details."""
        try:
            property_json = json.dumps(property_data)
            prompt = self._create_prompt(
                self.PROMPT_TEMPLATE,
                property_json=property_json
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
            print(f"TextAnalysisAgent error: {str(e)}")
            # Return a minimal valid response
            return {
                "renovation_ideas": [],
                "error": str(e)
            }