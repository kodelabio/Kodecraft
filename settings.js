const settings = {
    "minecraft_version": "1.21.4", // supports up to 1.21.1
    "host": "127.0.0.1", 
    "port": 55916,
    "auth": "offline", // or "microsoft"

    // the mindserver manages all agents and hosts the UI
    "mindserver_port": 8080,
    
    "base_profile": "survival", // survival, creative, or god_mode
    "profiles": [
        "./profiles/kid.json",
        // "./profiles/kodelab_beta.json",
        // "./andy.json",
        // "./profiles/gpt.json",
        // "./profiles/claude.json",
        // "./profiles/gemini.json",
        // "./profiles/llama.json",
        // "./profiles/qwen.json",
        // "./profiles/grok.json",
        // "./profiles/mistral.json",
        // "./profiles/deepseek.json",

        // using more than 1 profile requires you to /msg each bot indivually
        // individual profiles override values from the base profile
    ],

    "load_memory": false, // load memory from previous session
    "init_message": "Respond with hello world and your name", // sends to all on spawn
    "only_chat_with": [], // users that the bots listen to and send general messages to. if empty it will chat publicly
    "speak": false, // allows all bots to speak through system text-to-speech. works on windows, mac, on linux you need to `apt install espeak`
    "language": "en", // translate to/from this language. Supports these language names: https://cloud.google.com/translate/docs/languages
    "render_bot_view": true, // show bot's view in browser at localhost:3000, 3001...

    "allow_insecure_coding": true, // allows newAction command and model can write/run code on your computer. enable at own risk
    "allow_vision": true, // allows vision model to interpret screenshots as inputs
    "blocked_actions" : ["!checkBlueprint", "!checkBlueprintLevel", "!getBlueprint", "!getBlueprintLevel"] , // commands to disable and remove from docs. Ex: ["!setMode"]
    "code_timeout_mins": -1, // minutes code is allowed to run. -1 for no timeout
    "relevant_docs_count": 5, // number of relevant code function docs to select for prompting. -1 for all

    "max_messages": 15, // max number of messages to keep in context
    "num_examples": 2, // number of examples to give to the model
    "max_commands": -1, // max number of commands that can be used in consecutive responses. -1 for no limit
    "verbose_commands": true, // show full command syntax
    "narrate_behavior": true, // chat simple automatic actions ('Picking up item!')
    "chat_bot_messages": true, // publicly chat messages to other bots
    "log_all_prompts": false, // log ALL prompts to file

        // External brain mode configuration
    "brain_mode": "external", // "internal" or "external" (for n8n integration)
    "external_api_port": 4001, // Port for REST API when in external mode
    "external_mode_allow_chat": false, // Allow basic in-game chat commands in external mode (for testing)
    "multibot_base_port": 4000, // Base port for multibot workers (4001, 4002, 4003, etc.)
    // "n8n_webhook_url": "http://localhost:5678/webhook/kodecraft-chat", // Webhook URL to forward chat messages to n8n
}

export default settings;
