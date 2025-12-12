# .env Update Guide for Multi-User Bot Architecture

---

## Quick Update

If you already have a `.env` file, **add these lines**:

```bash
# Multi-user bot configuration (NEW)
LEADER_BOT_BASE_PORT=5000
MAX_LEADER_BOTS=50
LEADER_BOT_IDLE_TIMEOUT=3600000

# Database (NEW)
DATABASE_PATH=./data/users.db
ENCRYPTION_KEY=your-secure-key-min-32-chars-long
```

Keep your existing settings for:
- `MINECRAFT_HOST`
- `MINECRAFT_PORT`
- `TELEGRAM_BOT_TOKEN`
- `N8N_WEBHOOK_URL`

---

## Complete Setup

### Step 1: Copy Template

```bash
cp .env.example .env
```

### Step 2: Update with Your Values

```bash
# Edit your .env file
nano .env
```

Replace these placeholders:

```
TELEGRAM_BOT_TOKEN=your-telegram-bot-token-here
TELEGRAM_WEBHOOK_URL=https://yourdomain.com
MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565
ENCRYPTION_KEY=generate-a-secure-key
```

### Step 3: Generate Encryption Key

```bash
# Option 1: Using openssl
openssl rand -hex 32

# Option 2: Using /dev/urandom
head -c 32 /dev/urandom | base64

# Option 3: Using Python
python3 -c "import secrets; print(secrets.token_hex(32))"

# Option 4: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example output:
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

Copy this into your `.env`:
```
ENCRYPTION_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

---

## Variable Explanation

### Gateway Configuration

```bash
LEADER_BOT_PORT=4001
```
- Port the main API gateway listens on
- Same as before (external port)
- Clients connect to this: `http://yourdomain.com:4001`

### Multi-User Leader Bot Configuration

```bash
LEADER_BOT_BASE_PORT=5000
```
- Starting port for user-specific leader bots
- Alice's bot: 5000
- Bob's bot: 5001
- Charlie's bot: 5002
- **Internal only** (not exposed to Telegram users)

```bash
MAX_LEADER_BOTS=50
```
- Maximum concurrent user bots
- Each bot ≈ 150MB memory
- Each user's workers ≈ 300MB
- Total per user: ≈ 450MB

**Guidelines:**
- 8GB server: `MAX_LEADER_BOTS=15`
- 16GB server: `MAX_LEADER_BOTS=30`
- 32GB server: `MAX_LEADER_BOTS=50`
- 64GB server: `MAX_LEADER_BOTS=100`

```bash
LEADER_BOT_IDLE_TIMEOUT=3600000
```
- Time (milliseconds) before idle bot is cleaned up
- `3600000` = 1 hour
- `1800000` = 30 minutes
- `600000` = 10 minutes

**When to change:**
- Frequent users: `3600000` (1 hour) ✓
- Many casual users: `1800000` (30 min)
- Resource-constrained: `600000` (10 min)

### Minecraft Server

```bash
MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565
```
- Where user bots connect
- Both Alice's and Bob's bots connect to same server
- Different accounts (alice_bot, bob_bot)

### Telegram

```bash
TELEGRAM_BOT_TOKEN=123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh
```
- Token from @BotFather
- Keep this secret!
- Never commit to git

```bash
TELEGRAM_WEBHOOK_URL=https://yourdomain.com
```
- Your domain hosting the bot
- Used to construct full webhook URL
- Example: `https://yourdomain.com/telegram/{TOKEN}`

### n8n Webhooks

```bash
N8N_WEBHOOK_URL=http://localhost:5678/webhook/worker
```
- Where workers callback when done
- For worker task completion

```bash
N8N_WEBHOOK_URL_STAGE_COMPLETE=http://localhost:5678/webhook/task-complete
```
- For stage task completion (advanced)
- Optional if not using stage-aware tasks

### Database

```bash
DATABASE_PATH=./data/users.db
```
- SQLite database location
- Stores:
  - User accounts & credentials
  - Build sessions
  - Task history
  - Statistics
- Created automatically if missing

```bash
ENCRYPTION_KEY=your-secure-key-min-32-chars
```
- Encrypts Minecraft passwords in database
- **CRITICAL**: Change from default!
- Min 32 characters
- Keep secret (like a password)

