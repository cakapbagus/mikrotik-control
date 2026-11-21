import { findRule, firewall, lists, request, scheduler } from "../mikrotik.mjs";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (process.env.ADMIN_KEY && req.headers["x-admin-key"] !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { addressList } = req.body ?? {};
  if (!lists.includes(addressList)) {
    return res.status(400).json({ error: "Address list tidak valid" });
  }

  try {
    const [rules, schedules] = await Promise.all([request(firewall), request(scheduler)]);
    const rule = findRule(rules, addressList);
    const schedule = schedules.find((item) => item.name === `UNBLOCK-${addressList}`);
    if (rule) await request(`${firewall}/${rule[".id"]}`, "DELETE");
    if (schedule) await request(`${scheduler}/${schedule[".id"]}`, "DELETE");

    return res.status(200).json({ success: true, message: `${addressList} sudah dinyalakan kembali` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
