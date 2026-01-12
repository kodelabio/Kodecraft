# Kodecraft Docker Quick Start

## What You Get

All files needed to containerize your Kodecraft Minecraft bot orchestration system:

- **Dockerfile** - Container image with Node.js and Xvfb
- **docker-compose.yml** - Service orchestration (leader bot + optional services)
- **docker-compose.override.yml** - Development configuration
- **.dockerignore** - Files excluded from build
- **.env.example** - Environment variables template
- **docker-helper.sh** - Convenience script for common operations
- **DOCKER_SETUP_GUIDE.md** - Detailed reference (50+ pages)

---

## 🚀 Quick Start (2 minutes)

### 1. Copy Files to Your Project

```bash
# Copy all files to your project root
cp Dockerfile docker-compose.yml .dockerignore docker-helper.sh ./
chmod +x docker-helper.sh
```

### 2. Create Your .env File

```bash
# Copy the example
cp .env.example .env

# Edit with your settings
nano .env
# or
vim .env
```

Key variables to set:
```env
NODE_ENV=production
MINECRAFT_HOST=your_minecraft_server
MINECRAFT_PORT=25565
LEADER_BOT_PORT=4001
```

### 3. Start Services

**Option A: Using the helper script (easiest)**
```bash
./docker-helper.sh setup   # Initial setup
./docker-helper.sh start   # Start services
```

**Option B: Using Docker Compose directly**
```bash
docker-compose up
```

**Option C: Using Docker command**
```bash
docker build -t kodecraft:latest .
docker run -p 4001:4001 --env-file .env kodecraft:latest
```

### 4. Verify It's Working

```bash
# Check health
curl http://localhost:4001/api/agent/status

# View logs
docker-compose logs -f leader

# Open shell in container
./docker-helper.sh shell
```

---

## 📁 File Descriptions

### Dockerfile
- Based on `node:20-bookworm` (Node.js + Linux)
- Installs Xvfb for virtual display
- Copies your code and installs dependencies
- Starts Xvfb and your Node app
- Includes health check
- Exposes ports 4001-4005

### docker-compose.yml
- **leader** - Main orchestration bot (port 4001)
- **postgres** (commented) - Optional database for session tracking
- **n8n** (commented) - Optional workflow orchestration
- Mounts logs directory for persistence
- Uses bridge network for service communication

### docker-compose.override.yml
- Used automatically when running `docker-compose up` in development
- Mounts source code for live editing
- Enables debug mode
- Disables restart policies

### .env.example
- Template with all available variables
- Copy to `.env` and customize
- Never commit actual `.env` to git

### docker-helper.sh
Convenience script with commands:
```bash
./docker-helper.sh setup      # First time setup
./docker-helper.sh start      # Start in background
./docker-helper.sh start-fg   # Start in foreground
./docker-helper.sh logs       # View logs
./docker-helper.sh shell      # Open container shell
./docker-helper.sh status     # Check health
./docker-helper.sh stop       # Stop services
./docker-helper.sh restart    # Restart services
./docker-helper.sh clean      # Remove containers
```

---

## 🔧 Common Tasks

### View Logs
```bash
# Follow all logs
./docker-helper.sh logs

# View logs from specific service
./docker-helper.sh logs leader

# Last 100 lines
docker-compose logs --tail=100
```

### Open Container Shell
```bash
./docker-helper.sh shell

# Then run commands inside container
npm list
npm test
ls -la logs/
```

### Check Container Health
```bash
./docker-helper.sh status

# Manual check
curl http://localhost:4001/api/agent/status

# Resource usage
./docker-helper.sh stats
```

### Stop Services
```bash
./docker-helper.sh stop
# or
docker-compose down
```

### Rebuild After Code Changes
```bash
# In development (with docker-compose.override.yml)
# Changes are automatically reflected!

# In production
docker-compose build --no-cache
docker-compose down && docker-compose up
```

---

## 🌐 Port Mapping

| Service | Port | Purpose |
|---------|------|---------|
| Leader Bot | 4001 | Main orchestration API |
| Worker Bots | 4002-4010 | Individual worker instances |
| PostgreSQL | 5432 | Database (if enabled) |
| n8n | 5678 | Workflow UI (if enabled) |

Map additional ports as needed:
```bash
# In docker-compose.yml
ports:
  - "4001:4001"        # Leader
  - "4002-4010:4002-4010"  # 9 workers
  - "5432:5432"        # Postgres
  - "5678:5678"        # n8n
```

