# agents/text_agent.py
from typing import Dict, Any
import json
import asyncio
import re # Import regex module
from .base import BaseAgent

class TextAnalysisAgent(BaseAgent):
    """Agent for generating renovation ideas based on property text data."""

    # Updated Prompt Template
    PROMPT_TEMPLATE = """
    You are a real estate investment expert analyzing properties. Your analysis identifies potential ROI.
    Given the property details provided: {property_json}

    Generate renovation ideas to increase the property's value. For each idea:
    - Provide a detailed description, including specific finishes, styles, or amenities (e.g., ADU conversion with quartz countertops, modern fixtures).
    - Provide a brief demographic/behavioral profile of the ideal buyer (e.g., "young family seeking rental income").
    - Estimate the cost (low, medium, high) based on location and size.
    - Estimate the value add (low, medium, high).
    - Calculate ROI using ((medium value add - medium cost) / medium cost) * 100.

    **CRITICAL: Return ONLY a single, valid JSON object.**
    - **Strictly adhere** to the following JSON structure.
    - **Numbers (cost, value_add, roi) MUST be standard integers or floats WITHOUT commas.**
    - All strings (keys and values) MUST be enclosed in double quotes.
    - Do NOT include any introductory text, closing remarks, or markdown formatting like ```json.

    JSON Format:
    {{
        "renovation_ideas": [
            {{
                "name": "Renovation name",
                "description": "Detailed description",
                "estimated_cost": {{"low": 1000, "medium": 2000, "high": 3000}},
                "estimated_value_add": {{"low": 2000, "medium": 3000, "high": 4000}},
                "roi": 50, // Example: ((3000 - 2000) / 2000) * 100 = 50
                "feasibility": "Easy/Moderate/Difficult",
                "timeline": "1-2 weeks",
                "buyer_profile": "Example buyer profile"
            }}
            // ... more ideas
        ]
    }}
    """

    # --- Helper function to clean potential JSON issues ---
    def _clean_json_string(self, json_string: str) -> str:
        """Attempts to clean common issues in LLM-generated JSON strings."""
        # Remove commas within numbers (e.g., 80,000 -> 80000)
        # Looks for a digit, followed by a comma, followed by three digits
        cleaned_string = re.sub(r'(\d),(?=\d{3})', r'\1', json_string)
        # Add more cleaning steps here if other common errors are found
        return cleaned_string

    async def process(self, property_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate renovation ideas based on property details."""
        print("[TextAgent] Process started.")
        try:
            # Limit property data size if necessary (optional)
            # property_data_subset = {k: v for k, v in property_data.items() if k in ['address', 'price', 'beds', 'baths', 'sqft', 'yearBuilt', 'lotSize', 'homeType', 'description']}
            # property_json = json.dumps(property_data_subset, indent=2)
            property_json = json.dumps(property_data, indent=2) # Keep original for now

            prompt = self._create_prompt(
                self.PROMPT_TEMPLATE,
                property_json=property_json
            )
            print("[TextAgent] Sending prompt to LLM...")

            response = await asyncio.to_thread(
                self.llm.invoke,
                prompt
            )
            print("[TextAgent] Received response from LLM.")
            raw_content = response.content.strip() # Strip leading/trailing whitespace
            print(f"[TextAgent] Raw LLM content (stripped): {raw_content[:500]}...")

            # --- Parsing Logic ---
            result = None
            json_str_to_parse = None
            direct_parse_error = None
            extracted_parse_error = None

            # 1. Check if the raw content looks like JSON (starts with { ends with })
            if raw_content.startswith('{') and raw_content.endswith('}'):
                print("[TextAgent] Raw content looks like direct JSON. Attempting parse...")
                json_str_to_parse = raw_content
            else:
                # 2. If not direct JSON, try extracting from markdown ```json ... ```
                print("[TextAgent] Raw content doesn't look like direct JSON. Trying to extract from markdown.")
                match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw_content, re.DOTALL | re.IGNORECASE)
                if match:
                    print("[TextAgent] Found JSON within markdown fences.")
                    json_str_to_parse = match.group(1).strip() # Extract and strip again
                else:
                    print("[TextAgent] Could not find JSON within markdown fences.")
                    # No valid JSON structure found at all
                    return {
                        "renovation_ideas": [],
                        "error": f"LLM did not return valid JSON or markdown JSON. Raw content: {raw_content[:1000]}..."
                    }

            # 3. Attempt to parse the identified JSON string (if any)
            if json_str_to_parse:
                try:
                    # *** Add cleaning step before parsing ***
                    cleaned_json_str = self._clean_json_string(json_str_to_parse)
                    if cleaned_json_str != json_str_to_parse:
                        print("[TextAgent] Cleaned JSON string before parsing.")

                    result = json.loads(cleaned_json_str)
                    print("[TextAgent] Successfully parsed potentially cleaned JSON string.")
                except json.JSONDecodeError as e:
                    print(f"[TextAgent] JSON parsing failed: {e}. Raw string was: {json_str_to_parse[:500]}...")
                    # Store the relevant error message
                    if direct_parse_error is None and raw_content.startswith('{'): # If we tried direct parse
                         direct_parse_error = e
                    else: # If we tried parsing extracted content
                         extracted_parse_error = e


            # --- Handle Results ---
            if result is not None:
                print("[TextAgent] Process finished successfully.")
                if "renovation_ideas" not in result:
                     result["renovation_ideas"] = [] # Ensure key exists
                # Add an empty error field if none exists, for consistency
                if "error" not in result:
                    result["error"] = None
                return result
            else:
                # Construct error message based on what failed
                error_msg = "LLM returned invalid JSON. "
                if direct_parse_error:
                    error_msg += f"Direct parse error: {direct_parse_error}. "
                if extracted_parse_error:
                     error_msg += f"Extracted parse error: {extracted_parse_error}. "
                error_msg += f"Raw content: {raw_content[:1000]}..."
                print(f"[TextAgent] Returning error: {error_msg}")
                return {
                    "renovation_ideas": [],
                    "error": error_msg
                }

        except Exception as e:
            import traceback
            print(f"[TextAgent] General error in process: {str(e)}")
            print(f"[TextAgent] Traceback: {traceback.format_exc()}")
            return {
                "renovation_ideas": [],
                "error": f"General TextAgent error: {str(e)}"
            }