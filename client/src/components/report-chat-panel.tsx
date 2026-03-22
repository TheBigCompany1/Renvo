import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { sendReportChatMessage } from "@/lib/api";

interface Message {
    role: 'user' | 'model';
    parts: [{ text: string }];
}

interface ReportChatPanelProps {
    reportId: string;
}

export function ReportChatPanel({ reportId }: ReportChatPanelProps) {
    const [messages, setMessages] = useState<Message[]>([{
        role: 'model',
        parts: [{ text: "Hi! I'm your Renvo AI Assistant. I've reviewed your property report. What questions do you have about the analysis, ROI, or renovation ideas?" }]
    }]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();

    useEffect(() => {
        // Scroll to bottom when messages change
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = { role: 'user', parts: [{ text: input }] };
        setMessages(prev => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            // Send history excluding the absolute newest user message
            const historyToSent = messages.length > 1 ? messages : [];

            const { reply } = await sendReportChatMessage(reportId, userMessage.parts[0].text, historyToSent);

            setMessages(prev => [...prev, { role: 'model', parts: [{ text: reply }] }]);
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to send message",
                variant: "destructive"
            });
            // Remove the user message if it failed so they can try again
            setMessages(prev => prev.slice(0, -1));
            setInput(userMessage.parts[0].text);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <Card className="flex flex-col h-[600px] xl:h-[calc(100vh-140px)] sticky top-6 shadow-xl border-teal-200">
            <CardHeader className="bg-teal-600 text-white rounded-t-xl py-4 pb-4">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Bot className="w-5 h-5" />
                    Report Assistant
                </CardTitle>
                <p className="text-teal-100 text-xs mt-1">Ask follow-up questions about this analysis.</p>
            </CardHeader>

            <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
                <ScrollArea className="flex-1 p-4 bg-gray-50">
                    <div className="space-y-4">
                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-teal-600 text-white'}`}>
                                    {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                                </div>
                                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-gray-100 border border-gray-200 text-gray-900 shadow-sm rounded-tl-sm'}`}>
                                    {/* Using basic pre-wrap for markdown spacing. Can integrate react-markdown if needed for fuller formatting */}
                                    <div className="whitespace-pre-wrap leading-relaxed">{msg.parts[0].text}</div>
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center shrink-0">
                                    <Bot className="w-4 h-4" />
                                </div>
                                <div className="bg-gray-100 border border-gray-200 text-gray-900 shadow-sm rounded-2xl rounded-tl-sm px-4 py-2 flex items-center w-fit">
                                    <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                                </div>
                            </div>
                        )}
                        <div ref={scrollRef} />
                    </div>
                </ScrollArea>

                <div className="p-4 bg-white border-t">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Ask about ROI, costs, etc..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isLoading}
                            className="flex-1"
                        />
                        <Button
                            size="icon"
                            className="bg-teal-600 hover:bg-teal-700"
                            onClick={handleSend}
                            disabled={isLoading || !input.trim()}
                        >
                            <Send className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