---

## 🔐 Security Notes

### Environment Variables
- Never commit `.env` to git (already in `.dockerignore`)
- Use `.env` for secrets in development
- Use Docker secrets or environment services in production

### Image Security
```bash
# Scan for vulnerabilities
docker scan kodecraft:latest

# Build minimal image (use multi-stage build)
# See DOCKER_SETUP_GUIDE.md for details
```

---

## 📊 Architecture

```
Docker Container
├── Node.js Runtime
├── Xvfb Virtual Display (:99)
└── Your Kodecraft App
    ├── Leader Bot (port 4001)
    ├── Worker Bots (spawned on 4002+)
    └── ExternalAPI
        ├── /api/orchestration/* (endpoints)
        └── /api/agent/* (status)
         ↓
    Database (optional, external)
         ↓
    n8n Workflows (optional, external)
```

---

## 🚨 Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose logs leader

# Check .env file exists
ls -la .env

# Try building fresh
docker-compose build --no-cache
```

### Port Already in Use
```bash
# Find what's using port 4001
lsof -i :4001

# Kill it
kill -9 <PID>

# Or use different port in docker-compose.yml
ports:
  - "5000:4001"  # Maps to localhost:5000
```

### Xvfb Issues
```bash
# Verify Xvfb is running
docker-compose exec leader ps aux | grep Xvfb

# Check display
docker-compose exec leader echo $DISPLAY
```

### Health Check Failing
```bash
# Test from inside container
docker-compose exec leader curl http://localhost:4001/api/agent/status

# Check if service is running
docker-compose exec leader ps aux
```

---

## 📈 Scaling

### Multiple Worker Containers
```bash
# Start multiple worker instances
docker-compose up -d --scale worker=3

# Or create separate worker service in docker-compose.yml
```

### Resource Limits
```yaml
# In docker-compose.yml
services:
  leader:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

---

## 🧹 Cleanup

### Remove Everything
```bash
# Stop and remove containers
./docker-helper.sh clean

# Remove image
./docker-helper.sh clean-image

# Prune all unused resources
./docker-helper.sh prune
```

### Keep Logs
```bash
# Logs are in ./logs (mounted volume)
# They persist even after containers stop

# View them
cat logs/kodecraft.log
tail -f logs/kodecraft.log
```

---

## 📚 Next Steps

1. **Read** DOCKER_SETUP_GUIDE.md for detailed information
2. **Set up** your `.env` file with correct values
3. **Test** locally with `./docker-helper.sh start`
4. **Monitor** logs and health checks
5. **Deploy** to your server using docker-compose or orchestration platform

---

## 🎯 Production Checklist

- [ ] `.env` file configured with production values
- [ ] `.env` file added to `.gitignore` (not in git)
- [ ] Docker image built and tagged with version
- [ ] Image scanned for vulnerabilities
- [ ] Resource limits configured (CPU, memory)
- [ ] Restart policy set to `unless-stopped`
- [ ] Health checks passing
- [ ] Logs being collected/persisted
- [ ] Database backups configured (if using PostgreSQL)
- [ ] Monitoring/alerts set up
- [ ] Documentation updated

---

## 📖 For More Details

**Detailed Setup Guide**: See `DOCKER_SETUP_GUIDE.md` (50+ pages)
- Advanced configurations
- Multi-architecture builds
- Production deployment
- Monitoring & debugging
- Troubleshooting guide
- Development workflows

---

## 💡 Pro Tips

### Development Workflow
```bash
# Terminal 1: Start services
./docker-helper.sh start-fg

# Terminal 2: Edit code in ./src
# Changes are live-updated in container!

# Terminal 3: Watch logs if needed
./docker-helper.sh logs leader
```

### Quick Testing
```bash
# Test an endpoint
curl -X GET http://localhost:4001/api/agent/status

# Check container stats
./docker-helper.sh stats

# View all processes
docker-compose ps
```

### Database Debugging
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U kodecraft -d kodecraft

# View build sessions
SELECT * FROM build_sessions;
```

---

## 🤝 Support

If you have issues:

1. Check logs: `./docker-helper.sh logs`
2. Verify .env file: `cat .env`
3. Test health: `curl http://localhost:4001/api/agent/status`
4. Review guide: `DOCKER_SETUP_GUIDE.md`
5. Check Docker system: `docker system info`

---

**Ready to containerize?** Run `./docker-helper.sh setup` to get started! 🚀
