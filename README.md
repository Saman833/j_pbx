# 📞 Placetel → Jambonz → ElevenLabs AI Agent

Route incoming calls from your **Placetel SIP number** to an **ElevenLabs AI Agent** using **Jambonz** as the SIP registration middleware.

```
Caller → 02852 94578 20 (Placetel) → Jambonz (SIP bridge) → ElevenLabs AI Agent
```

---

## Why Jambonz?

Placetel requires **SIP REGISTER** to keep the trunk online.  
ElevenLabs uses **SIP INVITE-only** (no registration).  
Jambonz sits in the middle: it registers with Placetel and forwards calls to ElevenLabs.

---

## Prerequisites

- Docker + Docker Compose installed
- A VPS/server with a **public IP** (DigitalOcean, AWS, Hetzner, etc.)
- Your Placetel SIP credentials (from `web.placetel.de`)
- An ElevenLabs account with a Conversational AI Agent created

---

## Setup — Step by Step

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/placetel-jambonz-elevenlabs.git
cd placetel-jambonz-elevenlabs
```

### 2. Configure your credentials

```bash
cp .env.example .env
nano .env   # or use any text editor
```

Fill in these values in `.env`:

| Variable | Where to find it |
|---|---|
| `PLACETEL_SIP_USERNAME` | web.placetel.de → VoIP Destinations → VOICO → ID (e.g. `3602630`) |
| `PLACETEL_SIP_PASSWORD` | web.placetel.de → VoIP Destinations → VOICO → SIP Password |
| `ELEVENLABS_AGENT_ID` | elevenlabs.io → Agents → Your Agent → copy ID from URL |
| `ELEVENLABS_API_KEY` | elevenlabs.io → Profile → API Keys |

### 3. Point your Placetel number to Jambonz

In `web.placetel.de` → **Phone Numbers** → click edit on `02852 94578 20`:

Change the SIP URI to your **server's public IP**:
```
sip:+4928529457820@YOUR_SERVER_PUBLIC_IP:5060;transport=tcp
```

> Replace `YOUR_SERVER_PUBLIC_IP` with your VPS/server's actual public IP address.

### 4. Start everything

```bash
docker compose up -d
```

Check logs:
```bash
docker compose logs -f elevenlabs-bridge   # your app
docker compose logs -f jambonz            # SIP gateway
```

### 5. Verify Jambonz registered with Placetel

Open Jambonz admin portal:
```
http://YOUR_SERVER_IP:8080
```
Login: `admin` / password from `.env` (`JAMBONZ_ADMIN_PASSWORD`)

Go to **Carriers** → you should see Placetel showing as **registered** ✅

### 6. Call your number!

Call **02852 94578 20** — the ElevenLabs AI agent should answer! 🤖

---

## Project Structure

```
placetel-jambonz-elevenlabs/
├── app/
│   ├── app.js          ← Main Node.js app (call routing logic)
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml  ← Runs Jambonz + MySQL + your app
├── .env                ← Your secrets (never commit this!)
└── README.md
```

---

## Customizing the AI Agent Behavior

Edit `app/app.js` — the key section is:

```js
session
  .pause({ length: 1 })
  .llm({
    vendor: 'elevenlabs',
    model: 'conversational',
    llmOptions: {
      agent_id: agentId,
      // Add more ElevenLabs options here
    },
    actionHook: '/action',
  })
  .send();
```

You can add things like:
- `.say({ text: 'Please hold...' })` before `.llm()` to greet callers
- Custom ElevenLabs agent variables in `llmOptions`

---

## Firewall / Open Ports

Make sure these ports are open on your server:

| Port | Protocol | Purpose |
|---|---|---|
| 5060 | UDP + TCP | SIP signaling |
| 5061 | TCP | SIP TLS |
| 8080 | TCP | Jambonz admin UI |
| 3000 | TCP | App HTTP |
| 3001 | TCP | App WebSocket |
| 10000-20000 | UDP | RTP audio media |

---

## Troubleshooting

**Jambonz not registering with Placetel?**
```bash
docker compose logs jambonz | grep -i register
```
→ Check `PLACETEL_SIP_USERNAME` and `PLACETEL_SIP_PASSWORD` in `.env`

**Call connects but no audio?**
→ Open ports `10000-20000 UDP` on your firewall

**ElevenLabs agent not responding?**
→ Check `ELEVENLABS_AGENT_ID` is correct
```bash
docker compose logs elevenlabs-bridge
```

---

## Support

- Jambonz docs: https://docs.jambonz.org
- ElevenLabs docs: https://elevenlabs.io/docs/agents-platform
- Placetel support: https://support.placetel.de
