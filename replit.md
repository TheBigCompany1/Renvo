# Overview

Renvo is an AI-powered real estate renovation analysis platform that helps investors make data-driven decisions. The application scrapes property data from Redfin URLs, analyzes renovation opportunities using AI, finds comparable properties, and provides comprehensive reports with financial projections and contractor recommendations.

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

The frontend follows a page-based routing structure with three main views:
- Home page for URL input
- Processing page showing real-time analysis progress
- Report page displaying comprehensive results

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

The schema includes tables for users and analysis reports, with JSONB columns for flexible storage of complex data structures like renovation projects and comparable properties.

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
- **Web Scraping**: Property data extraction from Redfin (currently mocked for development)
- **UI Components**: Radix UI primitives for accessible component foundation
- **Styling**: Tailwind CSS for utility-first styling
- **State Management**: TanStack Query for server state and caching
- **Development Tools**: Vite for build tooling and development server
- **Type Safety**: TypeScript throughout the stack with Zod for runtime validation

The application uses modern web standards and best practices, with a focus on type safety, performance, and user experience. The architecture supports real-time updates through polling and provides a scalable foundation for additional features.