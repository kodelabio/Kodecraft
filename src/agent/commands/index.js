import { getBlockId, getItemId } from "../../utils/mcdata.js";
import { actionsList } from './actions.js';
import { queryList } from './queries.js';

let suppressNoDomainWarning = false;

const commandList = queryList.concat(actionsList);
const commandMap = {};
for (let command of commandList) {
    commandMap[command.name] = command;
}

export function getCommand(name) {
    return commandMap[name];
}

export function blacklistCommands(commands) {
    const unblockable = ['!stop', '!stats', '!inventory', '!goal'];
    for (let command_name of commands) {
        if (unblockable.includes(command_name)){
            console.warn(`Command ${command_name} is unblockable`);
            continue;
        }
        delete commandMap[command_name];
        delete commandList.find(command => command.name === command_name);
    }
}

const commandRegex = /!(\w+)(?:\(((?:-?\d+(?:\.\d+)?|true|false|"[^"]*")(?:\s*,\s*(?:-?\d+(?:\.\d+)?|true|false|"[^"]*"))*)\))?/
const argRegex = /-?\d+(?:\.\d+)?|true|false|"[^"]*"/g;

export function containsCommand(message) {
    const commandMatch = message.match(commandRegex);
    if (commandMatch)
        return "!" + commandMatch[1];
    return null;
}

export function commandExists(commandName) {
    if (!commandName.startsWith("!"))
        commandName = "!" + commandName;
    return commandMap[commandName] !== undefined;
}

/**
 * Converts a string into a boolean.
 * @param {string} input
 * @returns {boolean | null} the boolean or `null` if it could not be parsed.
 * */
function parseBoolean(input) {
    switch(input.toLowerCase()) {
        case 'false': //These are interpreted as flase;
        case 'f':
        case '0':
        case 'off':
            return false;
        case 'true': //These are interpreted as true;
        case 't':
        case '1':
        case 'on':
            return true;
        default:
            return null;
    }
}

/**
 * @param {number} value - the value to check
 * @param {number} lowerBound
 * @param {number} upperBound
 * @param {string} endpointType - The type of the endpoints represented as a two character string. `'[)'` `'()'` 
 */
function checkInInterval(number, lowerBound, upperBound, endpointType) {
    switch (endpointType) {
        case '[)':
            return lowerBound <= number && number < upperBound;
        case '()':
            return lowerBound < number && number < upperBound;
        case '(]':
            return lowerBound < number && number <= upperBound;
        case '[]':
            return lowerBound <= number && number <= upperBound;
        default:
            throw new Error('Unknown endpoint type:', endpointType)
    }
}

/**
 * ✅ FIX: Check if parameter is a coordinate
 * @param {string} paramName
 * @returns {boolean}
 */
function isCoordinateParam(paramName) {
    return ['x', 'y', 'z', 'x1', 'y1', 'z1', 'x2', 'y2', 'z2'].includes(paramName.toLowerCase());
}

// todo: handle arrays?
/**
 * Returns an object containing the command, the command name, and the comand parameters.
 * If parsing unsuccessful, returns an error message as a string.
 * @param {string} message - A message from a player or language model containing a command.
 * @returns {string | Object}
 */
export function parseCommandMessage(message) {
    const commandMatch = message.match(commandRegex);
    if (!commandMatch) return `Command is incorrectly formatted`;

    const commandName = "!"+commandMatch[1];

    let args;
    if (commandMatch[2]) args = commandMatch[2].match(argRegex);
    else args = [];

    const command = getCommand(commandName);
    if(!command) return `${commandName} is not a command.`

    const params = commandParams(command);
    const paramNames = commandParamNames(command);
    
    if (args.length !== params.length)
        return `Command ${command.name} was given ${args.length} args, but requires ${params.length} args.`;

    
    for (let i = 0; i < args.length; i++) {
        const param = params[i];
        //Remove any extra characters
        let arg = args[i].trim();
        if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
            arg = arg.substring(1, arg.length-1);
        }
        
        //Convert to the correct type
        switch(param.type) {
            case 'int':
                arg = Number.parseInt(arg); break;
            case 'float':
                arg = Number.parseFloat(arg);
                // ✅ FIX: Round coordinate parameters to integers to prevent misalignment
                if (isCoordinateParam(paramNames[i])) {
                    arg = Math.floor(arg);
                }
                break;
            case 'boolean':
                arg = parseBoolean(arg); break;
            case 'BlockName':
            case 'ItemName':
                if (arg.endsWith('plank'))
                    arg += 's'; // catches common mistakes like "oak_plank" instead of "oak_planks"
            case 'string':
                break;
            default:
                throw new Error(`Command '${commandName}' parameter '${paramNames[i]}' has an unknown type: ${param.type}`);
        }
        if(arg === null || Number.isNaN(arg))
            return `Error: Param '${paramNames[i]}' must be of type ${param.type}.`

        if(typeof arg === 'number') { //Check the domain of numbers
            const domain = param.domain;
            if(domain) {
                /**
                 * Javascript has a built in object for sets but not intervals.
                 * Currently the interval (lowerbound,upperbound] is represented as an Array: `[lowerbound, upperbound, '(]']`
                 */
                if (!domain[2]) domain[2] = '[)'; //By default, lower bound is included. Upper is not.

                if(!checkInInterval(arg, ...domain)) {
                    return `Error: Param '${paramNames[i]}' must be an element of ${domain[2][0]}${domain[0]}, ${domain[1]}${domain[2][1]}.`;
                    //Alternatively arg could be set to the nearest value in the domain.
                }
            } else if (!suppressNoDomainWarning) {
                console.warn(`Command '${commandName}' parameter '${paramNames[i]}' has no domain set. Expect any value [-Infinity, Infinity].`)
                suppressNoDomainWarning = true; //Don't spam console. Only give the warning once.
            }
        } else if(param.type === 'BlockName') { //Check that there is a block with this name
            if(getBlockId(arg) == null && arg !== 'air') return  `Invalid block type: ${arg}.`
        } else if(param.type === 'ItemName') { //Check that there is an item with this name
            if(getItemId(arg) == null) return `Invalid item type: ${arg}.`
        }
        args[i] = arg;
    }
    
    return { commandName, args };
}

