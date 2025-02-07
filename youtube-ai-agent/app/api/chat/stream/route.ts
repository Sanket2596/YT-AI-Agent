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

                // 2nd step -> storing the data in pur convex DB
                await convex.mutation(api.messages.send, {
                    chatId,
                    content: newMessage,
                })

            } catch (error) {
                console.error("Error in Chat API", error);
                return NextResponse.json({ error: "Internal Server Error" } as const , { status: 500 });
            }  
        };
        startStream();
        
        return response;
    } catch (error) {
        console.error("Error in Chat API", error);
        return NextResponse.json({ error: "Internal Server Error" } as const , { status: 500 });
    }
};