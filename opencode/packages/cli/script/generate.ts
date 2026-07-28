import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fallbackPath =
  process.env.MODELS_DEV_API_JSON ||
  path.resolve(__dirname, "../../opencode/test/tool/fixtures/models-api.json")

const modelsUrl = process.env.OPENCODE_MODELS_URL || "https://models.dev"

async function loadModelsSnapshot(): Promise<string> {
  if (process.env.MODELS_DEV_API_JSON) {
    return Bun.file(process.env.MODELS_DEV_API_JSON).text()
  }

  try {
    const response = await fetch(`${modelsUrl}/api.json`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    const text = await response.text()
    console.log("Loaded models.dev snapshot")
    return text
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`models.dev unreachable (${message}); falling back to ${fallbackPath}`)
    return Bun.file(fallbackPath).text()
  }
}

export const modelsData = await loadModelsSnapshot()
