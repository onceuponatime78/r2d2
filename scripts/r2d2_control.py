#!/usr/bin/env python3
"""
R2-D2 (DeAgostini) Pairing & Control Script

Usage:
  1. Connect to the robot's WiFi AP (e.g. "R2D2-596")
  2. Run: python3 scripts/r2d2_control.py --pair
     This pairs with the robot and saves the UUID for future use.
  3. Reconnect to your normal WiFi network.
  4. Run: python3 scripts/r2d2_control.py --demo
     This discovers the robot via UDP and runs a demo sequence.

Commands:
  --pair          Pair with robot (run while on robot's AP WiFi)
  --demo          Run demo sequence (arm, sound, head shake)
  --sound <0-18>  Play a sound
  --arm           Toggle arm
  --dance         Dance
  --patrol        Patrol
  --forward       Move forward
  --stop          Stop all movement
  --head-left     Turn head left
  --head-right    Turn head right
  --status        Show robot status
  --ip <ip>       Override robot IP (skip UDP discovery)
"""

import asyncio
import json
import os
import socket
import sys
import time
import uuid

# No external dependencies needed for websocket - use raw sockets
import hashlib
import base64
import struct
import random

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
UUID_FILE = os.path.join(SCRIPT_DIR, ".r2d2_uuid")
CONTROL_PORT = 8887
VIDEO_PORT = 12121
UDP_PORT = 8090
DEVICE_NAME = "R2D2-Controller"


# ── Minimal WebSocket client (no dependencies) ──────────────────────────


