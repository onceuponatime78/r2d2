# R2-D2 Robot Control Protocol

Reverse-engineered protocol documentation.

## Overview

The R2-D2 robot runs an onboard computer (Orange Pi Zero) with a **Go/Gin HTTP server**. The app communicates over **WiFi** using **WebSockets** for both commands and video. 

---

## Network Architecture

| Layer         | Technology              | Details                              |
|---------------|-------------------------|--------------------------------------|
| Discovery     | UDP Broadcast           | Port `8090`, address `255.255.255.255` |
| Control       | WebSocket               | `ws://<robot_ip>:8887`               |
| Video         | WebSocket (binary)      | `ws://<robot_ip>:12121`              |
| Message format| JSON + newline          | All messages are JSON strings terminated with `\n` |
| Keepalive     | WebSocket ping          | Every 4000ms, connection lost after 20000ms |

### Robot UUID

`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` — each robot has a unique identification UUID.

---

## Connection Flow

### 1. Discovery (UDP)

The robot broadcasts its presence on UDP port `8090`:

```json
{
  "cmd": "updBroadcast",
  "ip": "192.168.x.x",
  "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "name": "R2D2-XXX",
  "ap_mode": false
}
```

The robot broadcasts approximately every 1-2 seconds. The app listens on the same port and parses the response to find robots on the network.

**Note:** When sending a UDP probe `{"cmd":"updBroadcast"}` to `255.255.255.255:8090`, filter out responses from your own IP (the broadcast echoes back).

### 2. WebSocket Connection

App connects to `ws://<robot_ip>:8887`.

### 3. Authentication (Grant Access)

Immediately after connecting, the app sends:

```json
{"cmd": "grantAccess", "uuid": "<device_uuid>", "device_name": "<phone_model>", "seq": 1}
```

Robot responds with a `gin` (General Information Notification) containing full state:

```json
{
  "cmd": "gin",
  "robot": {
    "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "name": "R2D2-XXX",
    "ip": "192.168.x.x",
    "battery": 100,
    "charging": 0,
    "mute": false,
    "face_detection": true,
    "voice_recognition": true,
    "lightsaber": false,
    "arm": false,
    "projector": 0,
    "mode": 1,
    "lcd_s": false,
    "lcd_l": false,
    "ssid": "MyNetwork",
    "ap_mode": false,
    "timestamp": 1776589477751,
    "self_update": 0,
    "update_dl_progress": 0,
    "version": 26,
    "error": "NO ERROR"
  }
}
```

**Note:** The successful auth response uses `cmd: "gin"` (not `cmd: "grantAccess"` with `resultCode: 0` as the app code suggests). Only failures return `cmd: "grantAccess"` with a `resultCode`.

| `resultCode` | Meaning |
|---|---|
| `0` | Success |
| `421` | Streaming already in use by another client |

### 4. User Control Heartbeat

While the control screen is active, the app sends every **3000ms**:

```json
{"cmd": "user_control", "enable": true}
```

On exit: `{"cmd": "user_control", "enable": false}`

### 5. Video Stream

A separate WebSocket is opened to `ws://<robot_ip>:12121`. The robot sends binary frames containing **JPEG images** (rotated 90 degrees by the client). Text JSON messages on this socket are forwarded to the `CommandHandler`.

---

## Command Reference

All commands are JSON objects sent over the control WebSocket. Fire-and-forget commands (movement, head, mode, sound) do not require a `seq` field. Settings commands use `seq` for request/response correlation.

### General Response Format

```json
{"cmd": "<original_cmd>", "seq": <original_seq>, "resultCode": 0, ...}
```

---

### Movement

```json
{"cmd": "move", "power": <int>, "angle": <int>}
```

| Field   | Type | Description |
|---------|------|-------------|
| `power` | int  | `0` = stop, `100` = move |
| `angle` | int  | `0` = forward, `90` = right, `-90` = left, `180` = backward |

- Sent repeatedly every **300ms** while a direction button is held.
- Send `{"cmd": "move", "power": 0, "angle": 0}` on release to stop.

---

### Head Control

```json
{"cmd": "head-dir", "dir": <int>}
```

| `dir` | Action |
|-------|--------|
| `-1`  | Turn head left |
| `1`   | Turn head right |
| `0`   | Stop head |

- Sent repeatedly every **200ms** while button is held.

#### Head Shift (Debug/Hidden)

```json
{"cmd": "head-shift", "angle": 5}
```

---

### Mode Commands (Actions / Animations)

```json
{"cmd": "mode", "mode": <int>}
```

