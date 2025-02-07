import { Doc, Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { NavigationContext } from "@/lib/NavigationProvider";
import { use } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Button } from "./ui/button";
import { TrashIcon } from "@radix-ui/react-icons";


function ChatRow({
    chat, onDelete
}: {
    chat: Doc<"chats">,
    onDelete: (id: Id<"chats">) => void
}) {

    const router = useRouter();
    const { closeMobileNav } = use(NavigationContext);
    const lastMessage = useQuery(api.messages.getLastMessage, {
        chatId: chat._id,
      });

    const handleClick = () => {
        // this will push the route of the chat with that specific chat id
        router.push(`/dashboard/chat/${chat._id}`);
        closeMobileNav();
    }
    return (
        <div
        className="group rounded-xl border border-gray-200/30 bg-white/50 backdrop-blur-sm hover:bg-white/80 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md"
        onClick={handleClick}
      >
        <div className="p-4">
            <div className="flex justify-between items-start">
                <p className="text-sm text-gray-600 truncate flex-1 font-medium"> 
                    {/* This block will contain our last messages/ previous messages and be displayed in this block */}
                    {/* {lastMessage ? () : ()} */}
                </p>
                <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 -mr-2 -mt-2 ml-2 transition-opacity duration-200"
                    onClick={(e) => {
                    e.stopPropagation();
                    onDelete(chat._id);
                    }}
                >
            <TrashIcon className="h-4 w-4 text-gray-400 hover:text-red-500 transition-colors" />
          </Button>
            </div>
        </div>
            Messages
        </div>
    )
};

export default ChatRow;