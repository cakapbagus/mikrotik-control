const host = process.env.MIKROTIK_IP || "38.225.121.13";
const port = process.env.MIKROTIK_PORT || "8080";
const user = process.env.MIKROTIK_USER || "admin";
const password = process.env.MIKROTIK_PASS || "";
const credentials = Buffer.from(`${user}:${password}`).toString("base64");

export const lists = ["ALL-SISWA", "ALL-SISWA-10", "ALL-SISWA-11", "ALL-SISWA-12"];
export const firewall = "/ip/firewall/filter";
export const scheduler = "/system/scheduler";

export async function request(path, method = "GET", body) {
  const response = await fetch(`http://${host}:${port}/rest${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (method === "DELETE" && response.status === 404) return {};
  if (!response.ok) throw new Error(`Mikrotik error ${response.status}: ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

export function findRule(rules, list) {
  return rules.find((rule) => rule.comment === `BLOCK-${list}` && rule["src-address-list"] === list);
}

const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function isoDate(date) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const match = /^(\w{3})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!match) return null;
  const month = months.indexOf(match[1].toLowerCase()) + 1;
  return month ? `${match[3]}-${String(month).padStart(2, "0")}-${match[2]}` : null;
}

export function clockOffset(clock) {
  const match = /^([+-]?)(\d{2}):(\d{2})(?::\d{2})?$/.exec(clock["gmt-offset"]);
  if (!match) throw new Error("Offset jam MikroTik tidak terbaca");
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60000;
}

export function routerDate(iso, clock) {
  if (clock.date === isoDate(clock.date)) return iso;
  const [year, month, day] = iso.split("-");
  return `${months[Number(month) - 1]}/${day}/${year}`;
}
