from langchain.chat_models import ChatOpenAI
from langchain.tools import Tool
from langchain.agents import initialize_agent, AgentType
from config import OPENAI_API_KEY

llm = ChatOpenAI(model_name="gpt-3.5-turbo-0125", openai_api_key=OPENAI_API_KEY)

# Text Agent: Generates renovation ideas
def generate_renovation_ideas_agent(property_json):
    """Generates renovation suggestions based on property details."""
    prompt = f"""
    Given the following property details, suggest the some renovation ideas to increase its value:
    {property_json}

    - Example rennovation options include add more bedrooms, build ADU, replace carpet
    - Suggest cost-effective improvements

    Return a structured JSON with ideas, estimated cost, and expected value increase.
    """
    response = llm.invoke(prompt)
    return response.content

# Image Agent: Evaluates renovation ideas & adds insights
def review_renovations_agent(image_urls, renovation_suggestions):
    """Evaluates if renovation ideas make sense based on property images."""
    prompt = f"""
    Review the following renovation suggestions based on these property images:
    Renovation Ideas: {renovation_suggestions}
    Images: {image_urls}

    - Check if the renovations are structurally feasible.
    - Expand each feasible idea wih some more detailed suggestions.
    - Identify additional improvements based on the images.
    - Flag any unrealistic suggestions.
    
    Return a refined renovation plan with updated recommendations.
    """
    response = llm.invoke(prompt)
    return response.content

text_agent = Tool(
    name="Text Agent",
    func=generate_renovation_ideas_agent,
    description="Generates renovation suggestions based on property details."
)

image_agent = Tool(
    name="Image Agent",
    func=review_renovations_agent,
    description="Evaluates renovation ideas based on property images and refines them."
)

# Initialize Multi-Agent System
orchestrator = initialize_agent(
    tools=[text_agent, image_agent],
    llm=llm,
    agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION,  # Lets the LLM decide agent actions
    verbose=True
)
