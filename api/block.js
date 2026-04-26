// api/block.js - Vercel Serverless Function
// Proxy ke Mikrotik REST API (RouterOS v7)

const MIKROTIK_IP = process.env.MIKROTIK_IP || "38.225.121.13";
const MIKROTIK_PORT = process.env.MIKROTIK_PORT || "8080";
const MIKROTIK_USER = process.env.MIKROTIK_USER || "admin";
const MIKROTIK_PASS = process.env.MIKROTIK_PASS || "";

const BASE_URL = `http://${MIKROTIK_IP}:${MIKROTIK_PORT}/rest`;

async function mikrotikRequest(path, method = "GET", body = null) {
  const credentials = Buffer.from(`${MIKROTIK_USER}:${MIKROTIK_PASS}`).toString("base64");
  const options = {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mikrotik error ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function deleteIfExists(endpoint, nameField, nameValue) {
  try {
    const items = await mikrotikRequest(endpoint);
    const arr = Array.isArray(items) ? items : Object.values(items);
    const found = arr.find((x) => x[nameField] === nameValue);
    if (found) {
      await mikrotikRequest(`${endpoint}/${found[".id"]}`, "DELETE");
    }
  } catch (e) {
    console.log(`Skip delete ${nameValue}:`, e.message);
  }
}

// Ambil waktu saat ini dari Mikrotik
async function getMikrotikTime() {
  const clock = await mikrotikRequest("/system/clock");
  // clock.time format: "HH:MM:SS"
  return clock.time;
}

// Tambah durasi ke waktu HH:MM:SS, hasilkan HH:MM:SS
function addSeconds(timeStr, seconds) {
  const [h, m, s] = timeStr.split(":").map(Number);
  const total = h * 3600 + m * 60 + s + seconds;
  const rh = Math.floor(total / 3600) % 24;
  const rm = Math.floor((total % 3600) / 60);
  const rs = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(rh)}:${pad(rm)}:${pad(rs)}`;
}

async function addBlockRule(addressList, durationSeconds) {
  const minutes = Math.floor(durationSeconds / 60);
  const comment = `BLOCK-${addressList}`;
  const schedName = `UNBLOCK-${addressList}`;

  // 1. Hapus rule lama
  await deleteIfExists("/ip/firewall/filter", "comment", comment);

  // 2. Hapus scheduler lama
  await deleteIfExists("/system/scheduler", "name", schedName);

  // 3. Tambah rule DROP
  await mikrotikRequest("/ip/firewall/filter/add", "POST", {
    chain: "forward",
    action: "drop",
    "src-address-list": addressList,
    comment: comment,
    disabled: "false",
  });

  // 4. Ambil waktu Mikrotik sekarang, hitung waktu unblock
  const currentTime = await getMikrotikTime();
  const startTime = addSeconds(currentTime, durationSeconds);

  // 5. Buat scheduler: jalankan SEKALI pada jam startTime
  // count=1 = hanya jalan sekali lalu hapus dirinya sendiri
  const unblockScript =
    `/ip firewall filter remove [find comment="${comment}"]` +
    `\n/system scheduler remove [find name="${schedName}"]`;

  await mikrotikRequest("/system/scheduler/add", "POST", {
    name: schedName,
    "start-time": startTime,
    interval: "00:00:00", // 0 = tidak repeat
    "on-event": unblockScript,
    policy: "read,write,policy,test",
  });

  return { success: true, addressList, minutes, unblockAt: startTime };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const adminKey = req.headers["x-admin-key"];
  if (process.env.ADMIN_KEY && adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { addressList, duration } = req.body;

  const validLists = ["ALL-SISWA", "ALL-SISWA-10", "ALL-SISWA-11", "ALL-SISWA-12"];
  const validDurations = [300, 900];

  if (!validLists.includes(addressList)) {
    return res.status(400).json({ error: "Address list tidak valid" });
  }
  if (!validDurations.includes(duration)) {
    return res.status(400).json({ error: "Durasi tidak valid" });
  }

  try {
    const result = await addBlockRule(addressList, duration);
    return res.status(200).json({
      success: true,
      message: `Internet ${addressList} dimatikan selama ${result.minutes} menit (aktif sampai ${result.unblockAt})`,
      ...result,
    });
  } catch (err) {
    console.error("Mikrotik error:", err);
    return res.status(500).json({ error: err.message });
  }
}