**Generate secure key:**
```bash
openssl rand -hex 32
```

---

## Configuration by Use Case

### Use Case 1: Development (Single User Testing)

```bash
LEADER_BOT_PORT=4001
LEADER_BOT_BASE_PORT=5000
MAX_LEADER_BOTS=5
LEADER_BOT_IDLE_TIMEOUT=600000

MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565

TELEGRAM_BOT_TOKEN=test-token
TELEGRAM_WEBHOOK_URL=http://localhost:4001

N8N_WEBHOOK_URL=http://localhost:5678/webhook/worker

DATABASE_PATH=./data/users.db
ENCRYPTION_KEY=dev-key-not-secure-but-ok-for-testing

NODE_ENV=development
LOG_LEVEL=debug
```

### Use Case 2: Small Production (10 Users)

```bash
LEADER_BOT_PORT=4001
LEADER_BOT_BASE_PORT=5000
MAX_LEADER_BOTS=15
LEADER_BOT_IDLE_TIMEOUT=1800000

MINECRAFT_HOST=game.example.com
MINECRAFT_PORT=25565

TELEGRAM_BOT_TOKEN=your-real-token
TELEGRAM_WEBHOOK_URL=https://api.example.com

N8N_WEBHOOK_URL=https://n8n.example.com/webhook/worker

DATABASE_PATH=/var/lib/bots/users.db
ENCRYPTION_KEY=$(openssl rand -hex 32)

NODE_ENV=production
LOG_LEVEL=info
```

### Use Case 3: Large Production (50+ Users)

```bash
LEADER_BOT_PORT=4001
LEADER_BOT_BASE_PORT=5000
MAX_LEADER_BOTS=50
LEADER_BOT_IDLE_TIMEOUT=3600000

MINECRAFT_HOST=game.example.com
MINECRAFT_PORT=25565

TELEGRAM_BOT_TOKEN=your-secure-token
TELEGRAM_WEBHOOK_URL=https://api.example.com

N8N_WEBHOOK_URL=https://n8n.example.com/webhook/worker
N8N_WEBHOOK_URL_STAGE_COMPLETE=https://n8n.example.com/webhook/task-complete

DATABASE_PATH=/data/users.db
ENCRYPTION_KEY=$(openssl rand -hex 32)

RATE_LIMIT_PER_USER=60
MAX_BUILDS_PER_USER=5
MAX_WORKERS_PER_BUILD=10

NODE_ENV=production
LOG_LEVEL=info
```

---

## How settings.js Reads .env

Your `settings.js` file reads from `.env`:

```javascript
// settings.js
export default {
    leader_bot_port: process.env.LEADER_BOT_PORT || 4001,
    leader_bot_base_port: process.env.LEADER_BOT_BASE_PORT || 5000,
    max_leader_bots: process.env.MAX_LEADER_BOTS || 50,
    leader_bot_idle_timeout: process.env.LEADER_BOT_IDLE_TIMEOUT || 3600000,
    
    minecraft_server_host: process.env.MINECRAFT_HOST || 'localhost',
    minecraft_server_port: process.env.MINECRAFT_PORT || 25565,
    
    telegram_bot_token: process.env.TELEGRAM_BOT_TOKEN || '',
    
    n8n_webhook_url: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/worker',
    n8n_webhook_url_stage_complete: process.env.N8N_WEBHOOK_URL_STAGE_COMPLETE || 'http://localhost:5678/webhook/task-complete',
    
    database_path: process.env.DATABASE_PATH || './data/users.db',
    encryption_key: process.env.ENCRYPTION_KEY || 'default-insecure-key-change-me',
};
```

**Priority order:**
1. `.env` file (highest priority)
2. Default in `settings.js`

---

## Validation Checklist

Run this to verify your `.env` is correct:

```bash
# Check file exists
test -f .env && echo "✓ .env exists" || echo "✗ .env missing"

# Check required vars are set
grep -q "ENCRYPTION_KEY=" .env && echo "✓ ENCRYPTION_KEY set" || echo "✗ ENCRYPTION_KEY missing"
grep -q "TELEGRAM_BOT_TOKEN=" .env && echo "✓ TELEGRAM_BOT_TOKEN set" || echo "✗ TELEGRAM_BOT_TOKEN missing"
grep -q "DATABASE_PATH=" .env && echo "✓ DATABASE_PATH set" || echo "✗ DATABASE_PATH missing"

# Check encryption key length (should be >32 chars)
KEY=$(grep "^ENCRYPTION_KEY=" .env | cut -d= -f2)
echo "Encryption key length: ${#KEY} chars"

# Test by starting
npm start
```

