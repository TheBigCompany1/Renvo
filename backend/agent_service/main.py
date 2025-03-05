# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import get_settings
from .routers import reports

# Create FastAPI app
settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    description="API for Renovation ROI Analysis",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Update this with your frontend URLs in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-Device-ID"],
)

# Include routers
app.include_router(reports.router, prefix=settings.api_prefix)

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Welcome to the Renvo API",
        "docs": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)