// api/block.js - Vercel Serverless Function
// Proxy ke Mikrotik REST API (RouterOS v7)

function getEnv(name, fallback = "") {
  const value = process.env[name];
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed === "" ? fallback : trimmed;
}

const MIKROTIK_IP = getEnv("MIKROTIK_IP", "38.225.121.13");
const MIKROTIK_PORT = getEnv("MIKROTIK_PORT", "8080");
const MIKROTIK_USER = getEnv("MIKROTIK_USER", "admin");
const MIKROTIK_PASS = getEnv("MIKROTIK_PASS", "");
const MIKROTIK_SCHEME = getEnv("MIKROTIK_SCHEME", "http");

const BASE_URL = `${MIKROTIK_SCHEME}://${MIKROTIK_IP}:${MIKROTIK_PORT}/rest`;

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

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, options);
  } catch (err) {
    throw new Error(`Tidak bisa terhubung ke Mikrotik (${BASE_URL}): ${err.message}`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mikrotik error ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// Cari rule yang sudah ada untuk address-list ini
async function findExistingRule(addressList) {
  const rules = await mikrotikRequest("/ip/firewall/filter");
  return rules.find(
    (r) =>
      r.comment === `BLOCK-${addressList}` &&
      r.action === "drop" &&
      r["src-address-list"] === addressList
  );
}

// Tambah rule DROP untuk address-list
async function addBlockRule(addressList, durationSeconds) {
  // Hapus rule lama jika ada
  const existing = await findExistingRule(addressList);
  if (existing) {
    await mikrotikRequest(`/ip/firewall/filter/${existing[".id"]}`, "DELETE");
  }

  // Format durasi untuk RouterOS (misal: 5m, 15m)
  const minutes = Math.floor(durationSeconds / 60);
  const timeout = `00:${String(minutes).padStart(2, "0")}:00`;

  // Tambah rule baru dengan timeout
  await mikrotikRequest("/ip/firewall/filter/add", "POST", {
    chain: "forward",
    action: "drop",
    "src-address-list": addressList,
    comment: `BLOCK-${addressList}`,
    timeout,
    disabled: "false",
    place: "0", // taruh di atas
  });

  return { success: true, addressList, minutes };
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Simple auth dengan header key
  const adminKey = req.headers["x-admin-key"];
  if (process.env.ADMIN_KEY && adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { addressList, duration } = req.body;

  const validLists = ["ALL-SISWA", "ALL-SISWA-10", "ALL-SISWA-11", "ALL-SISWA-12"];
  const validDurations = [300, 900]; // 5 menit atau 15 menit

  if (!validLists.includes(addressList)) {
    return res.status(400).json({ error: "Address list tidak valid" });
  }

  if (!validDurations.includes(duration)) {
    return res.status(400).json({ error: "Durasi tidak valid (5 atau 15 menit)" });
  }

  try {
    const result = await addBlockRule(addressList, duration);
    return res.status(200).json({
      success: true,
      message: `Internet ${addressList} dimatikan selama ${result.minutes} menit`,
      ...result,
    });
  } catch (err) {
    console.error("Mikrotik error:", err);
    return res.status(500).json({ error: err.message });
  }
}
