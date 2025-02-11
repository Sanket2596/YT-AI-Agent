import { getConvexClient } from "@/lib/convex";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
    ChatRequestBody,
    StreamMessage,
    StreamMessageType,
    SSE_DATA_PREFIX,
    SSE_LINE_DELIMITER,
  } from "@/lib/types";
import { api } from "@/convex/_generated/api";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { submitQuestion } from "@/lib/langgraph";
  

function sendSSEMessage( writer: WritableStreamDefaultWriter<Uint8Array>, data: StreamMessage) {
    // helper function to send messages to the frontend
    const encoder = new TextEncoder();
    return writer.write(encoder.encode(`${SSE_DATA_PREFIX}${JSON.stringify(data)}${ SSE_LINE_DELIMITER }`))
}

export async function POST(req: Request) {
    try {
        // checking if the user is authenticated at first
        const { userId } = await auth();

        if(!userId) {
            return new Response("Unauthorized", { status: 401 });
        }

        const body = (await req.json()) as ChatRequestBody;

        const { messages, newMessage, chatId } = body;
        
        const convex = getConvexClient();

        // Create stream with larger queue strategy for better performance
        const stream = new TransformStream({}, { highWaterMark: 1024 });
        const writer = stream.writable.getWriter();

        const response = new Response(stream.readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
            }
        });


        // This will start our streaming server when we hit the route /api/chat/stream for our ServerSentEvents
        const startStream = async () => {
            try {
                // stream will be implented here
                
                // sending initial connection message -> saying initial connection is established
                // this helper function sendSSEMessage will be pivotal in setting up our streaming responses
                // handles our messages coming from our route to our frontend diaplying those responses on our Frontend
                await sendSSEMessage(writer, { type: StreamMessageType.Connected });

                // 2nd step -> storing the data in our convex DB
                await convex.mutation(api.messages.send, {
                    chatId,
                    content: newMessage,
                })

                // Convert messages to LangChain format
                // this will go forward and create a AIMessage or Human Message Instance for us
                const langChainMessages =  [
                    ...messages.map((msg) => 
                        msg.role === "user" ? new HumanMessage(msg.content) : new AIMessage(msg.content)
                    ),
                    new HumanMessage(newMessage),
                ];

                try {
                    // Create this event Stream here
                    const eventStream = await submitQuestion(langChainMessages, chatId);
                    // Proceesing those streamed events
                    for await (const event of eventStream) {
                        console.log("Event stream", event);
                        
                        // Check the event type and send the appropriate SSE message
                        if (event.event === "on_Chat_model_stream") {
                                const token = event.data.chunk;
                                if (token) {
                                    // Access the text property from the AIMessage
                                    const text = token.content.at(0)?.["text"];
                                    if (text) {
                                        await sendSSEMessage(writer, {
                                            type: StreamMessageType.Token,
                                            token: text,
                                        })
                                    }
                                }
                        }
                        else if (event.event === "on_tool_start") {
                            await sendSSEMessage(writer, {
                                type: StreamMessageType.ToolStart,
                                tool: event.name || "unkown",
                                input: event.data.input,
                            })
                        }
                        else if (event.event === "on_tool_end") {
                            const toolMessage = new ToolMessage(event.data.output);

                            await sendSSEMessage(writer, {
                                type: StreamMessageType.ToolEnd,
                                tool: toolMessage.lc_kwargs.name || "unkown",
                                output: event.data.output,
                            })
                        }

                        // Send the completion message without storing the response
                        await sendSSEMessage(writer, { type: StreamMessageType.Done });
                    }
                } catch (streamError) {
                    console.log("Error in event stream", streamError);
                    await sendSSEMessage(writer, { type: StreamMessageType.Error, error: streamError instanceof Error ? streamError.message : "Stream processing failed" });
                }

            } catch (error) {
                console.error("Error in Stream", error);
                await sendSSEMessage(writer,
                    {
                        type: StreamMessageType.Error,
                        error: error instanceof Error ? error.message : "Unkown Error"
                    }
                )
            } 
            finally {
                try {
                    await writer.close();
                } catch (closeError) {
                    console.error("Error closing writer", closeError);                 
                }
                
            }
        };
        startStream();
        
        return response;
    } catch (error) {
        console.error("Error in Chat API", error);
        return NextResponse.json({ error: "Internal Server Error" } as const , { status: 500 });
    }
};