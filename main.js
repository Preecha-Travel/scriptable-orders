// main.js
const {
  splitTripBlocks,
  to24Hour,
  fallbackPeople,
  isPickupKey,
  isDropKey,
  matchRoute,
  resolveFallbackHotel
} = importModule("functions");

// รับข้อความจาก Clipboard
let input = (args.plainTexts?.join("\n") || await Pasteboard.paste() || "").trim();
if (!input) return Script.setShortcutOutput("❌ ไม่มีข้อมูลส่งเข้ามา");

console.log("📋 Input from Clipboard:\n" + input);

let lines = input.split("\n").map(l => l.trim()).filter(Boolean);

// ------------------------ HEADER --------------------------
let orderID = "", name = "", wa = "", headerUsed = [];

for (let i = 0; i < Math.min(lines.length, 10); i++) {
  let line = lines[i];
  if (/^\d{1,4}$/.test(line)) { orderID = line; headerUsed.push(line); }
  if (/name\s*[:\-]/i.test(line)) { name = line.split(":")[1]?.trim(); headerUsed.push(line); }
  if (/wa|whatsapp/i.test(line)) {
    wa = line.split(":")[1]?.replace(/[^\d+]/g, "");
    headerUsed.push(line);
  }
}
console.log("🧾 Header:", { orderID, name, wa });

const bannedPhrases = ["new order confirmed", "additional order", "add order", "number", "confirmed", "✅", "🅰"];
for (let line of lines) {
  const lower = line.toLowerCase();
  for (let phrase of bannedPhrases) {
    if (lower.startsWith(phrase) || lower.includes(phrase)) {
      if (!headerUsed.includes(line)) headerUsed.push(line);
      break;
    }
  }
}

// ------------------------ SPLIT BLOCK --------------------------
let blocks = splitTripBlocks(lines);
console.log(📦 พบทั้งหมด ${blocks.length} blocks);

let trips = [];
const routeLibrary = [
  { pattern: "bangkok - pattaya", trip_type: "Full day" },
  { pattern: "airport dmk to hotel", trip_type: "Drop only" },
  { pattern: "city tour", trip_type: "City Tour" },
  // เพิ่ม pattern จริงของคุณ
];

for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
  const block = blocks[blockIndex];
  console.log(🧩 Block ${blockIndex + 1}:\n + block.join("\n"));

  let trip = {
    Order_ID: orderID, Name: name, Whatsapp: wa,
    Date: "", Route: "", Flight: "", Time: "", People: "", Car_Type: "",
    Trip_Type: "", Note: "", Pickup_Hotel: { name: "", map: "" }, Drop_Hotel: { name: "", map: "" }, Extra: []
  };
  let used = [];

  for (let i = 0; i < block.length; i++) {
    let line = block[i], l = line.toLowerCase();
    let next = block[i + 1] || "", next2 = block[i + 2] || "";
    if (headerUsed.includes(line)) continue;

    if (line.includes("🗓") || /^\d{1,2} [a-zA-Z]+/.test(line)) {
      trip.Date = line.replace("🗓", "").trim(); used.push(line);
    } else if (/flight/i.test(l)) {
      trip.Flight = line.split(":").pop().replace(/[^a-zA-Z0-9]/g, "").toUpperCase(); used.push(line);
    } else if (/(time|arrival|landing|start)/.test(l) && /\d{1,2}[:.]\d{2}/.test(l)) {
      const match = l.match(/(\d{1,2}[:.]\d{2}( ?[ap]m|น\.)?)/); if (match) {
        trip.Time = to24Hour(match[1]); used.push(line);
      }
    } else if (/people|pax|adults|kids|children/i.test(l)) {
      trip.People = line.replace(/^(people|pax)\s*[:\-]?\s*/i, "").trim(); used.push(line);
    } else if (/(van|suv|sedan|minibus|vip van)/i.test(l)) {
      let carMatch = line.match(/[\d\s]*(vip van|van|suv|sedan|minibus)/gi);
      if (carMatch) trip.Car_Type = carMatch.map(c => c.trim()).join(" + "); used.push(line);
    } else if (isPickupKey(l)) {
      let nameInline = line.split(":")[1]?.trim();
      let name = (!/^https?:\/\//i.test(nameInline) ? nameInline : next)?.trim();
      let map = (/^https?:\/\//i.test(next) ? next : next2)?.trim();
      if (name && !/^https?:\/\//i.test(name)) trip.Pickup_Hotel.name = name;
      if (/^https?:\/\//i.test(map)) trip.Pickup_Hotel.map = map;
      used.push(line, name, map);
    } else if (isDropKey(l)) {
      let nameInline = line.split(":")[1]?.trim();
      let name = (!/^https?:\/\//i.test(nameInline) ? nameInline : next)?.trim();
      let map = (/^https?:\/\//i.test(next) ? next : next2)?.trim();
      if (name && !/^https?:\/\//i.test(name)) trip.Drop_Hotel.name = name;
      if (/^https?:\/\//i.test(map)) trip.Drop_Hotel.map = map;
      used.push(line, name, map);
    } else if (!trip.Route && /( to |➝|–|-)/i.test(line)) {
      let raw = line.replace(/\*/g, "").trim();
      let match = matchRoute(raw, routeLibrary);
      trip.Route = match.route;
      trip.Trip_Type = match.trip_type;
      used.push(line);
    }
  }

  if (!trip.People && trips.length > 0) {
    let prev = trips[trips.length - 1].People;
    if (prev) trip.People = fallbackPeople(prev);
  }

  resolveFallbackHotel(block, trip, used);

  for (let line of block) {
    if (used.includes(line) || headerUsed.includes(line)) continue;
    if (/cash|baby|wheelchair|stroller|choose|request|guide/i.test(line)) {
      trip.Note += (trip.Note ? " / " : "") + line;
    } else {
      trip.Extra.push(line);
    }
  }

  trips.push(trip);
}

console.log("✅ Output JSON:");
console.log(JSON.stringify(trips, null, 2));

Script.setShortcutOutput(JSON.stringify(trips));
