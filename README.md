# Kodecraft 🤖🧱

LLM Agents in Minecraft using [Mineflayer](https://prismarinejs.github.io/mineflayer/#/)

## Requirements

* `keys.json` file in the root dir for LLM API Key. Exanple:
```
{
  "OPENAI_API_KEY": "YOUR_API_KEY"
}
```
* `docker` istalled for `minecraft-server` server deployment.
* `node` V22.18.0
* n8n installed



## Install and Run

1. Ensure the requirements are installed
2. Clone the repo: `git clone https://github.com/your-username/kodecraft.git`
3. Rename `keys.example.json` to `keys.json` and fill in one or more API keys
4. Run `npm install`
5. Start a Minecraft LAN world on port `55916` running: `docker compose up -d`
6. Deploy the workflow `n8n_Kodecraft.json` into your `n8n` running instance.
6. Run the server: `./start.sh`


## N8n Settings
Customize the following credentials in the n8n settings:
- Mongo db instance for chat persistence
- Telegram account
- Agent LLM
- set the variable `KODECRAFT_SERVER_URL=http://<this machine address>:4001`



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

