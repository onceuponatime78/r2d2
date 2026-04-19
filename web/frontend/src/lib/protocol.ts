// R2-D2 Protocol types and command builders

export interface RobotState {
  uuid: string
  name: string
  ip: string
  battery: number
  charging: number      // 0 = not charging
  mute: boolean
  face_detection: boolean
  voice_recognition: boolean
  lightsaber: boolean
  arm: boolean
  projector: number     // 0 = off
  mode: number
  lcd_s: boolean
  lcd_l: boolean
  ssid: string
  ap_mode: boolean
  timestamp: number
  version: number
  self_update: number
  update_dl_progress: number
  error: string         // "NO ERROR" when OK
}

export interface DiscoveredRobot {
  uuid: string
  name: string
  ip: string
  ap_mode: boolean
}

export interface WifiNetwork {
  ssid: string
  rssi: number
}

export interface PairedClient {
  uuid: string
  device_name: string
}

export const MODE = {
  STOP: 0,
  TURN_AROUND: 2,
  TURN_LEFT: 3,
  TURN_RIGHT: 4,
  FORWARD: 5,
  LIGHTSABER: 6,
  PATROL: 9,
  DANCE: 10,
  WALK_CIRCLE: 12,
  FRONT_LED: 13,
  BACK_LED: 14,
  SHAKE_HEAD: 15,
  ARM_TOGGLE: 16,
  LCD_SHORT: 17,
  LCD_LONG: 18,
  PROJECTOR_1: 19,
  PROJECTOR_2: 20,
} as const

export const SOUNDS: Record<number, string> = {
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

let _seq = 1
const nextSeq = () => _seq++

export const cmd = {
  // ── Connection ──
  grantAccess: (uuid: string, deviceName: string) =>
    JSON.stringify({ cmd: "grantAccess", uuid, device_name: deviceName, seq: nextSeq() }) + "\n",

  // ── Movement ──
  move: (power: number, angle: number) =>
    JSON.stringify({ cmd: "move", power, angle }) + "\n",

  stop: () =>
    JSON.stringify({ cmd: "move", power: 0, angle: 0 }) + "\n",

  headDir: (dir: -1 | 0 | 1) =>
    JSON.stringify({ cmd: "head-dir", dir }) + "\n",

  headShift: (angle: number) =>
    JSON.stringify({ cmd: "head-shift", angle }) + "\n",

  // ── Modes ──
  mode: (mode: number) =>
    JSON.stringify({ cmd: "mode", mode }) + "\n",

  // ── Audio ──
  playSound: (soundId: number) =>
    JSON.stringify({ cmd: "play_sound", interrupt: 1, sound_id: soundId }) + "\n",

  // ── Settings (require seq) ──
  userControl: (enable: boolean) =>
    JSON.stringify({ cmd: "user_control", enable }) + "\n",

  setMute: (enable: boolean) =>
    JSON.stringify({ cmd: "mute", enable, seq: nextSeq() }) + "\n",

  setFaceDetection: (enable: boolean) =>
    JSON.stringify({ cmd: "face_detection", enable, seq: nextSeq() }) + "\n",

  setVoiceRecognition: (enable: boolean) =>
    JSON.stringify({ cmd: "voice_recognition", enable, seq: nextSeq() }) + "\n",

  // ── WiFi ──
  getWifiList: () =>
    JSON.stringify({ cmd: "getWifiList", seq: nextSeq() }) + "\n",

  connectWifi: (ssid: string, password: string) =>
    JSON.stringify({ cmd: "connectWifi", ssid, wifi_pw: password, seq: nextSeq() }) + "\n",

  // ── Device Management ──
  getPairedList: () =>
    JSON.stringify({ cmd: "paired_list", seq: nextSeq() }) + "\n",

  unpair: (uuid: string | null) =>
    JSON.stringify({ cmd: "unpair", uuid, seq: nextSeq() }) + "\n",

  changeName: (newName: string) =>
    JSON.stringify({ cmd: "change_name", new_name: newName, seq: nextSeq() }) + "\n",

  // ── Power ──
  shutdown: () =>
    JSON.stringify({ cmd: "power", enable: false, seq: nextSeq() }) + "\n",
}
