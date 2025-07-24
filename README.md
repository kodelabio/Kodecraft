# Kodecraft 🤖🧱

LLM Agents in Minecraft using [Mineflayer](https://prismarinejs.github.io/mineflayer/#/)

## Requirements

* [Minecraft Java Edition](https://www.minecraft.net/en-us/store/minecraft-java-bedrock-edition-pc) (up to v1.21.1, recommend v1.21.1)
* [Node.js Installed](https://nodejs.org/) (at least v18)
* One of the following: [OpenAI API Key](https://openai.com/blog/openai-api) | [Gemini API Key](https://aistudio.google.com/app/apikey) | [Anthropic API Key](https://docs.anthropic.com/claude/docs/getting-access-to-claude) | [Replicate API Key](https://replicate.com/) | [Hugging Face API Key](https://huggingface.co/) | [Groq API Key](https://console.groq.com/keys) | [Ollama Installed](https://ollama.com/download) | [Mistral API Key](https://docs.mistral.ai/getting-started/models/models_overview/) | [Qwen API Key](https://www.alibabacloud.com/help/en/model-studio/developer-reference/get-api-key) | [Novita AI API Key](https://novita.ai/settings)

## Install and Run

1. Ensure the requirements are installed
2. Clone the repo: `git clone https://github.com/your-username/kodecraft.git`
3. Rename `keys.example.json` to `keys.json` and fill in one or more API keys
4. Run `npm install`
5. Start a Minecraft LAN world (port `55916`)
6. Run the server: `npm run kodecraft`

## Agent Settings

Configure global settings in `settings.js`. Configure agent behavior (LLM, prompts, identity) in individual profile files like `profiles/andy.json`.

### LLM Config Structure

```json
"model": {
  "api": "openai",
  "model": "gpt-4o",
  "params": {
    "max_tokens": 1000,
    "temperature": 1
  }
},
"code_model": { "api": "openai", "model": "gpt-4" },
"vision_model": { "api": "openai", "model": "gpt-4o" },
"embedding": { "api": "openai", "model": "text-embedding-ada-002" }
```

## Docker Usage

Run the project in Docker to isolate unsafe code execution:

```bash
docker run -i -t --rm -v $(pwd):/app -w /app -p 3000-3003:3000-3003 node:latest node main.js
```

Or with compose:

```bash
docker-compose up
```

Use `host.docker.internal` as the Minecraft host from inside the container.

```js
"host": "host.docker.internal"
```