| Mode | Action           | Duration (s) |
|------|------------------|-------------|
| 0    | Stop             | -           |
| 2    | Turn Around      | 4           |
| 3    | Turn Left        | 3           |
| 4    | Turn Right       | 3           |
| 5    | Go Forward       | 4           |
| 6    | Lightsaber (toggle) | 2        |
| 9    | Patrol           | 30          |
| 10   | Dance            | 23          |
| 12   | Walk Circle      | 11          |
| 13   | Front LED        | 1           |
| 14   | Back LED         | 1           |
| 15   | Shake Head       | 5           |
| 16   | Arm (toggle)     | 2           |
| 17   | Short LCD (toggle) | 1         |
| 18   | Long LCD (toggle)  | 1         |
| 19   | Projector Video 1  | 11        |
| 20   | Projector Video 2  | 10        |

---

### Sound Playback

```json
{"cmd": "play_sound", "interrupt": 1, "sound_id": <int>}
```

| ID | Sound                    | Duration (s) |
|----|--------------------------|-------------|
| 0  | Pulling it Together      | 4           |
| 1  | Sing Song Response       | 2           |
| 2  | Abrupt Thrill            | 1           |
| 3  | Alarm Thrill             | 1           |
| 4  | Building Freak Out       | 4           |
| 5  | Curt Reply               | 3           |
| 6  | Danger Danger            | 3           |
| 7  | Happiness Confirmation   | 2           |
| 8  | Happy Three Chirp        | 2           |
| 9  | Lonely Hello             | 2           |
| 10 | Lonely Singing           | 4           |
| 11 | Nagging Whine            | 2           |
| 12 | Short Raspberry          | 1           |
| 13 | Startled Three Tone      | 2           |
| 14 | Startled Whoop           | 3           |
| 15 | Stifled Laugh            | 2           |
| 16 | Uncertain Two Tone       | 3           |
| 17 | Unconvinced Grumbling    | 2           |
| 18 | Upset Two Tone           | 2           |

---

### Settings Commands

All settings commands require a `seq` field for response correlation.

#### Power Off

```json
{"cmd": "power", "enable": false, "seq": <int>}
```

#### Mute

```json
{"cmd": "mute", "enable": true|false, "seq": <int>}
```

#### Face Detection

```json
{"cmd": "face_detection", "enable": true|false, "seq": <int>}
```

#### Voice Recognition

```json
{"cmd": "voice_recognition", "enable": true|false, "seq": <int>}
```

#### Change Robot Name

```json
{"cmd": "change_name", "new_name": "R2D2", "seq": <int>}
```

#### Get Paired Device List

```json
{"cmd": "paired_list", "seq": <int>}
```

#### Unpair Device

```json
{"cmd": "unpair", "uuid": "<device_uuid>" | null, "seq": <int>}
```

Pass `null` to unpair all devices.

---

### WiFi Configuration

#### Scan Available Networks

```json
{"cmd": "getWifiList", "seq": <int>}
```

#### Connect to WiFi Network

```json
{"cmd": "connectWifi", "ssid": "...", "wifi_pw": "...", "seq": <int>}
```

Timeout: 30 seconds.

---

## Robot-to-App Messages

### State Update (GIN)

The robot periodically sends its full state:

```json
{
  "cmd": "gin",
  "robot": {
    "uuid": "...",
    "name": "...",
    "ip": "...",
    "battery": 80,
    "charging": 0,
    "mute": false,
    "face_detection": false,
    "voice_recognition": false,
    "lightsaber": false,
    "arm": false,
    "projector": 0,
    "mode": 0,
    "lcd_s": false,
    "lcd_l": false,
    "ssid": "...",
    "ap_mode": false,
    "timestamp": 123456789,
    "self_update": 0,
    "update_dl_progress": 0,
    "error": "NO ERROR"
  }
}
```

### Streaming Conflict

```json
{"cmd": "streaming", "resultCode": 421}
```

Indicates video streaming is already in use by another client.

---

## Robot State Fields

| Field                 | Type    | Description |
|-----------------------|---------|-------------|
| `uuid`                | string  | Robot unique identifier |
| `name`                | string  | Robot display name |
| `ip`                  | string  | Robot IP address |
| `battery`             | int     | Battery percentage (0-100) |
| `charging`            | int     | Charging state (0 = not charging) |
| `mute`                | bool    | Sound muted |
| `face_detection`      | bool    | Face detection enabled |
| `voice_recognition`   | bool    | Voice recognition enabled |
| `lightsaber`          | bool    | Lightsaber deployed |
| `arm`                 | bool    | Arm extended |
| `projector`           | int     | Projector state |
| `mode`                | int     | Current mode (see mode table) |
| `lcd_s`               | bool    | Short LCD on |
| `lcd_l`               | bool    | Long LCD on |
| `ssid`                | string  | Connected WiFi SSID |
| `ap_mode`             | bool    | Robot is in AP (hotspot) mode |
| `timestamp`           | long    | Robot timestamp |
| `self_update`         | int     | Update state |
| `update_dl_progress`  | int     | Update download progress |
| `error`               | string  | Error message (`"NO ERROR"` when OK) |
