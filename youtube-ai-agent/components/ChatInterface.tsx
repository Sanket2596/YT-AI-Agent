'use client';

import { Doc, Id } from "@/convex/_generated/dataModel";
import { useRef, useState, useEffect } from "react";
import { Button } from "./ui/button";
import { ArrowRight } from "lucide-react";
import { ChatRequestBody, StreamMessageType } from "@/lib/types";
import { createSSEParser } from "@/lib/createSSEparser";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

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

    const processStream = async (
        reader: ReadableStreamDefaultReader<Uint8Array>, 
        onChunk: (chunk: string) => Promise<void>
    ) => {
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = new TextDecoder().decode(value);
                await onChunk(chunk);
            }
        } catch (error) {
            
        } 
        
    }

    // this endRef scrolls to the bottom of the messsage list
    const messageEndRef = useRef<HTMLDivElement>(null);

    // if streamed message ever comes in scroll to the bottom of the screen or that particular message is what we're handling in this code piece
    useEffect(() => {
        messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, streamedResponse]);

    const formatToolOutput = (output: unknown): string => {
        if (typeof output === "string") return output;
        return JSON.stringify(output, null, 2);
    };
    

    const formatTerminalOutput = (
        tool: string,
        input: unknown,
        output: unknown
      ) => {
        const terminalHtml = `<div class="bg-[#1e1e1e] text-white font-mono p-2 rounded-md my-2 overflow-x-auto whitespace-normal max-w-[600px]">
          <div class="flex items-center gap-1.5 border-b border-gray-700 pb-1">
            <span class="text-red-500">●</span>
            <span class="text-yellow-500">●</span>
            <span class="text-green-500">●</span>
            <span class="text-gray-400 ml-1 text-sm">~/${tool}</span>
          </div>
          <div class="text-gray-400 mt-1">$ Input</div>
          <pre class="text-yellow-400 mt-0.5 whitespace-pre-wrap overflow-x-auto">${formatToolOutput(input)}</pre>
          <div class="text-gray-400 mt-2">$ Output</div>
          <pre class="text-green-400 mt-0.5 whitespace-pre-wrap overflow-x-auto">${formatToolOutput(output)}</pre>
        </div>`;
    
        return `---START---\n${terminalHtml}\n---END---`;
      };

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

            // ---- Handle the stream ---- 
            // Create SSE Parser to parse the response/ stream reader
            const parser = createSSEParser();
            const reader = response.body.getReader();
            
            // Process the stream -> getting those chunks back from the API Route and now parsing/ displaying onto the Frontend
            await processStream(reader, async (chunk) => {
                // List of Stream messages
                const messsages = parser.parse(chunk);
                
                // Handle each msg based on its type
                for (const message of messsages) {
                        switch (message.type) {
                            case StreamMessageType.Token: 
                               // handle streaming messages 
                               if("token" in message) {
                                    // update the response
                                    fullResponse += message.token;
                                    setStreamedResponse(fullResponse);   
                                }
                                break;
                            
                            case StreamMessageType.ToolStart:
                                // Handle start of Tool Exceution
                                if ('tool' in message) {
                                    setCurrentTool({
                                        name: message.tool,
                                        input: message.input,
                                    });
                                    fullResponse += formatTerminalOutput(
                                        message.tool,
                                        message.input,
                                        "Processing..."
                                    );
                                    setStreamedResponse(fullResponse);
                                }
                                break;
                            
                            case StreamMessageType.ToolEnd:
                                // Handle completion of tool execution
                                if ("tool" in message && currentTool) {
                                    // Replace the "Processing..." message with actual output
                                    const lastTerminalIndex = fullResponse.lastIndexOf(
                                    '<div class="bg-[#1e1e1e]'
                                    );
                                    if (lastTerminalIndex !== -1) {
                                    fullResponse =
                                        fullResponse.substring(0, lastTerminalIndex) +
                                        formatTerminalOutput(
                                        message.tool,
                                        currentTool.input,
                                        message.output
                                        );
                                    setStreamedResponse(fullResponse);
                                    }
                                    setCurrentTool(null);
                                }
                                break;

                                case StreamMessageType.Error:
                                    // Handle error messages from the stream
                                    if ("error" in message) {
                                        throw new Error(message.error);
                                    }
                                    break;
                                    
                                    case StreamMessageType.Done:
                                        // Handle completion of the entire response
                                        const assistantMessage: Doc<"messages"> = {
                                          _id: `temp_assistant_${Date.now()}`,
                                          chatId,
                                          content: fullResponse,
                                          role: "assistant",
                                          createdAt: Date.now(),
                                        } as Doc<"messages">;
                          
                                        // Save the complete message to the database
                                        const convex = getConvexClient();
                                        await convex.mutation(api.messages.store, {
                                          chatId,
                                          content: fullResponse,
                                          role: "assistant",
                                        });
                          
                                        setMessages((prev) => [...prev, assistantMessage]);
                                        setStreamedResponse("");
                                        return;
                            }                            
                        } 
            })
        } catch (error) {
            // Handling any kind of errors sent during streaming
            console.error("Error sending message:",error);
            // Handle errors here
            // Remove the optimistic user message if there was an error
            setMessages(prevMessages => prevMessages.filter((msg) => msg._id !== optimisticUserMessage._id));

            setStreamedResponse(
                formatTerminalOutput(
                    "error",
                    "Failed to process message",
                    error instanceof Error ? error.message : "Unkown Error"
                )
            );
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
