Overview
Renvo is an AI-powered real estate renovation analysis platform designed for investors. It scrapes property data, analyzes renovation opportunities using AI, finds comparable properties, and generates comprehensive reports including financial projections and contractor recommendations. The platform operates as a paid SaaS product, requiring user authentication via Replit Auth and Stripe payments for report generation. Its vision is to empower investors with data-driven insights for real estate decisions, offering a reliable and efficient alternative to traditional, costly data APIs.

User Preferences
Preferred communication style: Simple, everyday language.

System Architecture
UI/UX Decisions
The frontend is built with React, TypeScript, Vite, Wouter for routing, TanStack Query for server state, Tailwind CSS, and shadcn/ui for components, and lucide-react for icons. Key pages include Home, Pricing, Dashboard, Processing, Report View, Checkout Success, How It Works, and About.

Technical Implementations
Authentication: Replit Auth (OpenID Connect) with PostgreSQL for session storage. User profiles are synced from OIDC claims.
Payment System: Integrated with Stripe for managing subscriptions and one-time purchases. Features include tiered pricing, Stripe Checkout for payment processing, webhook handling for transaction events, and a credit management system. An admin bypass system allows specified users to skip payment and TOS checks.
Report Generation Pipeline: This asynchronous pipeline is the core of the service.
User input (address or URL) triggers report creation.
An authentication, TOS, and credit/subscription check precedes report generation.
Reports are initially set to 'pending' in the database.
Background processing involves a single Gemini API call to researchProperty for comprehensive data gathering (property details, comps, market analysis, renovation recommendations).
Image URLs (Street View, Satellite) are generated using Google Maps Static API.
Contractor recommendations are provided, with Gemini as a fallback.
Financial summaries and validation insights are calculated.
The report status is updated to 'completed' or 'failed' in the database.
AI Integration (Gemini):
Primary Research: Uses gemini-3-flash-preview with googleSearch grounding for property research, delivering structured JSON output with strict validation.
Contractor Recommendations: Gemini provides plausible recommendations when location-based searches yield no results.
Location Service: Extracts geographical data using Google Geocoding API.
Enhanced Imagery: Generates Google Maps Street View and Satellite image URLs.
Database: PostgreSQL with Drizzle ORM. Key tables include users (authentication, payment status), sessions (Express session storage), and analysis_reports (core report data, property details, renovation projects, financials).
API Endpoints: Comprehensive set of RESTful APIs for user status, TOS acceptance, Stripe checkout, report creation/retrieval, and Stripe webhooks.
System Design Choices
Asynchronous Processing: Reports are processed in the background, allowing the API to respond immediately, improving user experience.
Hybrid Input System: Supports both Redfin/Zillow/Realtor.com URLs and plain addresses, leveraging Gemini with Google Maps grounding for comprehensive analysis.
Data Integrity: Strict validation is in place to ensure real, verified property data, with clear error messages for data not found.
Cost Efficiency: The Gemini + Google Maps approach significantly reduces reliance on expensive paid property data APIs.
Security: Robust measures including SSRF protection for URLs, Stripe webhook signature verification, authenticated endpoints, server-side TOS enforcement, and input validation.
External Dependencies
Stripe: For payment processing, subscriptions, and credit management.
Google Gemini API: For AI-powered property research, renovation analysis, market insights, and contractor recommendations.
Google Maps Platform APIs:
Google Geocoding API: For extracting geographical data from addresses.
Google Maps Static API: For generating static map images.
Google Street View Static API: For generating Street View imagery.
Google Places API: For address autocomplete functionality.
PostgreSQL: Primary database for storing user data, session information, and all analysis reports.
Replit Auth: For user authentication and management.