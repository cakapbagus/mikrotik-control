import { clockOffset, findRule, firewall, isoDate, lists, request, scheduler } from "../mikrotik.mjs";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (process.env.ADMIN_KEY && req.headers["x-admin-key"] !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const [rules, schedules, clock] = await Promise.all([
      request(firewall), request(scheduler), request("/system/clock"),
    ]);
    const offset = clockOffset(clock);
    const status = {};
    for (const list of lists) {
      const rule = findRule(rules, list);
      if (!rule || rule.disabled === "true") {
        status[list] = { blocked: false };
        continue;
      }

      const schedule = schedules.find((item) => item.name === `UNBLOCK-${list}` && item.disabled !== "true");
      const date = isoDate(schedule?.["start-date"]);
      const target = Date.parse(`${date}T${schedule?.["start-time"]}Z`) - offset;
      status[list] = {
        blocked: true,
        timeoutRemaining: rule.timeout || null,
        ruleId: rule[".id"],
        unblockAt: Number.isFinite(target) ? new Date(target).toISOString() : null,
      };
    }
    return res.status(200).json({ success: true, status });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
