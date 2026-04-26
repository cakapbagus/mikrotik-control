// api/status.js - Cek status blokir yang sedang aktif

const MIKROTIK_IP = process.env.MIKROTIK_IP || "38.225.121.13";
const MIKROTIK_PORT = process.env.MIKROTIK_PORT || "8080";
const MIKROTIK_USER = process.env.MIKROTIK_USER || "admin";
const MIKROTIK_PASS = process.env.MIKROTIK_PASS || "";

const BASE_URL = `http://${MIKROTIK_IP}:${MIKROTIK_PORT}/rest`;

async function mikrotikRequest(path) {
  const credentials = Buffer.from(`${MIKROTIK_USER}:${MIKROTIK_PASS}`).toString("base64");
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) throw new Error(`Mikrotik error ${res.status}`);
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
