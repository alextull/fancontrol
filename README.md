# Fan Control solution with optional Zwift connection

A web-application to control a fan via a Particle Photon. The web-application controls the fan's state and provides it to the Photon over HTTP.

## Modes and configuration

The Photon makes an HTTP GET request to `/getFanLevel` and receives a simple line of text containing the current fan state and level:

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

## Testing the app

1. Start the app with `npm start` or `docker compose up -d`.
2. Open `http://localhost:3033` in a browser.
3. Select **Zwift-Simulation** or **Zwift-Workout** mode.
4. Click **Get Fan State** — you should see a response like `FCS4FLV1PWR0095HR110SPD027.3`.
5. If all values are zero, the player is not currently riding in Zwift (this is normal when not in a session).

> **Note:** The Zwift API only returns live data while you are actively riding. A 404 response means the player is not currently online in Zwift — this is expected behaviour and is logged at debug level only.

---

## Installation — Photon firmware

This section describes how to install the Particle firmware on the Photon. You will need a fan with multiple speed levels, a Photon, a Particle Relay Shield, and a DC adapter.

> **⚠️ Use these instructions at your own risk. Be careful working with mains voltage.**

The picture below shows how the relay shield cabling could look:

![Picture of relay shield cabling](https://gitlab.com/alex.tull/fancontrol/-/raw/main/cabling_relay_shield.jpg)

The fan's power cables are connected to the DC adapter. Connect the DC adapter to feed the relay shield (observe polarity). The phase (brown) of the mains feed cable connects to the relay COMM ports. The neutral (blue) connects to the neutral of the fan motor. Each fan speed cable connects to a NO (normally open) port of a relay.

1. Create a Particle app in the Web IDE (e.g. "FanController").
2. Copy the code from `photon-src/fancontroller.ino` into the Web IDE.
3. Check and update `RELAY2`, `RELAY3`, and `RELAY4` to match your wiring.
4. Set `HOST_IP` to the IP address of the host running this app, and `HOST_PORT` to `3033`.
5. Flash the code to the Photon.

### Testing the Photon

If the Photon is connected to a PC via USB, you can use a serial monitor (e.g. PuTTY) to view log output.

---

Thanks to Just Vervaart and Ogadai for the Zwift API library.
