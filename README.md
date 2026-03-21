# Fan Control solution with optional Zwift connection

> **Based on the original project by Sebastian Linz:**
> [https://github.com/sebastianlinz/FanControl](https://github.com/sebastianlinz/FanControl)

A web-application to control a fan via a Particle Photon. The web-application controls the fan's state and provides it to the Photon over HTTP.

## Modes and configuration

The Photon makes an HTTP GET request to `/getFanLevel` every 5 seconds and receives a simple line of text containing the current fan state and level:

```
FCS4FLV1PWR0095HR110SPD027.3
```

| Field | Example | Meaning |
|-------|---------|---------|
| `FCS` | `4` | Fan Controller State (mode, see below) |
| `FLV` | `1` | Fan Level (0–3, actual speed sent to relay) |
| `PWR` | `0095` | Current power in watts (from Zwift) |
| `HR`  | `110` | Current heartrate in bpm (from Zwift) |
| `SPD` | `027.3` | Current speed in km/h (from Zwift) |

### Fan States

| State | Mode | Description |
|-------|------|-------------|
| `0` | Off | Fan off |
| `1` | Level 1 | Fan at fixed speed 1 |
| `2` | Level 2 | Fan at fixed speed 2 |
| `3` | Level 3 | Fan at fixed speed 3 |
| `4` | Zwift Simulation | Fan level set automatically based on current riding speed |
| `5` | Zwift Workout | Fan level set automatically based on power, gated by heartrate |

### Zwift Simulation mode (state 4)

Fan level is determined by current speed (km/h), configurable via `.env`:

```
SPEED_LEVEL1=10   # below this → level 0 (off)
SPEED_LEVEL2=30   # below this → level 1
SPEED_LEVEL3=40   # below this → level 2
                  # above      → level 3
```

### Zwift Workout mode (state 5)

Fan level is determined by power (watts), but **only if heartrate is above the configured threshold**. During recovery intervals when heartrate drops, the fan turns off automatically.

```
HEARTRATE=125     # fan stays off if heartrate is at or below this

POWER_LEVEL1=150  # below this → level 0 (off)
POWER_LEVEL2=195  # below this → level 1
POWER_LEVEL3=265  # below this → level 2
                  # above      → level 3
```

### Stale data protection

In Zwift modes (states 4 and 5), if no successful Zwift API poll has been received within the last 10 seconds, `/getFanLevel` returns fan level 0 (off) rather than acting on outdated values. This ensures the fan turns off safely if the Zwift connection is lost.

---

## Installation

### Prerequisites

- Node.js (v18+) **or** Docker
- A valid Zwift account
- Your Zwift player ID (the number from the `userXXXXXX` folder on your Zwift PC)

### 1. Clone the repository

```bash
git clone git@gitlab.com:alex.tull/fancontrol.git
cd fancontrol
```

### 2. Configure environment variables

Copy the example file and fill in your details:

```bash
cp .env.example .env
```

Edit `.env`:

```ini
ZWIFT_USERNAME=your_zwift_email@example.com
ZWIFT_PASSWORD=your_zwift_password
ZWIFT_PLAYER_ID=your_player_id

SPEED_LEVEL1=10
SPEED_LEVEL2=30
SPEED_LEVEL3=40

HEARTRATE=125
POWER_LEVEL1=150
POWER_LEVEL2=195
POWER_LEVEL3=265

# Optional: shared secret to authenticate Photon requests (see Security below)
PHOTON_SECRET=

# Optional: log level (debug | info | warn | error, default: info)
LOG_LEVEL=info
# Optional: write logs to a file in addition to the console
# LOG_FILE=logs/fancontrol.log
```

### 3a. Run with Node.js

```bash
npm install
npm start
```

### 3b. Run with Docker

```bash
docker compose up --build -d
```

### 4. Open the app

```
http://localhost:3033
```

Or use the host's IP address to access from a mobile phone on the same Wi-Fi network.

---

## Security

### CSRF protection

All state-changing POST requests (fan mode buttons) are protected by a double-submit cookie CSRF token. The token is embedded in each form and validated server-side using `crypto.timingSafeEqual`.

### Photon shared secret (`PHOTON_SECRET`)

To prevent any device on the LAN from spoofing `/getFanLevel` responses, you can configure a shared secret:

1. Generate a random secret, e.g.:
   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
   ```
2. Set it in `.env`:
   ```ini
   PHOTON_SECRET=your-random-secret-here
   ```
3. Set the matching values in `photon-src/fancontroller.ino`:
   ```cpp
   #define HOST_SECRET         "your-random-secret-here"
   #define HOST_SECRET_ENABLED 1
   ```
4. Flash the updated firmware to the Photon.

When `PHOTON_SECRET` is set, the server rejects any `/getFanLevel` request that does not include the matching `X-Photon-Secret` header with a `403 Forbidden` response. Leave `PHOTON_SECRET` empty to disable the check (useful during development).

### Fan state persistence

The current fan state (`fanState` and `fanLevel`) is persisted to `fanstate.json` on every change and restored on startup. This means the fan resumes its previous mode after a process restart or reboot. The file is written atomically (via a `.tmp` rename) to prevent corruption on power loss.

`fanstate.json` is excluded from git and Docker builds.

---

## Logging

Log output goes to the console by default. Set `LOG_LEVEL=debug` in `.env` to see detailed per-request logs including the exact payload sent to the Photon.

To also write logs to a file, set `LOG_FILE` in `.env`:

```ini
LOG_FILE=logs/fancontrol.log
```

Log files are rotated at 5 MB, keeping the last 3 files. The `log/` directory is mounted as a Docker volume so logs survive container restarts.

---

## Testing the app

1. Start the app with `npm start` or `docker compose up -d`.
2. Open `http://localhost:3033` in a browser.
3. Select **Zwift-Simulation** or **Zwift-Workout** mode.
4. In a separate terminal, test the `/getFanLevel` endpoint:
   ```bash
   curl http://localhost:3033/getFanLevel
   # FCS4FLV0PWR0000HR000SPD000.0
   ```
   If `PHOTON_SECRET` is set, include the secret header (otherwise the server returns 403):
   ```bash
   curl -H "X-Photon-Secret: your-random-secret-here" http://localhost:3033/getFanLevel
   # FCS4FLV0PWR0000HR000SPD000.0
   ```
5. If all Zwift values are zero, the player is not currently riding (this is normal when not in a session).

> **Note:** The Zwift API only returns live data while you are actively riding. A 404 response means the player is not currently online in Zwift — this is expected behaviour and is logged at debug level only.

---

## Installation — Photon firmware

This section describes how to install the Particle firmware on the Photon. You will need a fan with multiple speed levels, a Photon, a Particle Relay Shield, and a DC adapter.

> **⚠️ Use these instructions at your own risk. Be careful working with mains voltage.**

The picture below shows how the relay shield cabling could look:

![Picture of relay shield cabling](https://github.com/sebastianlinz/FanControl/blob/master/cabling_relay_shield.jpg)

The fan's power cables are connected to the DC adapter. Connect the DC adapter to feed the relay shield (observe polarity). The phase (brown) of the mains feed cable connects to the relay COMM ports. The neutral (blue) connects to the neutral of the fan motor. Each fan speed cable connects to a NO (normally open) port of a relay.

1. Create a Particle app in the Web IDE (e.g. "FanController").
2. Copy the code from `photon-src/fancontroller.ino` into the Web IDE.
3. Check and update `RELAY2`, `RELAY3`, and `RELAY4` to match your wiring.
4. Set `HOST_IP` to the IP address of the host running this app, and `HOST_PORT` to `3033`.
5. If using the shared secret, set `HOST_SECRET` to match `PHOTON_SECRET` in your `.env` and set `HOST_SECRET_ENABLED` to `1`.
6. Flash the code to the Photon.

### Testing the Photon

If the Photon is connected to a PC via USB, you can use a serial monitor (e.g. PuTTY) to view log output. The firmware logs:

- Every HTTP request with loop counter, timestamp, status code and latency
- The raw response body received from the server
- Fan level changes (e.g. `fan level changed 0 -> 2`)
- A warning after 3 consecutive HTTP failures

---

Thanks to Just Vervaart and Ogadai for the Zwift API library.
