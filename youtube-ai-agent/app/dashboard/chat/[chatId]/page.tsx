import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import React from 'react';
import { getConvexClient } from '@/lib/convex';
import ChatInterface from '@/components/ChatInterface';

interface ChatPageProps {
    params: Promise<{
        chatId: Id<"chats">;
    }>
};

async function ChatPage({
    params
}: ChatPageProps) {
    const { chatId } = await params;
    // Fetch chat data from the server using the chatId

    // Get User  authentication
    const { userId } = await auth();

    if (!userId) {
        redirect("/");
    }

    try {
        const convex = getConvexClient();

        // Get initial messages from the server
        const initialMessages = await convex.query(api.messages.list, { chatId });
    
        return (
        <div className='flex-1 overflow-hidden'>
            <ChatInterface chatId={chatId} initialMessages={initialMessages}/>
        </div>
      )
    } catch (error) {
        console.log(" Error loading chat", error);
        redirect("/dashboard");
    }
   
}

export default ChatPage;
