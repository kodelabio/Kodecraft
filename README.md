# Kodecraft 🤖🧱

LLM Agents in Minecraft using [Mineflayer](https://prismarinejs.github.io/mineflayer/#/)

## Requirements

* `keys.json` file in the root dir for LLM API Key. Example:
```
{
  "OPENAI_API_KEY": "YOUR_API_KEY"
}
```
* `docker` installed for `minecraft-server` server deployment.
* `node` V22.18.0
* n8n installed

## Install and Run

1. Ensure the requirements are installed
2. Clone the repo: `git clone https://github.com/your-username/kodecraft.git`
3. Rename `keys.example.json` to `keys.json` and fill in one or more API keys
4. Run `npm install`
5. Start a Minecraft LAN world on port `55916` running: `docker compose up -d`
6. Deploy the workflows from the `./n8n` directory into your n8n instance (see below)
7. Run the server: `npm start`

## Importing n8n Workflows

To import workflows into your n8n instance:

1. Open n8n UI: `http://localhost:5678`
2. Click **Workflows** → **Import from file**
3. Select any workflow file from the `./n8n` directory
4. Configure credentials for Mongodb and Telegram Bot
5. Click **Activate** to enable the workflow

Alternatively, workflows can be imported via the command line command:
```
docker exex -it n8n import:workflow --separate --input=n8n
```

## N8n Settings

Customize the following credentials in the n8n settings:
- Mongo db instance for chat persistence
- Telegram account
- Agent LLM
- set the variable `KODECRAFT_SERVER_URL=http://<this machine address>:4001`

## Agent Settings

Configure global settings in `settings.js`. Configure agent behavior (LLM, prompts, identity) in individual profile files like `profiles/kodecraft.json`.

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


