import { ChatAnthropic } from "@langchain/anthropic";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import wxflows from "@wxflows/sdk/langchain";
import {
    END,
    MemorySaver,
    MessagesAnnotation,
    START,
    StateGraph,
  } from "@langchain/langgraph";

import { 
    ChatPromptTemplate, 
    MessagesPlaceholder,
} from "@langchain/core/prompts";

import SYSTEM_MESSAGE from "@/constants/systemMessage";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage, trimMessages } from "@langchain/core/messages";


// Trim the messages to manage conversation history
const trimmer = trimMessages({
    maxTokens: 10,
    strategy: "last",
    tokenCounter: (msgs) => msgs.length,
    includeSystem: true,
    allowPartial: true,
    startOn: "human",
});


// Setting up tools to connect with our database and get those yout-tube transcripts extracted from our tools
// Connecting to Tools
const toolClient = new wxflows({
    endpoint: process.env.WXFLOWS_ENDPOINT || "",
    apikey: process.env.WXFLOWS_API_KEY,
});

// Retrieve Tools
const tools = await toolClient.lcTools;
const toolNode = new ToolNode(tools);

export const initialiseModel = () => {
    const model = new ChatAnthropic({ 
        model: "claude-3-5-sonnet-20241022", // Model name
        anthropicApiKey: process.env.ANTROPHIC_API_KEY,
        temperature: 0.7, // Higher temperature means the model will give more creative responses
        maxTokens: 4096, // Higher max tokens for longer responses
        streaming: true, // Enable streaming for faster responses -> SSE
        clientOptions: {
            defaultHeaders: {
                "antrophic-beta": "prompt-caching-2024-07-31"
            },
        },
        callbacks: [
            {
                handleLLMStart: async () => {
                    console.log("Starting LLM Call");
                },
                handleLLMEnd: async (output) => {
                    console.log("Ending LLM Call", output);
                    const usage = output.llmOutput?.usage;
                    if (usage) {
                        // console.log("📊 Token Usage:", {
                        //   input_tokens: usage.input_tokens,
                        //   output_tokens: usage.output_tokens,
                        //   total_tokens: usage.input_tokens + usage.output_tokens,
                        //   cache_creation_input_tokens:
                        //     usage.cache_creation_input_tokens || 0,
                        //   cache_read_input_tokens: usage.cache_read_input_tokens || 0,
                        // });
                    }
                },
                // handleLLMNewToken: async (token: string) => {
                //   console.log("🔤 New token:", token);
                // },
            }
        ]
    }).bindTools(tools);
    return model;
};

function shouldContinue(state: typeof MessagesAnnotation.State) {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1] as AIMessage;

  // If the LLM makes a tool call, then we route to the "tools" node
  if (lastMessage.tool_calls?.length) {
    return "tools";
  }

  // If the last message is a tool message, route back to agent
  if (lastMessage.content && lastMessage._getType() === "tool") {
    return "agent";
  }

  // Otherwise, we stop (reply to the user)
  return END;
}

const createWorkflow = () => {
    const model = initialiseModel();
    // StateGraph is a graph of flow for our LLM's -> it's going to create mainly a memory for us
    // It will create mainly decisions for us -> Yes / No decisions and adding nodes to it 
    // it will consists of conditional edges
    const stateGraph = new StateGraph(MessagesAnnotation).addNode(
        "agent",
        // create the system message content
        async (state) => {
            const systemContent = SYSTEM_MESSAGE;
            // Create Prompt Template with system message and message placeholder
            // The system message (SYSTEM_MESSAGE) serves as a predefined template or guideline for the agent's behavior. 
            // It can include instructions, rules, or context that the agent should follow when interacting with users.
            // System messages are useful for setting the tone, context, and constraints for the agent's responses, ensuring consistency and adherence to specific guidelines.
            // Prompt templates are a concept in LangChain designed to assist with this transformation -> transforming the raw user input into a list of messages that can be passed into a language model.
            // They take in raw user input and return data (a prompt) that is ready to pass into a language model.
            const promptTemplate = ChatPromptTemplate.fromMessages([
                new SystemMessage(systemContent, {
                    cache_control: { type: "ephemeral" } // Set a cache break point for the system message
                }),
                new MessagesPlaceholder("message"),
            ]);

            // Trim the messages to manage conversation history
            const trimmedMessages = await trimmer.invoke(state.messages);

            // Format the prompt message with the current message
            const prompt = await promptTemplate.invoke({
                messages: trimmedMessages,
            });

            // Get the message from the model and then this will invoke the chain of events of our messages
            const response = await model.invoke(prompt);
            // This will return Chunks of AI messages
            return { response: [response] };
        }
        // wheneever tools node is referred we're going to call the toolNode function in here
    )
    .addEdge(START, "agent")
    .addNode("tools", toolNode)
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");

    return stateGraph;
}

function addCachingHeaders(messages: BaseMessage[]): BaseMessage[] {
    // Rules of caching Headers for turn-by-turn conversations.
    // The caching headers are used to manage the caching of messages in a conversation.
    if (!messages.length) {
        return messages;
    }
    // Create a copy of messages to avoid mutating the original copy of the message
    const cachedMessages = [...messages];

    // Helper to add Cache Control
    function addCache (messages: BaseMessage) {
        messages.content = [
            {
                type: "text",
                text: messages.content as string,
                cache_control: { type: "ephemeral" }, // Cache messages for 1 minute
            }
        ]
    };

    // Cache the last message
    // console.log("Cached Messages", cachedMessages);
    addCache(cachedMessages.at(-1)!);

    // Find and cache the second-to-last Human message here
    let humanCount = 0;
    for (let i = cachedMessages.length - 1; i >= 0; i--) {
        if (cachedMessages[i] instanceof HumanMessage) {
            humanCount++;
            if (humanCount === 2) {
                addCache(cachedMessages[i]);
                break;
            }
        }
    }
    
        return cachedMessages;
}


export async function submitQuestion(messages: BaseMessage[], chatId: string) {

    // Adding caching headers to messages
    const cachedMessages = addCachingHeaders(messages);
    console.log("Messsages", cachedMessages);

    const workflow = createWorkflow();

    // Creating a checkpoint to save the state of the conversation
    const checkpointer = new MemorySaver();
    const app = workflow.compile({ checkpointer });

    // Run the graph now and stream the responses that we've got from hitting our model (Claude)
    const stream = app.streamEvents(
        {
            messages: cachedMessages
        },
        {
            version: "v2",
            configurable: { thread_id: chatId },
            streamMode: "messages",
            runId: chatId,
        }
    );
      return stream; 
};
