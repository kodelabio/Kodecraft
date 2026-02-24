const settings = {
    "minecraft_version": "1.21.4", // supports up to 1.21.1
    "host": process.env.MINECRAFT_HOST || "127.0.0.1", 
    "port": process.env.MINECRAFT_PORT || 55916,
    "auth": "offline", // or "microsoft"

    // the mindserver manages all agents and hosts the UI
    "mindserver_host": process.env.MINDSERVER_HOST|| "mindserver",
    "mindserver_port": process.env.MINDSERVER_PORT|| 8080,

    "base_profile": "creative", // survival, creative, or god_mode
    "profiles": [
        "./profiles/kodecraft.json",
        "./profiles/claude_builder.json",
        //"./profiles/kodecraft.json",
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
        // "./profiles/mercury.json",
        // "./profiles/andy-4.json", // Supports up to 75 messages!

        // using more than 1 profile requires you to /msg each bot indivually
        // individual profiles override values from the base profile
    ],
    "profileMap": {
        "builder": "./profiles/kodecraft.json",
        "soldier": "./profiles/kodecraft.json",
        "planner": "./profiles/kodecraft.json",
        "farmer": "./profiles/kodecraft.json",
        "fisherman": "./profiles/kodecraft.json",
        "worker": "./profiles/kodecraft.json",
        "default": "./profiles/kodecraft.json"

    },

    "load_memory": false, // load memory from previous session
    "init_message": "Respond with hello world and your name", // sends to all on spawn
    "only_chat_with": [], // users that the bots listen to and send general messages to. if empty it will chat publicly

    "speak": false,
    // allows all bots to speak through text-to-speech. 
    // specify speech model inside each profile with format: {provider}/{model}/{voice}.
    // if set to "system" it will use basic system text-to-speech. 
    // Works on windows and mac, but linux requires you to install the espeak package through your package manager eg: `apt install espeak` `pacman -S espeak`.

    "chat_ingame": true, // bot responses are shown in minecraft chat
    "language": "en", // translate to/from this language. Supports these language names: https://cloud.google.com/translate/docs/languages
    "render_bot_view": true, // show bot's view in browser at localhost:3000, 3001...

    "allow_insecure_coding": true, // allows newAction command and model can write/run code on your computer. enable at own risk
    "allow_vision": true, // allows vision model to interpret screenshots as inputs
    "blocked_actions" : [],//["!checkBlueprint", "!checkBlueprintLevel", "!getBlueprint", "!getBlueprintLevel"] , // commands to disable and remove from docs. Ex: ["!setMode"]
    "code_timeout_mins": -1, // minutes code is allowed to run. -1 for no timeout
    "relevant_docs_count": 10, // number of relevant code function docs to select for prompting. -1 for all

    "max_messages": 15, // max number of messages to keep in context
    "num_examples": 5, // number of examples to give to the model
    "max_commands": -1, // max number of commands that can be used in consecutive responses. -1 for no limit
    "show_command_syntax": "full", // "full", "shortened", or "none"
    "narrate_behavior": true, // chat simple automatic actions ('Picking up item!')
    "chat_bot_messages": true, // publicly chat messages to other bots

    "block_place_delay": 0, // delay between placing blocks (ms) if using newAction. helps avoid bot being kicked by anti-cheat mechanisms on servers.
  
    "log_all_prompts": false, // log ALL prompts to file

        // External brain mode configuration
    // External brain mode configuration
    "brain_mode": process.env.BRAIN_MODE || "external",
    //"external_api_port": parseInt(process.env.EXTERNAL_API_PORT || "4001"),
    "external_mode_allow_chat": process.env.EXTERNAL_MODE_ALLOW_CHAT === "true" || false,
    
    
    // Multi-user configuration
    "api_gateway_port": parseInt(process.env.API_GATEWAY_PORT) || 4001,
    "worker_base_port": parseInt(process.env.WORKER_BASE_PORT) || 6000,
    "leader_base_port": parseInt(process.env.LEADER_BASE_PORT) || 5000,          // First leader bot on 5000, next on 5001, etc.
    "leader_bot_idle_timeout": parseInt(process.env.LEADER_BOT_IDLE_TIMEOUT) || 3600000,    // 1 hour (ms) before cleaning up idle bots
    "max_leader_bots": parseInt(process.env.MAX_LEADER_BOTS) || 50,                 // Maximum concurrent leader bots

    
    // Telegram configuration
    "telegram_bot_token": process.env.TELEGRAM_BOT_TOKEN,
    
    // n8n configuration
    "n8n_webhook_url": process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/kodecraft',
    "n8n_callback_url": process.env.N8N_CALLBACK_URL || 'http://localhost:5678/webhook/kodecraft/worker-complete',

    // bot would search for players within this distance
    "nearby_player_search_distance": 64,
    "nearby_entity_search_distance": 16,

    // realms management
    "realms_enabled": process.env.REALMS_ENABLED === "true" || false,
    "realm_base_size": parseInt(process.env.REALM_BASE_SIZE) || 512, // size of each realm in blocks
    "minecraft_world_type": process.env.MINECRAFT_WORLD_TYPE || 'normal', // affects default spawn location and realm allocation strategy

};

export default settings;
