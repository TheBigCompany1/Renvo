# agents/base.py
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from langchain.chat_models import ChatOpenAI

class BaseAgent(ABC):
    """Base class for all agents in the system."""
    
    def __init__(self, llm: Optional[ChatOpenAI] = None):
        """Initialize the agent with an optional language model."""
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