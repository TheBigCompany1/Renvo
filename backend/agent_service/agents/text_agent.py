# agents/text_agent.py
from typing import Dict, Any, List
import json
import asyncio
import re
from agents.base import BaseAgent
from tools.search_tools import search_for_comparable_properties
from langchain_core.messages import ToolMessage
from pydantic import BaseModel, Field

class TextAnalysisAgent(BaseAgent):
    """Agent for generating renovation ideas with sourced cost data using tools."""

    PROMPT_TEMPLATE = """
    You are an expert real estate developer and financial strategist. Your primary goal is to identify the highest and best use for a property.
    
    First, review all the details of the property provided in the JSON below.

    PROPERTY DATA TO ANALYZE:
    {property_json}

    INSTRUCTIONS:
    1.  **Generate Big Ideas**: Create 3-5 transformative, large-scale project recommendations (e.g., ADU, duplex conversion, demolish and rebuild). Do not suggest minor cosmetic upgrades.
    2.  **Research Local Costs**: For EACH idea, you MUST use the `search_for_comparable_properties` tool to find localized construction costs. Example search query: "average cost to build an ADU in Los Angeles County".
    3.  **Provide Sourced Estimates**: Use the search results to provide an accurate `estimated_cost`. You MUST also add a `cost_source` key citing the source of your cost data (e.g., "Source: Forbes Home, 2025 Cost Report").
    4.  **Actionable Steps & Risks**: For each idea, create a `roadmap_steps` list with 3-5 key actions the user should take to start the project (e.g., "Consult an architect specializing in local code," "Secure financing via a HELOC or construction loan.").
    5.  **Identify Risks**: For each idea, create a `potential_risks` list identifying 2-3 potential hurdles (e.g., "Permitting delays in this city are common," "Budget may increase due to foundation issues in older homes.").
    6.  **Ensure Financial Accuracy**: Calculate the ROI precisely using the formula: ((medium value add - medium cost) / medium cost) * 100.

    CRITICAL OUTPUT FORMAT:
    - Return ONLY a single, valid JSON object that strictly adheres to the format below.
    - Numbers MUST be standard integers or floats WITHOUT commas.

    JSON Format:
    {{
        "renovation_ideas": [
            {{
                "name": "Renovation name",
                "description": "Detailed description of the large-scale project.",
                "estimated_cost": {{"low": 75000, "medium": 100000, "high": 125000}},
                "cost_source": "Source of the cost data, e.g., 'National Association of Realtors 2025 Report'",
                "estimated_value_add": {{"low": 150000, "medium": 200000, "high": 250000}},
                "roi": 100,
                "feasibility": "Moderate/Difficult",
                "timeline": "6-12 months",
                "buyer_profile": "e.g., A real estate investor or developer.",
                "roadmap_steps": ["First step of the plan.", "Second step of the plan.", "Third step of the plan."],
                "potential_risks": ["First potential risk.", "Second potential risk."]
            }}
        ]
    }}
    """
    
    def __init__(self, llm):
        super().__init__(llm)
        self.llm_with_tools = self.llm.bind_tools([search_for_comparable_properties])

    def _clean_json_string(self, json_string: str) -> str:
        """Attempts to clean common issues in LLM-generated JSON strings."""
        cleaned_string = re.sub(r'(\d),(?=\d{3})', r'\1', json_string)
        return cleaned_string

    async def process(self, property_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate renovation ideas based on property details."""
        print("[TextAgent] Process started.")
        try:
            property_json = json.dumps(property_data, indent=2)

            prompt = self._create_prompt(
                self.PROMPT_TEMPLATE,
                property_json=property_json
            )
            
            print("[TextAgent] Initial call to LLM with tools...")
            ai_msg = await asyncio.to_thread(self.llm_with_tools.invoke, prompt)
            
            tool_calls = getattr(ai_msg, 'tool_calls', []) or []
            
            if not tool_calls:
                print("[TextAgent] No tool call was requested by LLM.")
                response_content = ai_msg.content
            else:
                print(f"[TextAgent] LLM requested to use {len(tool_calls)} tool(s).")
                # --- START OF CORRECTED PARALLEL HANDLING ---
                tool_outputs = []
                for tool_call in tool_calls:
                    tool_name = tool_call.get("name")
                    print(f"[TextAgent] Executing tool: {tool_name} with args: {tool_call.get('args')}")
                    if tool_name == "search_for_comparable_properties":
                        output = search_for_comparable_properties.invoke(tool_call.get('args'))
                        tool_outputs.append(ToolMessage(content=str(output), tool_call_id=tool_call['id']))

                print("[TextAgent] Calling LLM again with all tool outputs...")
                # The history should be [original_ai_message, tool_message_1, tool_message_2, ...]
                history = [ai_msg] + tool_outputs
                final_response = await asyncio.to_thread(self.llm_with_tools.invoke, history)
                response_content = final_response.content
                # --- END OF CORRECTED PARALLEL HANDLING ---

            print("[TextAgent] Received response from LLM.")
            raw_content = response_content.strip()
            print(f"[TextAgent] Raw LLM content (stripped): {raw_content[:500]}...")

            result = None
            json_str_to_parse = None
            direct_parse_error = None
            extracted_parse_error = None

            if raw_content.startswith('{') and raw_content.endswith('}'):
                print("[TextAgent] Raw content looks like direct JSON. Attempting parse...")
                json_str_to_parse = raw_content
            else:
                print("[TextAgent] Raw content doesn't look like direct JSON. Trying to extract from markdown.")
                match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw_content, re.DOTALL | re.IGNORECASE)
                if match:
                    print("[TextAgent] Found JSON within markdown fences.")
                    json_str_to_parse = match.group(1).strip()
                else:
                    print("[TextAgent] Could not find JSON within markdown fences.")
                    return {"renovation_ideas": [], "error": f"LLM did not return valid JSON or markdown JSON. Raw content: {raw_content[:1000]}..."}

            if json_str_to_parse:
                try:
                    cleaned_json_str = self._clean_json_string(json_str_to_parse)
                    if cleaned_json_str != json_str_to_parse:
                        print("[TextAgent] Cleaned JSON string before parsing.")
                    result = json.loads(cleaned_json_str)
                    print("[TextAgent] Successfully parsed potentially cleaned JSON string.")
                except json.JSONDecodeError as e:
                    print(f"[TextAgent] JSON parsing failed: {e}. Raw string was: {json_str_to_parse[:500]}...")
                    if direct_parse_error is None and raw_content.startswith('{'):
                         direct_parse_error = e
                    else:
                         extracted_parse_error = e
            
            if result is not None:
                print("[TextAgent] Process finished successfully.")
                if "renovation_ideas" not in result:
                     result["renovation_ideas"] = []
                if "error" not in result:
                    result["error"] = None
                return result
            else:
                error_msg = "LLM returned invalid JSON. "
                if direct_parse_error:
                    error_msg += f"Direct parse error: {direct_parse_error}. "
                if extracted_parse_error:
                     error_msg += f"Extracted parse error: {extracted_parse_error}. "
                error_msg += f"Raw content: {raw_content[:1000]}..."
                print(f"[TextAgent] Returning error: {error_msg}")
                return {"renovation_ideas": [], "error": error_msg}

        except Exception as e:
            import traceback
            print(f"[TextAgent] General error in process: {str(e)}")
            print(f"[TextAgent] Traceback: {traceback.format_exc()}")
            return {"renovation_ideas": [], "error": f"General TextAgent error: {str(e)}"}