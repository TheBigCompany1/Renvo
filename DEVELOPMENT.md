# Development Workflow Guide

This guide explains how to set up your local environment to test changes safely before pushing to production.

## 1. Local Environment Setup

### Step A: Install Dependencies
Ensure you have Node.js installed, then run:
```bash
npm install
```

### Step B: Configure Environment Variables
You need a local `.env` file to store your API keys. This file is ignored by Git for security.

1.  Copy the example file:
    ```bash
    cp .env.example .env
    ```
2.  Open `.env` and fill in your real keys:
    *   `DATABASE_URL`: Your Neon Postgres connection string.
    *   `STRIPE_SECRET_KEY`: Your Stripe Secret Key.
    *   `STRIPE_PUBLISHABLE_KEY`: Your Stripe Publishable Key.
    *   `GEMINI_API_KEY`: Your Gemini API Key.
    *   `SESSION_SECRET`: Any random string (e.g., "local-secret").

### Step C: Run Development Server
To start the app locally:
```bash
npm run dev
```
-   The app will run at `http://localhost:5000`.
-   This server **auto-reloads** when you save changes to files.

## 2. Safe Testing Workflow (Git Branches)

Instead of working directly on `main` (which deploys to production), use **Feature Branches**.

### 1. Create a Branch
When starting new work (e.g., adding a feature or fixing a bug):
```bash
git checkout -b feature/my-new-feature
```

### 2. Make Changes & Test
-   Edit your code.
-   Verify changes locally at `http://localhost:5000`.

### 3. Commit Changes
```bash
git add .
git commit -m "Description of what I changed"
```

### 4. Push & Pull Request (Optional but Recommended)
Push your branch to GitHub:
```bash
git push -u origin feature/my-new-feature
```
-   Go to GitHub and open a **Pull Request (PR)** to merge into `main`.
-   Review your changes there.

### 5. Merge to Deploy
Once you are happy with the changes:
1.  Merge the PR on GitHub, **OR**
2.  Merge locally and push main:
    ```bash
    git checkout main
    git merge feature/my-new-feature
    git push origin main
    ```
-   **Pushing to `main` triggers a deploy to Render.**

## 3. Database Changes
If you modify `shared/schema.ts` (e.g., add a column):
1.  Run the migration tool locally:
    ```bash
    npm run db:push
    ```
    *(Requires `DATABASE_URL` in your `.env` file)*
    *(Requires `DATABASE_URL` in your `.env` file)*

## 4. Staging Environment (Optional)
You can set up a **Staging** version of the app on Render to test changes in a live environment before Production.

1.  **Create Staging Branch**:
    ```bash
    git checkout -b test-staging
    git push -u origin test-staging
    ```
2.  **Create New Service in Render**:
    *   Go to Render Dashboard > **New +** > **Web Service**.
    *   Connect the same `renvo` repository.
    *   **Important**: In the "Branch" dropdown, select `test-staging` (instead of `main`).
    *   You can name this service `renvo-staging`.
3.  **Deploying to Staging**:
    *   Pushing to the `test-staging` branch will auto-deploy to this new URL (e.g., `renvo-staging.onrender.com`).
    *   Once verified on Staging, you can merge `test-staging` into `main` to deploy to Production.
