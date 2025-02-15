import { SSE_DONE_MESSAGE, StreamMessageType, SSE_DATA_PREFIX, StreamMessage } from "./types";


export const createSSEParser = () => {
    let buffer = "";

    // Creating a function to parse
    const parse = (chunk: string): StreamMessage[] => {
        // combine the buffer with new chunk and split into new lines
        const lines = (buffer + chunk).split("\n");
        // save last potentially incomplete chunk
        buffer = lines.pop() || "";
        return lines
        .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith(SSE_DATA_PREFIX)) return null;

            const data = trimmed.substring(SSE_DATA_PREFIX.length);
            if (data === SSE_DONE_MESSAGE) return { type: StreamMessageType.Done };

            try {
            const parsed = JSON.parse(data) as StreamMessage;
            return Object.values(StreamMessageType).includes(parsed.type)
                ? parsed
                : null;
            } catch {
            return {
                type: StreamMessageType.Error,
                error: "Failed to parse SSE message",
            };
            }
        })
        .filter((msg): msg is StreamMessage => msg !== null);

    }
return { parse };
};