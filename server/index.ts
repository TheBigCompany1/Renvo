import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { setupAuth } from "./auth";
import { WebhookHandlers } from "./webhookHandlers";

const app = express();

app.use(express.static('client/public'));

// Stripe Webhook - must be before express.json()
app.post(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, signature as string);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: `Webhook processing error: ${error.message}` });
    }
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

setupAuth(app);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    await db.execute(sql`
      ALTER TABLE analysis_reports 
      ADD COLUMN IF NOT EXISTS module_data jsonb;
    `);
    console.log("Verified database schema for module_data column.");

    // Phase 4: Bootstrap pgvector extension organically inside the Neon instance natively.
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);
    console.log("Verified pgvector extension is activated natively via Drizzle.");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        source_type text NOT NULL,
        verification_status text NOT NULL DEFAULT 'unverified',
        title text NOT NULL,
        content text NOT NULL,
        metadata jsonb,
        embedding text,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      );
    `);
    console.log("Verified database schema for knowledge_base table.");

    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false NOT NULL;
    `);
    console.log("Verified database schema for is_admin column.");
  } catch (err: any) {
    console.error("Failed to auto-migrate database schema columns:", err.message);
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
  });
})();
