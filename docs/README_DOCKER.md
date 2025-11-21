# Kodecraft Docker Containerization

This package contains everything you need to containerize your Kodecraft Minecraft bot orchestration system with Docker.

## 📦 What's Included

### Docker Files
- **Dockerfile** - Container image definition
  - Based on Node.js 20
  - Includes Xvfb for virtual display
  - Automatically starts your application
  - Includes health checks

- **docker-compose.yml** - Service orchestration
  - Leader bot on port 4001
  - Optional PostgreSQL database
  - Optional n8n workflow orchestration
  - Bridge network for service communication

- **.dockerignore** - Files excluded from build

### Configuration
- **.env.example** - Template for environment variables
  - Copy to `.env` and customize
  - Includes comments for all settings
  - Examples for Minecraft, bot, database config

### Scripts & Guides
- **docker-helper.sh** - Convenient CLI for Docker operations
  - Setup, start, stop, logs, shell, health checks
  - Automatic environment validation
  - Color-coded output

- **DOCKER_QUICKSTART.md** - Quick start guide (this file)
  - 2-minute setup
  - Common tasks
  - Troubleshooting

- **DOCKER_SETUP_GUIDE.md** - Comprehensive reference (50+ pages)
  - Advanced configurations
  - Production deployment
  - Monitoring & debugging
  - Development workflows

- **.github-workflows-docker.yml** - GitHub Actions CI/CD
  - Automated builds on push
  - Security scanning
  - Automated testing

## ⚡ Quick Start (2 minutes)

### Step 1: Copy Files
```bash
cd your-kodecraft-project
cp Dockerfile docker-compose.yml .dockerignore docker-helper.sh ./
chmod +x docker-helper.sh
```

### Step 2: Create Configuration
```bash
cp .env.example .env
# Edit .env with your Minecraft server details, ports, etc.
nano .env
```

### Step 3: Start Services
```bash
./docker-helper.sh setup      # Initial build
./docker-helper.sh start      # Start in background
```

### Step 4: Verify
```bash
./docker-helper.sh status
# Output: Leader bot is healthy ✓
```

Done! Your application is now containerized and running. 🎉

## 🗂️ File Structure After Setup

```
your-project/
├── Dockerfile                    # NEW - Container definition
├── docker-compose.yml            # NEW - Service orchestration
├── docker-compose.override.yml   # NEW - Development overrides
├── .dockerignore                 # NEW - Files to exclude
├── docker-helper.sh              # NEW - Helper script
├── .env                          # NEW - Your configuration (don't commit!)
├── .env.example                  # NEW - Configuration template
├── DOCKER_QUICKSTART.md          # NEW - This quick start
├── DOCKER_SETUP_GUIDE.md         # NEW - Detailed guide
├── .github/
│   └── workflows/
│       └── docker.yml            # NEW - CI/CD pipeline
├── src/                          # Your existing code
├── config/                       # Your existing code
├── package.json                  # Your existing package
└── main.js                       # Your existing entry point
```

## 🎯 Common Commands

### Using the Helper Script (Easiest)

```bash
# Initial setup
./docker-helper.sh setup

# Start services
./docker-helper.sh start
./docker-helper.sh start-fg      # Foreground with logs

# View logs
./docker-helper.sh logs
./docker-helper.sh logs leader   # Specific service

# Open shell
./docker-helper.sh shell

# Check status
./docker-helper.sh status

# Stop services
./docker-helper.sh stop
./docker-helper.sh restart

# Cleanup
./docker-helper.sh clean         # Remove containers
./docker-helper.sh clean-image   # Remove image
./docker-helper.sh prune         # Remove all unused resources
```

### Using Docker Compose Directly

```bash
# Start services
docker-compose up                # Foreground
docker-compose up -d             # Background

# View logs
docker-compose logs -f           # All services
docker-compose logs -f leader    # Specific service

# Stop services
docker-compose down              # With cleanup
docker-compose stop              # Without cleanup

# Rebuild
docker-compose build --no-cache

# Execute commands
docker-compose exec leader bash  # Open shell
docker-compose exec leader npm list
```

### Using Docker Directly

```bash
# Build image
docker build -t kodecraft:latest .

# Run container
docker run -p 4001:4001 --env-file .env kodecraft:latest

# View logs
docker logs -f container-id

# Execute in running container
docker exec -it container-id bash
```

