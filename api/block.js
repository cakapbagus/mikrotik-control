import { clockOffset, findRule, firewall, isoDate, lists, request, routerDate, scheduler } from "../mikrotik.mjs";

const wibOffset = 7 * 60 * 60 * 1000;
const wibFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta",
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (process.env.ADMIN_KEY && req.headers["x-admin-key"] !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { addressList, duration, until } = req.body ?? {};
  if (!lists.includes(addressList)) {
    return res.status(400).json({ error: "Address list tidak valid" });
  }

  let deadline;
  if (until === undefined) {
    if (![300, 900].includes(duration)) {
      return res.status(400).json({ error: "Durasi tidak valid" });
    }
  } else {
    const local = typeof until === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(until)
      ? Date.parse(`${until}:00Z`)
      : NaN;
    if (duration !== undefined || !Number.isFinite(local) || new Date(local).toISOString().slice(0, 16) !== until) {
      return res.status(400).json({ error: "Tanggal dan jam WIB tidak valid" });
    }
    deadline = local - wibOffset;
    if (deadline <= Date.now()) {
      return res.status(400).json({ error: "Pilih tanggal dan jam WIB yang akan datang" });
    }
  }

  let stagedRule;
  try {
    const [clock, rules, schedules] = await Promise.all([
      request("/system/clock"), request(firewall), request(scheduler),
    ]);
    const offset = clockOffset(clock);
    const clockTime = Date.parse(`${isoDate(clock.date)}T${clock.time}Z`) - offset;
    if (!Number.isFinite(clockTime)) throw new Error("Tanggal dan jam MikroTik tidak terbaca");

    const target = deadline ?? clockTime + duration * 1000;
    if (target <= clockTime || (deadline !== undefined && deadline <= Date.now())) {
      return res.status(400).json({ error: "Waktu yang dipilih sudah lewat" });
    }

    const [date, time] = new Date(target + offset).toISOString().slice(0, 19).split("T");
    const comment = `BLOCK-${addressList}`;
    const name = `UNBLOCK-${addressList}`;
    const schedule = schedules.find((item) => item.name === name);
    const rule = findRule(rules, addressList);

    if (!rule) {
      const created = await request(firewall, "PUT", {
        chain: "forward", action: "drop", "src-address-list": addressList, comment, disabled: "true",
      });
      stagedRule = created[".id"];
      if (!stagedRule) throw new Error("ID rule MikroTik tidak diterima");
      if (rules.length) {
        await request(`${firewall}/move`, "POST", { ".id": stagedRule, destination: "0" });
      }
    }

    const settings = {
      name,
      "start-date": routerDate(date, clock),
      "start-time": time,
      interval: "00:00:00",
      disabled: "false",
      "on-event": `/ip firewall filter remove [find comment="${comment}" src-address-list="${addressList}"]\n/system scheduler remove [find name="${name}"]`,
      policy: "read,write,policy,test",
    };
    if (schedule) {
      await request(`${scheduler}/${schedule[".id"]}`, "PATCH", settings);
    } else {
      await request(scheduler, "PUT", settings);
    }

    if (stagedRule || rule?.disabled === "true") {
      await request(`${firewall}/${stagedRule || rule[".id"]}`, "PATCH", { disabled: "false" });
      stagedRule = undefined;
    }

    return res.status(200).json({
      success: true,
      addressList,
      ...(duration !== undefined && { minutes: duration / 60 }),
      unblockAt: time,
      unblockAtIso: new Date(target).toISOString(),
      message: `Internet ${addressList} dimatikan sampai ${wibFormatter.format(target)} WIB`,
    });
  } catch (err) {
    if (stagedRule) {
      await request(`${firewall}/${stagedRule}`, "DELETE").catch(console.error);
    }
    return res.status(500).json({ error: err.message });
  }
}