class SimpleWebSocket:
    """Minimal WebSocket client using only stdlib."""

    def __init__(self, host, port, path="/"):
        self.host = host
        self.port = port
        self.path = path
        self.sock = None

    def connect(self, timeout=5):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(timeout)
        self.sock.connect((self.host, self.port))

        # WebSocket handshake
        key = base64.b64encode(os.urandom(16)).decode()
        handshake = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"\r\n"
        )
        self.sock.sendall(handshake.encode())

        # Read response headers
        response = b""
        while b"\r\n\r\n" not in response:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("WebSocket handshake failed")
            response += chunk

        if b"101" not in response.split(b"\r\n")[0]:
            raise ConnectionError(f"WebSocket handshake rejected: {response.decode()}")

        # Store any extra data after headers
        self._buffer = response.split(b"\r\n\r\n", 1)[1]

    def send(self, message):
        """Send a text frame."""
        data = message.encode("utf-8")
        frame = bytearray()
        frame.append(0x81)  # FIN + text opcode

        mask_key = os.urandom(4)
        length = len(data)

        if length < 126:
            frame.append(0x80 | length)  # masked
        elif length < 65536:
            frame.append(0x80 | 126)
            frame.extend(struct.pack(">H", length))
        else:
            frame.append(0x80 | 127)
            frame.extend(struct.pack(">Q", length))

        frame.extend(mask_key)
        masked = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(data))
        frame.extend(masked)

        self.sock.sendall(frame)

    def recv(self, timeout=5):
        """Receive a text or binary frame. Returns (opcode, data)."""
        self.sock.settimeout(timeout)

        def read_bytes(n):
            buf = b""
            if self._buffer:
                buf = self._buffer[:n]
                self._buffer = self._buffer[n:]
                n -= len(buf)
            while n > 0:
                chunk = self.sock.recv(n)
                if not chunk:
                    raise ConnectionError("Connection closed")
                buf += chunk
                n -= len(chunk)
            return buf

        header = read_bytes(2)
        opcode = header[0] & 0x0F
        masked = bool(header[1] & 0x80)
        length = header[1] & 0x7F

        if length == 126:
            length = struct.unpack(">H", read_bytes(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", read_bytes(8))[0]

        if masked:
            mask_key = read_bytes(4)
            data = bytearray(read_bytes(length))
            data = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(data))
        else:
            data = read_bytes(length)

        # Handle close frame
        if opcode == 0x08:
            raise ConnectionError("Server closed connection")

        # Handle ping - reply with pong
        if opcode == 0x09:
            pong = bytearray([0x8A, 0x80 | len(data)])
            mask_key = os.urandom(4)
            pong.extend(mask_key)
            pong.extend(bytearray(b ^ mask_key[i % 4] for i, b in enumerate(data)))
            self.sock.sendall(pong)
            return self.recv(timeout)  # recurse to get actual message

        if opcode == 0x01:  # text
            return "text", data.decode("utf-8")
        return "binary", bytes(data)

    def close(self):
        if self.sock:
            try:
                # Send close frame
                close_frame = bytearray([0x88, 0x80, 0x00, 0x00, 0x00, 0x00])
                self.sock.sendall(close_frame)
            except:
                pass
            self.sock.close()


# ── UUID management ──────────────────────────────────────────────────────


def load_uuid():
    if os.path.exists(UUID_FILE):
        with open(UUID_FILE) as f:
            return f.read().strip()
    return None


def save_uuid(client_uuid):
    with open(UUID_FILE, "w") as f:
        f.write(client_uuid)
    print(f"  UUID saved to {UUID_FILE}")


def get_or_create_uuid():
    existing = load_uuid()
    if existing:
        return existing
    new_uuid = str(uuid.uuid4())
    save_uuid(new_uuid)
    return new_uuid


# ── Robot discovery ──────────────────────────────────────────────────────


def discover_robot(timeout=10):
    """Listen for robot UDP broadcasts."""
    print(f"Listening for R2-D2 broadcasts on UDP {UDP_PORT} ({timeout}s)...")
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.settimeout(timeout)
    sock.bind(("0.0.0.0", UDP_PORT))

    # Get our own IP to filter out our own broadcasts
    local_ip = None
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except:
        pass

    # Send probe
    probe = json.dumps({"cmd": "updBroadcast"}).encode()
    try:
        sock.sendto(probe, ("255.255.255.255", UDP_PORT))
    except:
        pass

    try:
        while True:
            data, addr = sock.recvfrom(4096)
            # Skip our own broadcasts
            if addr[0] == local_ip:
                continue
            try:
                msg = json.loads(data.decode())
                print(f"  Raw broadcast from {addr[0]}: {json.dumps(msg)}")
                if msg.get("cmd") == "updBroadcast" and msg.get("name"):
                    ip = msg.get("ip") or addr[0]
                    msg["ip"] = ip
                    print(f"  Found robot: {msg.get('name', '?')} at {ip}")
                    print(f"  Robot UUID: {msg.get('uuid', '?')}")
                    print(f"  AP mode: {msg.get('ap_mode', '?')}")
                    sock.close()
                    return msg
            except (json.JSONDecodeError, UnicodeDecodeError):
                print(f"  Non-JSON broadcast from {addr[0]}: {data[:100]}")
    except socket.timeout:
        print("  No robot found.")
        sock.close()
        return None


# ── Robot connection ─────────────────────────────────────────────────────


class R2D2:
    def __init__(self, ip, client_uuid):
        self.ip = ip
        self.client_uuid = client_uuid
        self.ws = None
        self.seq = 0
        self.robot_state = {}

    def connect(self):
        print(f"Connecting to ws://{self.ip}:{CONTROL_PORT}...")
        self.ws = SimpleWebSocket(self.ip, CONTROL_PORT)
        self.ws.connect(timeout=5)
        print("  WebSocket connected.")

    def authenticate(self):
        self.seq += 1
        cmd = {
            "cmd": "grantAccess",
            "uuid": self.client_uuid,
            "device_name": DEVICE_NAME,
            "seq": self.seq,
        }
        print(f"  Authenticating with UUID {self.client_uuid}...")
        self.ws.send(json.dumps(cmd) + "\n")

        _, data = self.ws.recv(timeout=5)
        print(f"  Raw response: {data}")
        resp = json.loads(data)
        rc = resp.get("resultCode")

        if rc == 401:
            print(f"  Authentication FAILED: resultCode=401")
            print("  Robot rejected our UUID. Try --pair while on robot's AP WiFi.")
            return False

        # Any other response (0, None, or anything else) = success
        self.robot_state = resp.get("robot", {})
        name = self.robot_state.get("name", "unknown")
        battery = self.robot_state.get("battery", "?")
        print(f"  Authenticated! Robot: {name}, Battery: {battery}%")
        return True

    def wait(self, seconds):
        """Sleep while sending heartbeat and draining incoming messages."""
        end = time.time() + seconds
        while time.time() < end:
            remaining = end - time.time()
            # Try to read any incoming messages (gin updates, etc.)
            try:
                self.ws.sock.settimeout(0.5)
                self.ws.recv(timeout=0.5)
            except:
                pass
            remaining = end - time.time()
            if remaining <= 0:
                break
            time.sleep(min(1.0, remaining))

    def send_cmd(self, cmd_dict):
        """Send a fire-and-forget command."""
        self.ws.send(json.dumps(cmd_dict) + "\n")

    def send_request(self, cmd_dict):
        """Send a command with seq and wait for response (skips gin and stale messages)."""
        self.seq += 1
        cmd_dict["seq"] = self.seq
        expected_cmd = cmd_dict["cmd"]
        expected_seq = self.seq
        self.ws.send(json.dumps(cmd_dict) + "\n")
        # Read up to 10 messages, skipping gin state updates and stale responses
        for _ in range(10):
            try:
                _, data = self.ws.recv(timeout=5)
                msg = json.loads(data)
                if msg.get("cmd") == "gin":
                    self.robot_state = msg.get("robot", {})
                    continue
                # Skip stale responses from earlier seq numbers
                if msg.get("seq") is not None and msg.get("seq") != expected_seq:
                    continue
                return msg
            except:
                return None
        return None

    def user_control(self, enable):
        self.send_cmd({"cmd": "user_control", "enable": enable})

    def move(self, power, angle):
        self.send_cmd({"cmd": "move", "power": power, "angle": angle})

    def stop(self):
        self.move(0, 0)

    def head(self, direction):
        """direction: -1=left, 0=stop, 1=right"""
        self.send_cmd({"cmd": "head-dir", "dir": direction})

    def mode(self, mode_id):
        self.send_cmd({"cmd": "mode", "mode": mode_id})

    def play_sound(self, sound_id):
        self.send_cmd({"cmd": "play_sound", "interrupt": 1, "sound_id": sound_id})

    def arm(self):
        self.mode(16)

    def dance(self):
        self.mode(10)

    def patrol(self):
        self.mode(9)

    def shake_head(self):
        self.mode(15)

    def front_led(self):
        self.mode(13)

    def back_led(self):
        self.mode(14)

    def lightsaber(self):
        self.mode(6)

    def status(self):
        """Read incoming messages to get latest GIN state."""
        try:
            while True:
                _, data = self.ws.recv(timeout=2)
                msg = json.loads(data)
                if msg.get("cmd") == "gin":
                    self.robot_state = msg.get("robot", {})
        except:
            pass
        return self.robot_state

    def disconnect(self):
        if self.ws:
            try:
                self.user_control(False)
            except:
                pass
            self.ws.close()
            print("Disconnected.")

    # ── Protocol discovery methods ──

    def get_wifi_list(self):
        """Request available WiFi networks."""
        return self.send_request({"cmd": "getWifiList"})

    def get_paired_list(self):
        """Request list of paired devices."""
        return self.send_request({"cmd": "paired_list"})

    def change_name(self, new_name):
        """Rename the robot."""
        return self.send_request({"cmd": "change_name", "new_name": new_name})

    def set_mute(self, enable):
        """Toggle mute."""
        return self.send_request({"cmd": "mute", "enable": enable})

    def set_face_detection(self, enable):
        """Toggle face detection."""
        return self.send_request({"cmd": "face_detection", "enable": enable})


# ── Commands ─────────────────────────────────────────────────────────────


def cmd_pair(ip=None):
    """Pair with robot in AP mode."""
    if not ip:
        broadcast = discover_robot(timeout=10)
        if broadcast:
            ip = broadcast.get("ip", "192.168.43.1")
        else:
            ip = "192.168.43.1"
            print(f"  No broadcast received, trying default AP IP: {ip}")

    client_uuid = str(uuid.uuid4())
    print(f"  Generated new UUID: {client_uuid}")

    robot = R2D2(ip, client_uuid)
    try:
        robot.connect()
        if robot.authenticate():
            save_uuid(client_uuid)
            print("\n  Pairing successful! You can now reconnect to your normal WiFi")
            print(
                "  and control the robot with: python3 scripts/r2d2_control.py --demo"
            )

            # Quick test - play a sound
            robot.user_control(True)
            time.sleep(0.3)
            robot.play_sound(7)  # Happiness Confirmation
            time.sleep(2)
            robot.user_control(False)
        else:
            print(
                "\n  Pairing failed. Make sure the robot is in AP mode (button 5, yellow LED)"
            )
    except Exception as e:
        print(f"  Connection error: {e}")
    finally:
        robot.disconnect()


def cmd_control(action, ip=None, sound_id=None):
    """Connect and send a command."""
    if not ip:
        broadcast = discover_robot(timeout=10)
        if not broadcast or not broadcast.get("ip"):
            print("Robot not found. Use --ip to specify manually.")
            return
        ip = broadcast["ip"]

    client_uuid = load_uuid()
    if not client_uuid:
        print("No saved UUID. Run --pair first while on robot's AP WiFi.")
        return

    robot = R2D2(ip, client_uuid)
    try:
        robot.connect()
        if not robot.authenticate():
            return

        robot.user_control(True)
        robot.wait(0.3)

        if action == "demo":
            print("\n--- Demo sequence ---")

            print("  Playing 'Lonely Hello'...")
            robot.play_sound(9)
            robot.wait(2.5)

            print("  Opening arm...")
            robot.arm()
            robot.wait(3)

            print("  Shaking head...")
            robot.shake_head()
            robot.wait(5.5)

            print("  Front LED...")
            robot.front_led()
            robot.wait(2)

            print("  Playing 'Happy Three Chirp'...")
            robot.play_sound(8)
            robot.wait(2.5)

            print("  Closing arm...")
            robot.arm()
            robot.wait(3)

            print("--- Demo complete ---")

        elif action == "sound":
            print(f"  Playing sound {sound_id}...")
            robot.play_sound(sound_id)
            robot.wait(4)

        elif action == "arm":
            print("  Toggling arm...")
            robot.arm()
            robot.wait(3)

        elif action == "dance":
            print("  Dancing! (23s)")
            robot.dance()
            robot.wait(24)

        elif action == "patrol":
            print("  Patrolling! (30s)")
            robot.patrol()
            robot.wait(31)

        elif action == "forward":
            print("  Moving forward (3s)...")
            for _ in range(10):
                robot.move(100, 0)
                time.sleep(0.3)
            robot.stop()

        elif action == "stop":
            robot.stop()
            robot.mode(0)

        elif action == "head-left":
            print("  Turning head left (2s)...")
            for _ in range(10):
                robot.head(-1)
                time.sleep(0.2)
            robot.head(0)

        elif action == "head-right":
            print("  Turning head right (2s)...")
            for _ in range(10):
                robot.head(1)
                time.sleep(0.2)
            robot.head(0)

        elif action == "status":
            state = robot.status()
            print("\n--- Robot Status ---")
            for k, v in sorted(state.items()):
                print(f"  {k}: {v}")

        elif action == "lightsaber":
            print("  Toggling lightsaber...")
            robot.lightsaber()
            robot.wait(3)

        robot.user_control(False)
        time.sleep(0.2)

    except Exception as e:
        print(f"Error: {e}")
    finally:
        robot.disconnect()


def cmd_protocol_test(action, ip=None):
    """Test undocumented protocol commands and print raw responses."""
    if not ip:
        broadcast = discover_robot(timeout=10)
        if not broadcast or not broadcast.get("ip"):
            print("Robot not found. Use --ip to specify manually.")
            return
        ip = broadcast["ip"]

    client_uuid = load_uuid()
    if not client_uuid:
        print("No UUID found. Run --pair first.")
        return

    robot = R2D2(ip, client_uuid)
    try:
        robot.connect()
        if not robot.authenticate():
            print("Auth failed.")
            return

        robot.user_control(True)
        time.sleep(0.3)

        if action == "wifi-list":
            print("\n--- getWifiList ---")
            resp = robot.get_wifi_list()
            print(f"  Raw response: {json.dumps(resp, indent=2)}")

        elif action == "paired-list":
            print("\n--- paired_list ---")
            resp = robot.get_paired_list()
            print(f"  Raw response: {json.dumps(resp, indent=2)}")

        elif action == "test-mute":
            print("\n--- mute toggle ---")
            resp = robot.set_mute(True)
            print(f"  Mute ON response: {json.dumps(resp, indent=2)}")
            time.sleep(1)
            resp = robot.set_mute(False)
            print(f"  Mute OFF response: {json.dumps(resp, indent=2)}")

        elif action == "test-face":
            print("\n--- face_detection toggle ---")
            resp = robot.set_face_detection(True)
            print(f"  Face ON response: {json.dumps(resp, indent=2)}")
            time.sleep(1)
            resp = robot.set_face_detection(False)
            print(f"  Face OFF response: {json.dumps(resp, indent=2)}")

        robot.user_control(False)
        time.sleep(0.2)

    except Exception as e:
        print(f"Error: {e}")
    finally:
        robot.disconnect()


# ── CLI ──────────────────────────────────────────────────────────────────

SOUNDS = {
    0: "Pulling it Together",
    1: "Sing Song Response",
    2: "Abrupt Thrill",
    3: "Alarm Thrill",
    4: "Building Freak Out",
    5: "Curt Reply",
    6: "Danger Danger",
    7: "Happiness Confirmation",
    8: "Happy Three Chirp",
    9: "Lonely Hello",
    10: "Lonely Singing",
    11: "Nagging Whine",
    12: "Short Raspberry",
    13: "Startled Three Tone",
    14: "Startled Whoop",
    15: "Stifled Laugh",
    16: "Uncertain Two Tone",
    17: "Unconvinced Grumbling",
    18: "Upset Two Tone",
}


def print_usage():
    print("R2-D2 Control Script")
    print("=" * 40)
    print("Usage: python3 scripts/r2d2_control.py [--ip IP] COMMAND")
    print()
    print("Commands:")
    print("  --pair          Pair with robot (on robot's AP WiFi)")
    print("  --demo          Run demo sequence")
    print("  --arm           Toggle arm")
    print("  --dance         Dance (23s)")
    print("  --patrol        Patrol (30s)")
    print("  --forward       Move forward (3s)")
    print("  --stop          Stop everything")
    print("  --head-left     Turn head left")
    print("  --head-right    Turn head right")
    print("  --lightsaber    Toggle lightsaber")
    print("  --status        Show robot status")
    print("  --sound N       Play sound (0-18)")
    print()
    print("Sounds:")
    for sid, name in sorted(SOUNDS.items()):
        print(f"  {sid:2d}: {name}")


if __name__ == "__main__":
    args = sys.argv[1:]

    if not args or "--help" in args or "-h" in args:
        print_usage()
        sys.exit(0)

    # Parse --ip
    ip = None
    if "--ip" in args:
        idx = args.index("--ip")
        ip = args[idx + 1]
        args = args[:idx] + args[idx + 2 :]

    action = args[0].lstrip("-") if args else None

    if action == "pair":
        cmd_pair(ip)
    elif action == "sound" and len(args) > 1:
        cmd_control("sound", ip, sound_id=int(args[1]))
    elif action in (
        "demo",
        "arm",
        "dance",
        "patrol",
        "forward",
        "stop",
        "head-left",
        "head-right",
        "status",
        "lightsaber",
    ):
        cmd_control(action, ip)
    elif action in ("wifi-list", "paired-list", "test-mute", "test-face"):
        cmd_protocol_test(action, ip)
    else:
        print(f"Unknown command: {action}")
        print_usage()
        sys.exit(1)
