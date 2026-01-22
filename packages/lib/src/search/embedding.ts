import { GoogleGenAI } from '@google/genai'

const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIMENSIONS = 3072

let geminiClient: GoogleGenAI | null = null

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set')
    }
    geminiClient = new GoogleGenAI({ apiKey })
  }
  return geminiClient
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getGeminiClient()
  const input = text.replaceAll('\n', ' ').trim()

  if (!input) {
    throw new Error('Cannot generate embedding for empty text')
  }

  const response = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: input,
  })

  return response.embeddings?.[0]?.values ?? []
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const client = getGeminiClient()
  const inputs = texts.map(text => text.replaceAll('\n', ' ').trim()).filter(Boolean)

  if (inputs.length === 0) {
    throw new Error('Cannot generate embeddings for empty texts')
  }

  // Gemini doesn't have native batch embedding, process individually
  const results = await Promise.all(
    inputs.map(async input => {
      const response = await client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: input,
      })
      return response.embeddings?.[0]?.values ?? []
    })
  )

  return results
}

export function prepareTextForEmbedding(item: {
  name: string
  description: string
  content?: string | null
  tags?: string[] | null
  readme?: string | null
}): string {
  const parts = [
    item.name,
    item.description,
    item.tags?.join(' ') || '',
    item.readme?.slice(0, 1000) || '',
    item.content?.slice(0, 2000) || '',
  ]

  return parts.filter(Boolean).join(' ').trim()
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS }
