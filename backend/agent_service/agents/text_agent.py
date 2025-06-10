# agents/text_agent.py
from typing import Dict, Any
import json
import asyncio
from agents.base import BaseAgent

class TextAnalysisAgent(BaseAgent):
    """Agent for generating renovation ideas based on property text data."""

    # Updated Prompt Template
    PROMPT_TEMPLATE = """
    You are an expert real estate developer and financial strategist. Your primary goal is to identify the highest and best use for a property to maximize its financial potential.
    
    First, review all the details of the property provided in the JSON below.

    **PROPERTY DATA TO ANALYZE:**
    {property_json}

    **INSTRUCTIONS FOR RECOMMENDATIONS:**
    - **Think Big**: Based on the complete property data, generate a list of 3-5 transformative, large-scale project recommendations. Do NOT suggest simple cosmetic upgrades (e.g., "update kitchen," "landscape the yard").
    - **Include Ambitious Projects**: Your recommendations MUST include ideas from the following categories where appropriate:
        1.  Major Construction: Adding an Accessory Dwelling Unit (ADU), building a second story, or a significant square footage expansion.
        2.  Change of Use: Converting the property into a duplex, triplex, or condominiums.
        3.  Lot Development: Subdividing the lot.
        4.  Demolish and Rebuild: Tearing down the existing structure to build a modern spec home.
    - **Be Detailed**: For each idea, provide a detailed description and a realistic buyer profile.

    **INSTRUCTIONS FOR FINANCIAL ACCURACY:**
    - For EACH idea, you MUST perform an accurate ROI calculation using the formula: ((medium value add - medium cost) / medium cost) * 100.
    - Double-check your math. Ensure the final `roi` value is a standard integer or float.

    **CRITICAL OUTPUT FORMAT:**
    - Return ONLY a single, valid JSON object.
    - **Strictly adhere** to the following JSON structure from your original prompt.
    - **Numbers (cost, value_add, roi) MUST be standard integers or floats WITHOUT commas.**

    JSON Format:
    {{
        "renovation_ideas": [
            {{
                "name": "Renovation name",
                "description": "Detailed description of the large-scale project.",
                "estimated_cost": {{"low": 50000, "medium": 75000, "high": 100000}},
                "estimated_value_add": {{"low": 100000, "medium": 150000, "high": 200000}},
                "roi": 100,
                "feasibility": "Moderate/Difficult",
                "timeline": "6-12 months",
                "buyer_profile": "e.g., A real estate investor looking for rental income, or a developer."
            }}
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