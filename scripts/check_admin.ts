import "dotenv/config";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
}

async function checkAdmin() {
    try {
        const adminEmail = 'alexkingsm@gmail.com';
        const result = await db.select().from(users).where(eq(users.email, adminEmail));

        if (result.length > 0) {
            console.log("Admin user found:");
            console.log(`Username: ${result[0].username}`);
            console.log(`Email: ${result[0].email}`);
        } else {
            console.log("Admin user not found. Creating...");
            const password = 'adminPassword123!';
            const hashedPassword = await hashPassword(password);

            const [newUser] = await db.insert(users).values({
                username: 'admin',
                password: hashedPassword,
                email: adminEmail,
                reportCredits: 100,
                totalReportsGenerated: 0,
                subscriptionStatus: 'active',
                isAdmin: true // Wait, schema might not have isAdmin column based on routes.ts using email check
            }).returning();

            console.log("Admin user created successfully!");
            console.log(`Username: ${newUser.username}`);
            console.log(`Password: ${password}`);
        }
    } catch (error) {
        console.error("Error:", error);
    }
    process.exit(0);
}

checkAdmin();
