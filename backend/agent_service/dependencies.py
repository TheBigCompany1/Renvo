from fastapi import Depends
from core.config import get_settings
from services.report_service import ReportService

# Create a singleton instance
_report_service_instance = None

def get_report_service():
    """Get a singleton instance of ReportService."""
    global _report_service_instance
    
    if _report_service_instance is None:
        _report_service_instance = ReportService()
    return _report_service_instance