## 🌍 Environment Variables

Key variables in `.env`:

```env
# Basic
NODE_ENV=production
DISPLAY=:99

# Minecraft
MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565
MINECRAFT_USERNAME=bot_name

# Bots
LEADER_BOT_PORT=4001
WORKER_BOT_START_PORT=4002
MAX_WORKERS=5

# Database (optional)
DB_HOST=postgres
DB_USER=kodecraft
DB_PASSWORD=secure_password

# Logging
LOG_LEVEL=info
DEBUG=false
```

See `.env.example` for all available options.

## 🔌 Port Mapping

Default ports:

| Service | Port | Purpose |
|---------|------|---------|
| Leader Bot | 4001 | Main orchestration API |
| Worker Bot 1 | 4002 | Worker 1 |
| Worker Bot 2 | 4003 | Worker 2 |
| Worker Bot 3 | 4004 | Worker 3 |
| PostgreSQL | 5432 | Database (if enabled) |
| n8n | 5678 | Workflow UI (if enabled) |

Customize in `docker-compose.yml`:

```yaml
services:
  leader:
    ports:
      - "4001:4001"        # Leader
      - "4002-4010:4002-4010"  # 9 workers
```

## 🏗️ Architecture

### What Docker Does

```
Before (Your Script):
  X11 Display ← Xvfb
  Node Process ← Your App
  (On your machine, ports conflict, cleanup needed)

After (Docker):
  Container 1:
    Xvfb (virtual display)
    Node.js Runtime
    Your App
    Exposed Port: 4001
  
  Container 2 (optional):
    PostgreSQL
    Exposed Port: 5432
  
  Container 3 (optional):
    n8n
    Exposed Port: 5678
```

### Advantages

✅ **Isolation** - Each service in its own container  
✅ **Reproducibility** - Same environment everywhere  
✅ **Easy Scaling** - Spawn multiple worker containers  
✅ **Simple Cleanup** - `docker-compose down` removes everything  
✅ **Logs** - Centralized Docker logging  
✅ **Monitoring** - Built-in health checks  
✅ **Deployment** - Push to any Docker host  

## 🚀 Development Workflow

### Hot Reload (Code Changes Are Live!)

```bash
# Automatically uses docker-compose.override.yml
docker-compose up

# Edit src/app.js
# Changes are reflected immediately in the container!

# View logs while editing
docker-compose logs -f leader
```

This works because `docker-compose.override.yml` mounts your `./src` directory into the container.

## 🔍 Monitoring & Debugging

### View Real-Time Status
```bash
docker-compose ps
docker stats
./docker-helper.sh status
```

### View Logs
```bash
# Follow logs
docker-compose logs -f

# Last 50 lines
docker-compose logs --tail=50

# Search logs
docker-compose logs | grep error
```

### Health Checks
```bash
# Check if service is responding
curl http://localhost:4001/api/agent/status

# From inside container
docker-compose exec leader curl http://localhost:4001/api/agent/status
```

### Debug Inside Container
```bash
# Open shell
docker-compose exec leader bash

# Once inside:
ps aux                    # Running processes
env                       # Environment variables
ls -la                    # Directory listing
npm list                  # Installed packages
cat logs/kodecraft.log    # Application logs
```

## 🐛 Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs leader

# Common issues:
# 1. .env file missing
ls -la .env

# 2. Port already in use
lsof -i :4001
kill -9 <PID>

# 3. Image build error
docker-compose build --no-cache
```

### Health Check Failing

```bash
# Test from inside container
docker-compose exec leader curl http://localhost:4001/api/agent/status

# Check if app is running
docker-compose exec leader ps aux | grep node

# Check logs
docker-compose exec leader tail -f /app/logs/kodecraft.log
```

### High Memory Usage

```bash
# Check stats
docker stats

# Set limits in docker-compose.yml
services:
  leader:
    deploy:
      resources:
        limits:
          memory: 2G
```

### Port Already in Use

```bash
# Find what's using the port
lsof -i :4001

# Kill it
kill -9 <PID>