---

## Common Mistakes

### ❌ Using default encryption key

```bash
ENCRYPTION_KEY=your-secure-key-min-32-chars
```

**Fix:** Generate a real key
```bash
ENCRYPTION_KEY=$(openssl rand -hex 32)
```

### ❌ Setting MAX_LEADER_BOTS too high

```bash
MAX_LEADER_BOTS=1000  # ❌ Will crash server
```

**Fix:** Match your hardware
```bash
MAX_LEADER_BOTS=50  # For 32GB server
```

### ❌ Wrong MINECRAFT_HOST

```bash
MINECRAFT_HOST=minecraft.com  # ❌ User's server, not yours
```

**Fix:** Use your server
```bash
MINECRAFT_HOST=game.yourcompany.com
```

### ❌ Forgetting DATABASE_PATH

```bash
# ❌ Not in .env
```

**Fix:** Add it
```bash
DATABASE_PATH=./data/users.db
```

### ❌ Committing secrets to git

```bash
git add .env
git commit -m "add settings"  # ❌ NEVER DO THIS
```

**Fix:**
```bash
# Add to .gitignore
echo ".env" >> .gitignore

# Remove from git if already committed
git rm --cached .env
```

---

## Production Deployment

### Before deploying:

1. **Generate encryption key**
   ```bash
   ENCRYPTION_KEY=$(openssl rand -hex 32)
   echo "Store this securely: $ENCRYPTION_KEY"
   ```

2. **Set sensible limits**
   ```bash
   MAX_LEADER_BOTS=50
   LEADER_BOT_IDLE_TIMEOUT=3600000
   ```

3. **Use real Telegram token**
   ```bash
   TELEGRAM_BOT_TOKEN=<get-from-BotFather>
   ```

4. **Set correct domain**
   ```bash
   TELEGRAM_WEBHOOK_URL=https://yourdomain.com
   ```

5. **Secure database location**
   ```bash
   DATABASE_PATH=/var/lib/myapp/users.db
   chmod 700 /var/lib/myapp
   ```

6. **Use environment variable tool** (recommended)
   ```bash
   # Use systemd, Docker, or other to inject secrets
   # Never commit .env to git
   ```

---

## Testing Your Config

```bash
# Start with verbose output
DEBUG_REQUESTS=true npm start

# Should see:
# ✓ Gateway running on port 4001
# ✓ Leader bot manager ready (base port: 5000)
# ✓ Database initialized
# Ready for Telegram user connections!

# Test initialization
curl -X POST http://localhost:4001/api/user/init-bot \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "123456789",
    "minecraftUsername": "test_bot",
    "minecraftPassword": "password"
  }'

# Should spawn bot on port 5000
netstat -tlnp | grep node
# Should show :4001 and :5000
```

---

## Migration from Old .env

If you have an old `.env` without multi-user settings:

```bash
# Backup old .env
cp .env .env.backup

# Add new variables to bottom of .env
cat >> .env << 'EOF'

# Multi-user bot configuration
LEADER_BOT_BASE_PORT=5000
MAX_LEADER_BOTS=50
LEADER_BOT_IDLE_TIMEOUT=3600000

# Database
DATABASE_PATH=./data/users.db
ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF

# Edit to add real encryption key
nano .env
```

---

## Summary

**Minimum .env for multi-user bot:**

```bash
# Gateway
LEADER_BOT_PORT=4001

# Multi-user
LEADER_BOT_BASE_PORT=5000
MAX_LEADER_BOTS=50
LEADER_BOT_IDLE_TIMEOUT=3600000

# Minecraft
MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565

# Telegram
TELEGRAM_BOT_TOKEN=your-token
TELEGRAM_WEBHOOK_URL=https://yourdomain.com

# n8n
N8N_WEBHOOK_URL=http://localhost:5678/webhook/worker

# Database
DATABASE_PATH=./data/users.db
ENCRYPTION_KEY=your-secure-key-32-chars
```

That's it! 🎉
