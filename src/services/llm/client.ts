import { GoogleGenAI } from "@google/genai";

// Lazy-initialized to avoid "API Key must be set" error at import time.
// The GoogleGenAI constructor throws when apiKey is empty/undefined,
// so we defer construction until the first actual call.
let _instance: GoogleGenAI | null = null;

function getInstance(): GoogleGenAI {
    if (!_instance) {
        const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY ?? '';
        _instance = new GoogleGenAI({ apiKey });
    }
    return _instance;
}

export const ai = new Proxy({} as GoogleGenAI, {
    get(_target, prop) {
        return (getInstance() as any)[prop];
    }
});
