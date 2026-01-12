// config/loader.js
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { projectRoot } from '../paths.js';

const defaultSettingsPath = path.join(projectRoot, 'settings.js');

function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            describe: 'List of agent profile paths',
        })
        .option('task_path', {
            type: 'string',
            describe: 'Path to task file to execute'
        })
        .option('task_id', {
            type: 'string',
            describe: 'Task ID to execute'
        })
        .help()
        .alias('help', 'h')
        .parse();
}

export async function loadConfig() {
    // 1. Load default settings.js via import()
    const defaultModule = await import(`${projectRoot}/settings.js`);
    const defaultConfig = defaultModule.default || {};

    // 2. CLI args
    const args = parseArguments();
    const cliConfig = {};
    if (args.profiles) cliConfig.profiles = args.profiles;
    if (args.task_path) {
        const tasks = JSON.parse(readFileSync(args.task_path, 'utf8'));
        if (args.task_id) {
            cliConfig.task = tasks[args.task_id];
            cliConfig.task.task_id = args.task_id;
        } else {
            throw new Error('task_id is required when task_path is provided');
        }
    }

    // 3. ENV vars
    const envConfig = {};
    if (process.env.MINECRAFT_PORT) envConfig.port = process.env.MINECRAFT_PORT;
    if (process.env.MINECRAFT_SERVER) envConfig.host = process.env.MINECRAFT_SERVER;
    if (process.env.MINDSERVER_PORT) envConfig.mindserver_port = process.env.MINDSERVER_PORT;
    if (process.env.PROFILES) envConfig.profiles = JSON.parse(process.env.PROFILES);
    if (process.env.INSECURE_CODING) envConfig.allow_insecure_coding = true;
    if (process.env.BLOCKED_ACTIONS) envConfig.blocked_actions = JSON.parse(process.env.BLOCKED_ACTIONS);
    if (process.env.MAX_MESSAGES) envConfig.max_messages = process.env.MAX_MESSAGES;
    if (process.env.NUM_EXAMPLES) envConfig.num_examples = process.env.NUM_EXAMPLES;
    if (process.env.LOG_ALL) envConfig.log_all_prompts = process.env.LOG_ALL;
    if (process.env.BRAIN_MODE) envConfig.brain_mode = process.env.BRAIN_MODE;
    if (process.env.EXTERNAL_API_PORT) envConfig.external_api_port = process.env.EXTERNAL_API_PORT;
    if (process.env.N8N_WEBHOOK_URL) envConfig.n8n_webhook_url = process.env.N8N_WEBHOOK_URL;

    // 4. Merge: default < env < cli
    return {
        ...defaultConfig,
        ...envConfig,
        ...cliConfig,
    };
}