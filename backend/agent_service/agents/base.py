# backend/agent_service/agents/base.py
import os
from langchain_google_genai import ChatGoogleGenerativeAI
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class BaseAgent(ABC):
    """
    Base class for all agents, initializing a shared Google Generative AI model.
    """
    
    def __init__(self, model="gemini-1.5-flash", temperature=0.4):
        """Initializes the agent with the Google Generative AI model."""
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set.")
            
        self.llm = ChatGoogleGenerativeAI(
            model=model,
            temperature=temperature,
            google_api_key=gemini_api_key,
            convert_system_message_to_human=True # Ensures compatibility
        )
    
    @abstractmethod
    async def process(self, *args, **kwargs) -> Dict[str, Any]:
        """Process the input and return the result."""
        pass
    
    def _create_prompt(self, template: str, **kwargs) -> str:
        """Create a prompt from a template and variables."""
        return template.format(**kwargs)
    
    def __str__(self) -> str:
        """Return a string representation of the agent."""
        return self.__class__.__name__
