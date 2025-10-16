# Bot Executor Server - Shared Agent Architecture

REST and WebSocket API server that shares the same bot instance as the main Mindcraft Agent, preserving all chat handlers, command processing, and AI functionality while adding programmatic API access.

## 🏗️ **Architecture**

```
main.js → Agent (andy) ←→ executor/server.js
         ↓
    Minecraft Server
    (1 shared bot with both chat + API)
```

The executor server provides dual access to the same bot:
- **In-game chat**: Players can interact via Minecraft chat
- **API access**: External systems (like n8n) can control via REST/WebSocket

## 🚀 **Usage Modes**

### **Mode A: Standalone Executor (Recommended)**
Creates and manages the agent in-process with full functionality.

```bash
# Start executor with full Agent functionality
npm run executor

# Test the API
curl http://localhost:3001/api/agent/status
```

**Features:**
- ✅ Full Agent initialization with chat handlers
- ✅ Command processing (`!help`, `!inventory`, etc.)
- ✅ AI integration (if profile has model configured)
- ✅ REST/WebSocket API access
- ✅ Single bot instance

### **Mode B: Parallel with main.js (Advanced)**
Attach executor to already-running agent from main.js.

```bash
# Terminal 1: Start main Mindcraft (creates agents)
npm start

# Terminal 2: Start executor (attaches to existing agent)
npm run executor
```

**Features:**
- ✅ Uses existing Agent from main.js
- ✅ All original chat/command functionality preserved  
- ✅ Adds API access to same bot
- ⚠️ Requires both processes to run together

## 📊 **Bot Connection Flow**

The executor follows this priority order:

1. **Try to attach to existing agent** from registry
   - Logs: `[Executor] Attaching to existing agent: andy`
   
2. **Create new agent in-process** using same initialization path  
   - Logs: `[Executor] No existing agent found, creating new agent in-process`
   - Uses profile-based name: `andy_executor`
   - Full Agent class initialization with chat handlers

3. **Wait for bot spawn** and setup API event handlers
   - Logs: `[Executor] Bot spawned: andy_executor`

## 🔍 **Key Logging & Validation**

### **Startup Logs:**
```
[Executor] Bot Executor Server running on port 3001
[Executor] Ready to attach to existing agents or create new ones
[Executor] No existing agent found, creating new agent in-process
[Executor] Using profile-based name: andy_executor
[Executor] Initializing Mindcraft system...
[Executor] Agent created successfully: andy_executor
[Executor] Bot spawned: andy_executor
[Executor] Setting up bot event handlers for API
```

### **Status Endpoint Validation:**
```json
{
  "success": true,
  "data": {
    "botConnected": true,
    "agentAttached": true,
    "agentName": "andy_executor",
    "chatHandlersActive": true,
    "commandSystemActive": true,
    "position": {"x": 10, "y": 64, "z": 5}
  }
}
```

### **Chat Handler Preservation:**
- ✅ **In-game chat** still triggers Agent's `respondFunc`
- ✅ **Commands** (`!help`, `!inventory`) still work
- ✅ **AI responses** still function if model configured
- ✅ **WebSocket forwarding** added without disrupting original handlers

### **API Action Logging:**
```
[Executor] Movement requested from 10, 64, 5 to 20, 65, 10
[Executor] Movement result: success=true, moved=true, final pos: 20, 65, 10
[Executor] Sending chat message: "Hello from API" publicly
```

## ⚖️ **Trade-offs**

### **Advantages:**
- ✅ **One bot, one runtime** - no duplication
- ✅ **Full Agent functionality** - chat, commands, AI all work
- ✅ **Clean architecture** - reuses existing initialization path
- ✅ **Flexible** - works standalone or with main.js

### **Limitations:**
- 📝 **Single-process** - Mode B requires both main.js and executor running
- 📝 **Shared state** - API actions and chat commands use same bot
- 📝 **No isolation** - API errors could affect chat functionality

## 🧪 **Testing Validation**

### **Test 1: Standalone Mode**
```bash
npm run executor
curl http://localhost:3001/api/agent/status
# Should show: botConnected=true, agentAttached=true
```

### **Test 2: Movement API**
```bash
curl -X POST http://localhost:3001/api/agent/move \
  -H "Content-Type: application/json" \
  -d '{"x": 100, "y": 64, "z": 50}'
# Should show: actuallyMoved=true, agentUsed="andy_executor"
```

### **Test 3: Chat Integration**
```bash
# In Minecraft, type: "hello andy_executor"
# Should trigger Agent's chat handler AND appear in WebSocket events
```

### **Test 4: Commands Still Work**  
```bash
# In Minecraft, type: "!inventory"
# Should show inventory via Agent's command system
```

## 📁 **Files Modified**

| File | Purpose | Changes |
|------|---------|---------|
| `src/agent/agent_registry.js` | Agent registry singleton | **NEW** - Global registry for agent/bot instances |
| `src/agent/agent.js` | Agent class | **MODIFIED** - Added registry registration |  
| `src/mindcraft/mindcraft.js` | Agent creation | **MODIFIED** - Added `inProcess` mode |
| `executor/server.js` | Bot executor server | **NEW** - Shared bot architecture |
| `package.json` | Scripts | **MODIFIED** - Added `executor` scripts |

## 🎯 **Result**

**✅ Single bot instance with dual access:**
- **In-game chat**: `"hello andy"` → Agent responds via chat handlers
- **API access**: `POST /api/agent/move` → Same bot moves via REST API
- **WebSocket events**: Real-time updates for both chat and API actions
- **Command system**: `!inventory` still works alongside API calls

**Perfect for n8n integration** while maintaining full Mindcraft functionality!