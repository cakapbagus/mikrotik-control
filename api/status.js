// api/status.js - Cek status blokir yang sedang aktif

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

async function mikrotikRequest(path) {
  const credentials = Buffer.from(`${MIKROTIK_USER}:${MIKROTIK_PASS}`).toString("base64");
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    throw new Error(`Tidak bisa terhubung ke Mikrotik (${BASE_URL}): ${err.message}`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mikrotik error ${res.status}: ${text || "Tanpa detail error"}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");

  if (req.method === "OPTIONS") return res.status(200).end();

  const adminKey = req.headers["x-admin-key"];
  if (process.env.ADMIN_KEY && adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const ADDRESS_LISTS = ["ALL-SISWA", "ALL-SISWA-10", "ALL-SISWA-11", "ALL-SISWA-12"];

  try {
    const rules = await mikrotikRequest("/ip/firewall/filter");

    const status = {};
    for (const list of ADDRESS_LISTS) {
      const rule = rules.find(
        (r) => r.comment === `BLOCK-${list}` && r["src-address-list"] === list
      );

      if (rule && rule.disabled !== "true") {
        // timeout tersisa (format: HH:MM:SS)
        status[list] = {
          blocked: true,
          timeoutRemaining: rule.timeout || null,
          ruleId: rule[".id"],
        };
      } else {
        status[list] = { blocked: false };
      }
    }

    return res.status(200).json({ success: true, status });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
