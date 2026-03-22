import { GoogleGenAI } from "@google/genai";
import type { AnalysisReport } from "@shared/schema";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "" });

export async function chatWithReport(
    report: AnalysisReport,
    message: string,
    history: { role: 'user' | 'model', parts: [{ text: string }] }[] = []
): Promise<string> {
    try {
        const systemPrompt = `You are a helpful, expert real estate and renovation advisor. 
You are assisting a user who has just generated a property analysis report using Renvo.

Here is the full context of the report:
${JSON.stringify({
            property: report.propertyData,
            financialSummary: report.financialSummary,
            renovationProjects: report.renovationProjects,
            comparables: report.comparableProperties,
            neighborhood: report.mapsContext
        }, null, 2)}

Your goal is to answer the user's questions accurately using only the provided context. If they ask about information not present in the context (like recent news, highly specific building codes not mentioned, etc.), you should politely explain that you can only advise based on the generated report data.
Be concise, professional, and highlight ROI or value-add opportunities when relevant. Format your response in Markdown to be easily readable.`;

        // Keep the last 100 messages allowing for deep context
        const recentHistory = history.slice(-100);

        // Truncate user message to ~2,000,000 characters (approx 500k tokens limit per request)
        const truncatedMessage = message.length > 2000000 ? message.substring(0, 2000000) : message;

        const configuredChat = ai.chats.create({
            model: "gemini-2.5-flash",
            config: {
                systemInstruction: systemPrompt,
                maxOutputTokens: 8192, // 8192 is the absolute API maximum output per request for Flash 
            },
            history: recentHistory.map(msg => ({
                role: msg.role,
                parts: msg.parts
            }))
        });

        const response = await configuredChat.sendMessage({ message: truncatedMessage });
        return response.text || "I'm sorry, I couldn't generate a response.";

    } catch (error) {
        console.error("Error in chatWithReport:", error);
        throw new Error("Failed to generate chat response");
    }
}
