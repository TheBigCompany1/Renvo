# Overview

Renvo is an AI-powered real estate renovation analysis platform that helps investors make data-driven decisions. The application scrapes property data from Redfin URLs, analyzes renovation opportunities using AI, finds comparable properties, and provides comprehensive reports with financial projections and contractor recommendations.

The platform now includes comprehensive marketing pages and lead generation capabilities to convert visitors into users and capture valuable contact information for nurturing potential customers.

# Recent Changes

## Gemini Deep Research Agent Integration (January 2026)

Switched from regular Gemini API to the actual Deep Research agent (Interactions API):

**Changes Made:**
- **Package Upgrade**: Updated `@google/genai` from 1.19.0 to 1.34.0 to enable Interactions API
- **Deep Research Agent**: Now uses `deep-research-pro-preview-12-2025` agent for autonomous web research
- **Response Parsing**: Fixed `pollResearchStatus` to correctly extract text from `outputs[].text` structure
- **Data Validation**: Added guards to prevent fabricated data - fails explicitly if no meaningful content extracted

**How It Works:**
- Address inputs trigger Deep Research agent which autonomously browses the web
- Agent researches property details, comparables, neighborhood data, and market trends
- Results are synthesized into a comprehensive report with citations
- Takes 1-3 minutes for thorough research vs seconds for basic AI queries

## Data Integrity Fix - No Fake Fallback Data (January 2026)

Fixed critical data integrity issue where the Redfin scraper would silently return fake property data when scraping failed:

**Changes Made:**
- **Scraper**: Removed silent fallback that returned mock data ($850k, 3 bed, 2 bath, stock image) on failure - now throws explicit SCRAPE_FAILED error
- **Schema**: Added `failureReason` and `dataSource` fields to track data provenance and error details
- **Storage**: Fixed persistence using `if ('failureReason' in data)` guard instead of truthy check to allow null/empty values
- **Routes**: Proper error handling captures failure reasons and sets dataSource on success ('redfin_scraper' or 'deep_research')
- **Frontend**: Processing page shows dedicated error state with user-friendly message and retry options when status is 'failed'

This ensures users never see fabricated data - they either get real property data or a clear error message explaining what went wrong.

## Hybrid Input System - Gemini + Google Maps + Redfin (November 2025)

Evolved from Redfin-only to a hybrid system that accepts BOTH Redfin URLs and plain addresses, using Gemini AI with Google Maps grounding for comprehensive property analysis without dependency on paid property data APIs.

**Foundation Infrastructure (Completed):**

- **Schema Updates**: Added support for dual input types with new fields:
  - `propertyAddress`: Direct address input field (alternative to URL)
  - `inputType`: Enum tracking whether input was 'url' or 'address'
  - `geoData`: Geocoded location data (lat/lng, formatted address, place ID)
  - `imagery`: References to Street View and Satellite imagery
  - `visionAnalysis`: AI-generated analysis from visual property inspection
  - `mapsContext`: Neighborhood context from Google Maps grounding
  
- **Storage Layer**: Updated both MemStorage and PostgresStorage to persist all new fields
  - Fixed critical bug where PostgresStorage would silently drop new fields in production
  - Both backends now properly round-trip expanded report data
  
- **Backend Routes**: Implemented input detection and branching logic
  - POST /api/reports validates both URL and address inputs with Zod
  - processAnalysisReport branches on inputType (url → Redfin scraper, address → Maps/Gemini)
  - Fixed all null handling issues to prevent crashes during address-only workflows
  - extractLocationFromProperty updated to accept optional URL parameter

**Architecture Benefits:**
- 80-95% cost savings vs paid property data APIs ($0.02-0.03 vs $0.12-0.50 per analysis)
- 100% property coverage (vs 2-3% for MLS-only APIs)
- Visual analysis capability for ANY property using Street View + Satellite imagery
- Gemini's Google Maps grounding provides rich neighborhood context

**Completed Implementation (December 2025):**
- Gemini-based geocoding and address validation
- Neighborhood context with POIs and market insights
- Location parsing for various address formats (including USA suffix)
- Vision analysis infrastructure (requires Google Maps API key with Static APIs enabled)
- End-to-end tested with both Redfin URLs and plain addresses

**Configuration Note - Vision Analysis:**
To enable visual property analysis from Street View and Satellite imagery, a Google Cloud API key with the following services enabled is required:
- Maps Static API
- Street View Static API
The GEMINI_API_KEY is for AI models only and doesn't provide access to Maps imagery. Without a properly configured Maps API key, the system gracefully falls back to text-only analysis.