export function truncCommandMessage(message) {
    const commandMatch = message.match(commandRegex);
    if (commandMatch) {
        return message.substring(0, commandMatch.index + commandMatch[0].length);
    }
    return message;
}

export function isAction(name) {
    return actionsList.find(action => action.name === name) !== undefined;
}

/**
 * @param {Object} command
 * @returns {Object[]} The command's parameters.
 */
function commandParams(command) {
    if (!command.params)
        return [];
    return Object.values(command.params);
}

/**
 * @param {Object} command
 * @returns {string[]} The names of the command's parameters.
 */
function commandParamNames(command) {
    if (!command.params)
        return [];
    return Object.keys(command.params);
}

function numParams(command) {
    return commandParams(command).length;
}

/**
 * ✅ FIX: Complete rewrite with error handling, timeout, and validation
 * Executes a command with proper error handling, timeouts, and result validation
 * @param {Object} agent - The agent instance
 * @param {string} message - The command message to parse and execute
 * @param {number} timeoutMs - Timeout in milliseconds (default: 15 minutes = 900000ms)
 * @returns {Promise<string>} The result of the command execution
 */
export async function executeCommand(agent, message, timeoutMs = 900000) {
    try {
        // Step 1: Parse the command message
        let parsed = parseCommandMessage(message);
        
        // Step 1a: Check if parsing failed (returns error string)
        if (typeof parsed === 'string') {
            console.log(`[Command Parser] Parsing failed: ${parsed}`);
            return parsed;
        }

        // Step 2: Get the command object
        const command = getCommand(parsed.commandName);
        if (!command) {
            const errorMsg = `Command ${parsed.commandName} not found in command map`;
            console.error(`[Command Executor] ${errorMsg}`);
            return errorMsg;
        }

        // Step 3: Validate argument count
        let numArgs = 0;
        if (parsed.args) {
            numArgs = parsed.args.length;
        }
        
        const expectedArgs = numParams(command);
        if (numArgs !== expectedArgs) {
            const errorMsg = `Command ${command.name} was given ${numArgs} args, but requires ${expectedArgs} args.`;
            console.log(`[Command Executor] ${errorMsg}`);
            return errorMsg;
        }

        // Step 4: Execute the command with timeout protection
        console.log(`[Command Executor] Executing ${parsed.commandName} with args:`, parsed.args);
        
        let result;
        try {
            // Create a timeout promise that rejects after timeoutMs
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(
                    () => reject(new Error(`Command execution timeout after ${timeoutMs}ms`)),
                    timeoutMs
                )
            );

            // Race between command execution and timeout
            result = await Promise.race([
                command.perform(agent, ...parsed.args),
                timeoutPromise
            ]);
        } catch (executionError) {
            // ✅ FIX #1: Catch execution errors (including timeouts)
            const errorMsg = `${command.name} execution failed: ${executionError.message}`;
            console.error(`[Command Executor] ${errorMsg}`);
            return errorMsg;
        }

        // Step 5: Validate the result
        // ✅ FIX #2: Validate result is not null/undefined
        if (result === null || result === undefined) {
            const warningMsg = `Command ${command.name} returned null or undefined result`;
            console.warn(`[Command Executor] ${warningMsg}`);
            return warningMsg;
        }

        // ✅ FIX #3: Ensure result is a string (convert if needed)
        if (typeof result !== 'string') {
            console.warn(`[Command Executor] Command ${command.name} returned non-string result (${typeof result}), converting to string`);
            result = String(result);
        }

        // Step 6: Check if result is empty
        if (result.length === 0) {
            const warningMsg = `Command ${command.name} returned empty string`;
            console.warn(`[Command Executor] ${warningMsg}`);
            return warningMsg;
        }

        // Step 7: Log success and return result
        console.log(`[Command Executor] Command ${parsed.commandName} executed successfully`);
        return result;

    } catch (unexpectedError) {
        // ✅ FIX #4: Catch any unexpected errors
        const errorMsg = `Unexpected error in executeCommand: ${unexpectedError.message}`;
        console.error(`[Command Executor] ${errorMsg}`);
        return errorMsg;
    }
}

export function getCommandDocs(agent) {
    const typeTranslations = {
        //This was added to keep the prompt the same as before type checks were implemented.
        //If the language model is giving invalid inputs changing this might help.
        'float':        'number',
        'int':          'number',
        'BlockName':    'string',
        'ItemName':     'string',
        'boolean':      'bool'
    }
    let docs = `\n*COMMAND DOCS\n You can use the following commands to perform actions and get information about the world. 
    Use the commands with the syntax: !commandName or !commandName("arg1", 1.2, ...) if the command takes arguments.\n
    Do not use codeblocks. Use double quotes for strings. Only use one command in each response, trailing commands and comments will be ignored.\n`;
    for (let command of commandList) {
        if (agent.blocked_actions.includes(command.name)) {
            continue;
        }
        docs += command.name + ': ' + command.description + '\n';
        if (command.params) {
            docs += 'Params:\n';
            for (let param in command.params) {
                docs += `${param}: (${typeTranslations[command.params[param].type]??command.params[param].type}) ${command.params[param].description}\n`;
            }
        }
    }
    return docs + '*\n';
}
