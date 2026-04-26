// api/unblock.js - Batalkan blokir internet secara manual

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
  if (!res.ok) throw new Error(`Mikrotik error ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
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

  const { addressList } = req.body;
  const validLists = ["ALL-SISWA", "ALL-SISWA-10", "ALL-SISWA-11", "ALL-SISWA-12"];

  if (!validLists.includes(addressList)) {
    return res.status(400).json({ error: "Address list tidak valid" });
  }

  try {
    const rules = await mikrotikRequest("/ip/firewall/filter");
    const rule = rules.find(
      (r) => r.comment === `BLOCK-${addressList}` && r["src-address-list"] === addressList
    );

    if (rule) {
      await mikrotikRequest(`/ip/firewall/filter/${rule[".id"]}`, "DELETE");
    }

    return res.status(200).json({ success: true, message: `${addressList} sudah dinyalakan kembali` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