## Redfin Deep Link Support (October 2025)

Added support for Redfin mobile app deep link URLs (redf.in):

- **URL Validation**: Updated routes to accept redf.in URLs alongside redfin.com
- **Scraper Integration**: Modified scraper to validate and process redf.in short links
- **Automatic Redirect Following**: Leverages Node's built-in fetch to automatically follow redirects from short links to full property pages
- **Security**: Maintains strict SSRF protections with explicit host whitelist validation
- **User Experience**: Users can now paste URLs directly from the Redfin mobile app share function

## Marketing Pages and Lead Generation (September 2025)

Added comprehensive marketing infrastructure to enhance user acquisition and lead generation:

- **How It Works Page**: Step-by-step explanation of the property analysis process with clear value propositions
- **Pricing Page**: Tiered pricing structure (Free/Pro/Enterprise) with integrated email signup functionality
- **About Page**: Company mission, technology features, team expertise, and vision with trust-building metrics
- **Header Navigation**: Updated to include links to all marketing pages for improved discoverability
- **Email Capture System**: Complete lead generation infrastructure integrated throughout the user journey

## Email Capture and Lead Generation

Implemented comprehensive email capture system for lead generation:

- **Database Schema**: Added emailSignups table with fields for email, signupSource, and timestamps
- **API Endpoints**: RESTful endpoints for email signup creation and retrieval
- **Reusable Component**: Flexible EmailSignup component with customizable styling and messaging
- **Analysis Flow Integration**: Email capture gate added before users can access property analysis results
- **Source Tracking**: Tracks signup sources (pricing-page, property-analysis, etc.) for analytics

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The client is built with React and TypeScript, using a modern component-based architecture:

- **UI Framework**: React with TypeScript for type safety
- **Styling**: Tailwind CSS with a comprehensive design system using CSS custom properties
- **Component Library**: Radix UI primitives with custom shadcn/ui components for consistent design
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query for server state management and caching
- **Build Tool**: Vite for fast development and optimized builds

The frontend follows a page-based routing structure with comprehensive views:
- Home page for URL input and property analysis initiation
- Processing page showing real-time analysis progress with email capture gate
- Report page displaying comprehensive analysis results
- How It Works page explaining the 3-step analysis process
- Pricing page with tiered plans and integrated email signup
- About page showcasing company mission and technology

## Backend Architecture

The server uses Express.js with TypeScript in a modern ESM setup:

- **Web Framework**: Express.js with middleware for JSON parsing and request logging
- **Development Setup**: Hot reloading with Vite integration for seamless development
- **API Design**: RESTful endpoints for creating and retrieving analysis reports
- **Error Handling**: Centralized error handling with proper HTTP status codes

The backend implements an asynchronous processing pattern where reports are created immediately and processed in the background, allowing users to track progress in real-time.

## Data Storage Solutions

The application uses a hybrid storage approach:

- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Schema Management**: Drizzle Kit for migrations and schema changes
- **Development Storage**: In-memory storage implementation for rapid development
- **Connection**: Neon Database serverless PostgreSQL for production

The schema includes tables for users, analysis reports, and email signups, with JSONB columns for flexible storage of complex data structures like renovation projects and comparable properties. The email signups table tracks lead generation with signup source attribution for marketing analytics.

## Authentication and Authorization

Currently implements a basic user system with:
- User registration and login capabilities
- Session-based authentication (infrastructure present but not fully implemented)
- User identification for report ownership

## AI Integration and Analysis

The application leverages OpenAI's GPT models for intelligent renovation analysis:

- **AI Model**: Uses the latest GPT model for property analysis
- **Analysis Scope**: Identifies 3-5 most profitable renovation opportunities
- **Input Processing**: Analyzes property data, images, and market context
- **Output Structure**: Structured JSON responses with cost estimates, ROI calculations, and project timelines

The AI system considers current market trends, property characteristics, and financial viability when recommending renovations.

## External Dependencies

- **Database**: Neon Database (PostgreSQL serverless)
- **AI Services**: OpenAI API for property analysis and renovation recommendations
- **Web Scraping**: Property data extraction from Redfin (redfin.com and redf.in mobile deep links)
- **UI Components**: Radix UI primitives for accessible component foundation
- **Styling**: Tailwind CSS for utility-first styling
- **State Management**: TanStack Query for server state and caching
- **Development Tools**: Vite for build tooling and development server
- **Type Safety**: TypeScript throughout the stack with Zod for runtime validation

The application uses modern web standards and best practices, with a focus on type safety, performance, and user experience. The architecture supports real-time updates through polling and provides a scalable foundation for additional features.