# Or use different port
docker run -p 5000:4001 kodecraft:latest
```

## 📦 Production Deployment

### Pre-Deployment Checklist

- [ ] `.env` file configured with production values
- [ ] `.env` file added to `.gitignore` (not in version control)
- [ ] Docker image built and tested locally
- [ ] Image tagged with version number
- [ ] Health checks passing
- [ ] Resource limits configured
- [ ] Restart policy set to `unless-stopped`
- [ ] Logs collection configured
- [ ] Database backups set up (if applicable)
- [ ] Monitoring/alerts configured
- [ ] Documentation updated

### Deploy with Docker Compose

```bash
# On your production server:
git clone your-repo
cd your-repo

# Create .env with production values
nano .env

# Start services
docker-compose up -d

# Verify
docker-compose logs -f
curl http://localhost:4001/api/agent/status
```

### Deploy with Docker Hub / Registry

```bash
# Build and tag
docker build -t your-registry/kodecraft:1.0.0 .

# Push to registry
docker push your-registry/kodecraft:1.0.0

# On production server
docker pull your-registry/kodecraft:1.0.0
docker run -p 4001:4001 --env-file .env your-registry/kodecraft:1.0.0
```

## 🔄 CI/CD Integration

GitHub Actions workflow included (`.github-workflows-docker.yml`):

```bash
# Copy to GitHub Actions
mkdir -p .github/workflows
cp .github-workflows-docker.yml .github/workflows/docker.yml

# Push to GitHub
git add .
git commit -m "Add Docker CI/CD"
git push

# Automatic builds on push/tag!
```

The workflow:
- Builds on every push to main/develop
- Runs security scans
- Lints Dockerfile
- Pushes to container registry on tags
- Can deploy automatically

## 📚 Further Reading

For more detailed information, see:

1. **DOCKER_QUICKSTART.md** - Quick reference (this file)
2. **DOCKER_SETUP_GUIDE.md** - Comprehensive guide (50+ pages)
   - Advanced configurations
   - Multi-architecture builds
   - Production deployment
   - Monitoring & debugging
   - Troubleshooting
   - Development workflows

## ❓ FAQ

**Q: Do I need to modify my existing code?**  
A: No! Docker works with your code as-is. It's a wrapper around your existing Node.js app.

**Q: Will my existing scripts still work?**  
A: The shell script you provided is now replaced by Docker and docker-compose. The docker-helper.sh provides similar convenience.

**Q: Can I run multiple worker bots?**  
A: Yes! Use `docker-compose up --scale worker=3` or create separate containers.

**Q: What about Minecraft server access?**  
A: Update `MINECRAFT_HOST` in `.env`. Use `host.docker.internal` for local Minecraft server on Mac/Windows.

**Q: How do I access logs after container stops?**  
A: Logs are in `./logs` directory (mounted volume), so they persist.

**Q: Can I deploy this to cloud services?**  
A: Yes! AWS ECS, Google Cloud Run, DigitalOcean, Heroku, Kubernetes - all support Docker.

**Q: What about data persistence?**  
A: Use Docker volumes (already configured for logs). Database data persists with PostgreSQL volume.

**Q: Is Docker slower than running locally?**  
A: Slightly, but benefits (isolation, consistency, scaling) outweigh the minor performance cost.

**Q: Can I use ARM64 (Raspberry Pi)?**  
A: Yes! Use `docker buildx` for multi-architecture builds. See DOCKER_SETUP_GUIDE.md.

## 🤝 Support

If you need help:

1. **Check logs** - `./docker-helper.sh logs`
2. **Verify .env** - `cat .env`
3. **Test health** - `curl http://localhost:4001/api/agent/status`
4. **Review guide** - `DOCKER_SETUP_GUIDE.md`
5. **Docker info** - `docker system info`

## 📝 Next Steps

1. ✅ Copy Docker files to your project
2. ✅ Create and customize `.env` file
3. ✅ Run `./docker-helper.sh setup`
4. ✅ Run `./docker-helper.sh start`
5. ✅ Verify with `./docker-helper.sh status`
6. 📖 Read `DOCKER_SETUP_GUIDE.md` for advanced usage
7. 🚀 Deploy to production

---

**Questions?** Check `DOCKER_SETUP_GUIDE.md` for detailed information on every aspect of Docker containerization!

**Ready to start?** Run:
```bash
./docker-helper.sh setup
```

🎉 Welcome to Docker!
