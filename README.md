# Kodecraft 🤖🧱

LLM Agents in Minecraft using [Mineflayer](https://prismarinejs.github.io/mineflayer/#/)

## Requirements

* **Node.js** v22.18.0
* **Docker** & **Docker Compose** - for Minecraft server and containerized bot deployment
* **API Keys** - OpenAI or other LLM provider (see `keys.json` setup below)
* **n8n** - for workflow orchestration (optional but recommended)

### Optional
* **MongoDB** - for session tracking (uncomment in `docker-compose.yml`)
* **n8n** - for multi-bot orchestration (uncomment in `docker-compose.yml`)

## Installation

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/kodecraft.git
cd kodecraft
```

### 2. Configure API Keys
```bash
cp keys.example.json keys.json
# Edit keys.json and add your LLM API key
nano keys.json
```

Example `keys.json`:
```json
{
  "OPENAI_API_KEY": "sk-...",
  "OPENAI_ORG_ID": "org-..." 
}
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
```bash
cp .env.example .env
# Edit .env with your settings
nano .env
```

Key variables:
- `MINECRAFT_HOST` - Minecraft server address (use `minecraft-server` if using Docker)
- `MINECRAFT_PORT` - Minecraft server port (default: 55916)
- `LEADER_BOT_PORT` - Leader bot API port (default: 4001)
- `WORKER_BOT_START_PORT` - Starting port for worker bots (default: 4002)

## Running with Docker (Recommended) ⭐

Docker automates Minecraft server setup and bot deployment in containers. Both services start automatically with networking already configured.

### Quick Start
```bash
# Start Minecraft server + leader bot + Xvfb display
docker compose up

# In another terminal, view logs
docker compose logs -f leader

# Access the bot API
curl http://localhost:4001/api/agent/status

# Stop services
docker compose down
```

### Using Helper Script
```bash
# First time setup (builds Docker image)
./docker-helper.sh setup

# Start services in background
./docker-helper.sh start

# View logs in real-time
./docker-helper.sh logs

# View logs for specific service
./docker-helper.sh logs leader
./docker-helper.sh logs minecraft-server

# Check health status
./docker-helper.sh status

# Stop services
./docker-helper.sh stop

# Restart services
./docker-helper.sh restart

# Open shell inside leader bot container
./docker-helper.sh shell

# Stop and clean up everything
./docker-helper.sh clean
```

### What Docker Provides

✅ **Minecraft Server** - v1.21.4 in creative mode on port 55916  
✅ **Leader Bot** - Main orchestration on port 4001  
✅ **Virtual Display** - Xvfb automatically managed  
✅ **Networking** - Services communicate automatically  
✅ **Data Persistence** - Minecraft world persists in volumes  
✅ **Health Checks** - Automatic service monitoring  

### Optional Services (Uncomment in docker-compose.yml)

**MongoDB** - For session/task tracking
```bash
# Uncomment mongodb service in docker-compose.yml
# Enable in .env:
# DB_HOST=mongodb
# DB_PORT=27017
docker compose up
```

**n8n** - For workflow orchestration
```bash
# Uncomment n8n service in docker-compose.yml
# Then access at http://localhost:5678
docker compose up
```

### Development with Docker

The `docker-compose.override.yml` enables development mode with live code reloading:

```bash
# Start in development mode (with source code mounted)
docker compose up

# Edit files in ./src/ - changes appear immediately in container!
# View logs to see changes take effect
docker compose logs -f leader
```

### Common Docker Commands

```bash
# See all running containers
docker compose ps

# View resource usage
docker stats

# Execute command in running container
docker compose exec leader npm list

# View container logs (last 50 lines)
docker compose logs --tail=50 leader

# Follow logs with timestamps
docker compose logs -f --timestamps leader

# Restart a specific service
docker compose restart leader

# Rebuild image after Dockerfile changes
docker compose build --no-cache
```

See [README_DOCKER.md](README_DOCKER.md) for detailed Docker documentation.

## Running Locally (Without Docker)

If you prefer to run without containerization:

```bash
# 1. Start your Minecraft server manually on port 55916
# (Use a Minecraft launcher or vanilla server JAR)

# 2. Start the bot server
npm start
# Or run directly:
node --env-file=.env main.js

# 3. Access the API
curl http://localhost:4001/api/agent/status

# 4. View logs
tail -f logs/kodecraft.log
```

⚠️ **Note:** Without Docker, you must:
- Manage Xvfb display yourself
- Start Minecraft server separately
- Handle port conflicts manually
- Manage process cleanup on shutdown

## Setup n8n Workflows

### 1. Start n8n (Using Docker)
```bash
# Option A: Uncomment n8n in docker-compose.yml, then:
docker compose up n8n

# Option B: Run separately on your machine
# (Follow n8n installation at https://docs.n8n.io/)

# Access n8n UI
open http://localhost:5678
```

### 2. Deploy Kodecraft Workflow
1. Open n8n UI: `http://localhost:5678`
2. Go to **Workflows** → **Import from file**
3. Select `n8n_Kodecraft.json`
4. Configure webhook URLs and credentials:
   - Set `KODECRAFT_SERVER_URL=http://localhost:4001` (or your server IP)
   - Add MongoDB credentials (if using database)
   - Add Telegram credentials (if using notifications)
5. Activate workflow

### 3. Test the Workflow
```bash
# Trigger a test build request via n8n UI
# Watch bot connect and execute tasks
docker compose logs -f leader
```

## Agent Settings

Configure global settings in `settings.js`. Configure agent behavior (LLM, prompts, identity) in individual profile files like `profiles/kodecraft.json`.

### Example Profile Structure
```json
{
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
}
```

## Architecture

```
┌──────────────────────────────────┐
│   Your Minecraft Server          │
│        (Port 55916)              │
└──────────┬───────────────────────┘
           │
           │ (Docker Network)
           │
    ┌──────▼──────┐         ┌──────────────┐
    │ Leader Bot  │◄────────┤  n8n         │
    │ (Port 4001) │         │ (Port 5678)  │
    └──────┬──────┘         └──────────────┘
           │
    ┌──────▼───────────┐
    │ Worker Bots      │
    │ (4002, 4003...)  │
    └──────────────────┘
```

## Troubleshooting

### Docker Issues

**Containers won't start:**
```bash
docker compose logs
docker compose up --no-detach  # See errors in foreground
```

**Port already in use:**
```bash
# Find what's using port 4001
lsof -i :4001
# Kill it
kill -9 <PID>
# Or use different port in .env
```

**Minecraft connection refused:**
```bash
# Check if Minecraft is ready
docker compose logs minecraft-server | tail -20
# Wait 30-60 seconds for server to fully start
```

### Logs

**View bot logs:**
```bash
docker compose logs leader -f
```

**View Minecraft logs:**
```bash
docker compose logs minecraft-server -f
```

**View all logs:**
```bash
docker compose logs -f
```

**Access logs on disk:**
```bash
ls -la logs/
tail -f logs/kodecraft.log
```

## Performance

### For Development
```bash
# Use docker-compose (with hot-reload):
docker compose up
```

### For Production
```bash
# Use docker compose with resource limits
# Edit docker-compose.yml:
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G

# Then:
docker compose -f docker-compose.yml up -d
```

## Contributing

1. Create a feature branch from `dev`
2. Make your changes
3. Test with Docker: `docker compose up`
4. Commit and push
5. Create a Pull Request to `dev`

## Documentation

- **[README_DOCKER.md](README_DOCKER.md)** - Complete Docker setup guide
- **[DOCKER_QUICKSTART.md](DOCKER_QUICKSTART.md)** - Quick reference
- **[MONGODB_GUIDE.md](MONGODB_GUIDE.md)** - Database integration
- **[SOLUTION_SUMMARY.md](SOLUTION_SUMMARY.md)** - n8n orchestration architecture

## Support

For issues and questions:
1. Check the documentation files above
2. Review Docker logs: `docker compose logs -f`
3. Test health: `./docker-helper.sh status`
4. Open an issue on GitHub

---

**Happy coding!** 🚀
