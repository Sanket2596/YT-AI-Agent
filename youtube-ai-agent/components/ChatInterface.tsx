'use client';

import { Doc, Id } from "@/convex/_generated/dataModel";
import { useRef, useState, useEffect } from "react";
import { Button } from "./ui/button";
import { ArrowRight } from "lucide-react";
import { ChatRequestBody } from "@/lib/types";

interface ChatInterfaceProps {
    chatId: Id<"chats">;
    initialMessages: Doc<"messages">[];  
}

function ChatInterface({ chatId, initialMessages}: ChatInterfaceProps) {
    const [messages, setMessages] = useState<Doc<"messages">[]>(initialMessages);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // States to handle the messages after we hit the submit message.
    const [streamedResponse, setStreamedResponse] = useState("");
    const [currentTool, setCurrentTool] = useState<{
        name: string;
        input: unknown;

    } | null>(null);

    // this endRef scrolls to the bottom of the messsage list
    const messageEndRef = useRef<HTMLDivElement>(null);

    // if streamed message ever comes in scroll to the bottom of the screen or that particular message is what we're handling in this code piece
    useEffect(() => {
        messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, streamedResponse]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedInput = input.trim();
        if (!trimmedInput || isLoading) return;

        // Resetting all the UI States for new message
        setInput("");
        setStreamedResponse("");
        setCurrentTool(null);
        setIsLoading(true);

        // Optimistic UI update -> Add user's message immediately for better UX
        const optimisticUserMessage: Doc<"messages"> = {
            _id: `temp-${Date.now()}`,
            chatId,
            content: trimmedInput,
            role: "user",
            createdAt: Date.now(),       
        } as Doc<"messages">;
        setMessages(prevMessages => [...prevMessages, optimisticUserMessage]);

        // Tracking the complete response to save it to our Convex Database
        let fullResponse = "";

        // Start Streaming Response
        try {
            const requestBody: ChatRequestBody = {
                messages: messages.map((msg) => ({
                    role: msg.role,
                    content: msg.content,
                })),
                newMessage: trimmedInput,
                chatId,
            };

            // Intialize SSE Connection -> this is where the main part of the application happens after submitting the message
            const response = await fetch("/api/chat/stream", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                throw new Error(await response.text());
            };

            if (!response.body) {
                throw new Error("Response body is empty");
            };

            // Handle the stream
            

        } catch (error) {
            // Handling any kind of errors sent during streaming
            console.error("Error streaming response:");
            // Handle errors here
            // Remove the optimistic user message if there was an error
            setMessages(prevMessages => prevMessages.filter((msg) => msg._id !== optimisticUserMessage._id));

            setStreamedResponse("error");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <main className="flex flex-col h-[calc(100vh-theme(spacing.14))]">
            {/* Messages */}
            <section className="flex-1">
                <div>
                    {/* Messages */}

                    {/* Last Message */}
                    <div ref={messageEndRef} />
                    
                </div>
            </section>
            {/* Input - Footer */}
            <footer className="border-t bg-white p-4">
               <form onSubmit={handleSubmit}>
                    <div className="relative flex items-center">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Message AI Agent..."
                            className="flex-1 py-3 px-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12 bg-gray-50 placeholder:text-gray-500"
                            disabled={isLoading}
                        />
                        <Button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className={`absolute right-1.5 rounded-xl h-9 w-9 p-0 flex items-center justify-center transition-all ${
                                input.trim()
                                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                                : "bg-gray-100 text-gray-400"
                            }`}
                        >
                        <ArrowRight />
                        </Button>
                    </div>
               </form>
            </footer>
        </main>
  )
}

export default ChatInterface
