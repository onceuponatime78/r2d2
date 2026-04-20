# R2-D2 Controller — Home Assistant Add-on

Web control interface for the DeAgostini "Build Your Own R2-D2" Astromech droid, running as a Home Assistant add-on.

## Features

- Full joystick control, head rotation, animations, sounds
- Live video feed with snapshot and recording
- WiFi management and device pairing
- AP mode pairing for initial setup
- Multi-robot support
- WebSocket proxy for remote access via Nabu Casa

## Requirements

- Your R2-D2 robot must be on the **same network** as your Home Assistant instance
- The add-on uses host networking for UDP robot discovery

## How It Works

The add-on runs a lightweight Go server that:

1. **Discovers** R2-D2 robots via UDP broadcast on your LAN
2. **Serves** the web control interface through HA's ingress (sidebar)
3. **Proxies** WebSocket connections to the robot, enabling remote access through Nabu Casa

## Remote Access

Unlike the standalone binary (which requires direct LAN access to the robot), the add-on proxies all WebSocket traffic through the server. This means you can control your R2-D2 remotely via Home Assistant's Nabu Casa or other remote access methods.

**Note:** Video streaming over remote connections depends on your upload bandwidth. The robot streams at approximately 720 kbps (JPEG frames at ~10 fps).

## Troubleshooting

- **Robot not found:** Ensure the robot is powered on and connected to the same WiFi network as your HA instance. Some robots occasionally stop broadcasting — try power-cycling the robot.
- **Video not loading:** Another client may have the video feed. Only one client can view video at a time.
- **Slow WiFi/device commands:** The robot takes 30-45 seconds to respond to WiFi scan and device list requests. This is a firmware limitation.
