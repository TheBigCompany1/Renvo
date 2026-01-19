# backend/agent_service/agents/base.py
import os
from langchain_google_genai import ChatGoogleGenerativeAI
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class BaseAgent(ABC):
    """
    Base class for all agents, using a shared Google Generative AI model instance.
    """
    
    # --- FIX: The __init__ method now accepts an already-initialized llm instance ---
    # This aligns with how the OrchestratorAgent creates the specialist agents
    # and resolves the ValidationError.
    def __init__(self, llm: ChatGoogleGenerativeAI):
        """Initializes the agent with a shared language model instance."""
        self.llm = llm
    
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
