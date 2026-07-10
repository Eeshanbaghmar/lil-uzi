import OpenAI from 'openai'

// This will need to be replaced with a secure backend call eventually, 
// but for prototype purposes we use it locally if the key is provided.
const apiKey = import.meta.env.VITE_OPENAI_API_KEY || 'placeholder-key'

export const openai = new OpenAI({
  apiKey: apiKey,
  dangerouslyAllowBrowser: true // Required for client-side API calls in Vite
})
