import { ChatAnthropic } from "@langchain/anthropic";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import wxflows from "@wxflows/sdk/langchain";
import {
    END,
    MessagesAnnotation,
    START,
    StateGraph,
  } from "@langchain/langgraph";

import { 
    ChatPromptTemplate, 
    MessagesPlaceholder,
} from "@langchain/core/prompts";

import SYSTEM_MESSAGE from "@/constants/systemMessage";
import { SystemMessage } from "@langchain/core/messages";

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
            //System messages are useful for setting the tone, context, and constraints for the agent's responses, ensuring consistency and adherence to specific guidelines.
            const promptTemplate = ChatPromptTemplate.fromMessages([
                new SystemMessage(systemContent, {
                    cache_control: { type: "ephemeral" } // Set a cache break point for the system message
                }),
                new MessagesPlaceholder("message"),
            ]);

        }
    )
    
    
}
