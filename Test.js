module.exports = async function () {
  try {
    const input = await Pasteboard.paste();
    if (!input) {
      console.log("❌ ไม่มีข้อมูลในคลิปบอร์ด");
      Script.setShortcutOutput("❌ ไม่พบข้อมูลในคลิปบอร์ด");
      return;
    }

    console.log("📋 ข้อมูลจากคลิปบอร์ด:", input);
    const lines = input.split("\n").map(l => l.trim()).filter(Boolean);

    // ✅ 1. Extract Header
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

    // ✅ 2. Split blocks by date
    const blocks = splitTripBlocks(lines);
    console.log("📦 Block count:", blocks.length);
    console.log("🧾 Header:", { orderID, name, wa });
    console.log("🧩 Block 1:", blocks[0]);

    const trips = [];
    const routeLibrary = [
      { pattern: "bangkok - huahin - bangkok", trip_type: "Full day" },
      { pattern: "bangkok - pattaya - bangkok", trip_type: "Full day" },
      { pattern: "bangkok - khao yai - bangkok", trip_type: "Full day" },
      { pattern: "airport dmk to hotel", trip_type: "Drop only" },
      { pattern: "hotel to airport dmk", trip_type: "Drop only" },
      { pattern: "airport bkk to hotel pattaya", trip_type: "Drop only" },
      { pattern: "hotel pattaya drop hotel bangkok", trip_type: "Drop only" },
      { pattern: "hotel to airport bkk suvarn", trip_type: "Drop only" }
    ];

    for (let block of blocks) {
      let trip = {
        Order_ID: orderID,
        Name: name,
        Whatsapp: wa,
        Date: "", Route: "", Flight: "", Time: "", People: "", Car_Type: "",
        Trip_Type: "", Note: "", Pickup_Hotel: { name: "", map: "" }, Drop_Hotel: { name: "", map: "" }, Extra: []
      };
      let used = [];

      for (let i = 0; i < block.length; i++) {
        let line = block[i], l = line.toLowerCase();
        let next = block[i + 1] || "", next2 = block[i + 2] || "";

        if (headerUsed.includes(line)) continue;

        if (line.includes("🗓") || /^\d{1,2} [a-zA-Z]+/.test(line) || /^\d{1,2}[\/\-]\d{1,2}[\/\-]/.test(line)) {
          trip.Date = line.replace("🗓", "").trim();
          used.push(line);
        } else if (/flight/i.test(l)) {
          trip.Flight = line.split(":").pop().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
          used.push(line);
        } else if (/(time|arrival|landing|start)/.test(l) && /\d{1,2}[:.]\d{2}/.test(l)) {
          const match = l.match(/(\d{1,2}[:.]\d{2}( ?[ap]m|น\.)?)/);
          if (match) {
            trip.Time = to24Hour(match[1]);
            used.push(line);
          }
        } else if (/people|pax|adults|kids|children/i.test(l)) {
          trip.People = line.replace(/^(people|pax)\s*[:\-]?\s*/i, "").trim();
          used.push(line);
        } else if (/(van|suv|sedan|minibus|vip van)/i.test(l)) {
          let carMatch = line.match(/[\d\s]*(vip van|van|suv|sedan|minibus)/gi);
          if (carMatch) trip.Car_Type = carMatch.map(c => c.trim()).join(" + ");
          used.push(line);
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

    console.log("✅ รายการ Trip ทั้งหมด:");
    console.log(JSON.stringify(trips, null, 2));
    Script.setShortcutOutput(JSON.stringify(trips));
  } catch (err) {
    console.error("❌ ข้อผิดพลาด:", err);
    Script.setShortcutOutput("❌ ERROR: " + err.message);
  }
};

// ===== Helper Functions =====

function splitTripBlocks(lines) {
  const blocks = [];
  let current = [], dateCount = 0;
  const monthWords = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec",
                      "january","february","march","april","june","july","august","september","october","november","december"];
  function isDate(line) {
    const l = line.toLowerCase();
    return l.startsWith("🗓") || /^\d{1,2} [a-z]+( \d{4})?$/i.test(l) || /^\d{1,2}[\/\-]\d{1,2}[\/\-](\d{2,4})$/.test(l) || monthWords.some(m => l.includes(m));
  }
  for (let line of lines) {
    if (isDate(line)) {
      dateCount++;
      if (dateCount >= 2 && current.length) {
        blocks.push(current);
        current = [];
      }
    }
    current.push(line);
  }
  if (current.length) blocks.push(current);
  return blocks;
}

function to24Hour(t) {
  const m = t.match(/(\d{1,2})[.:](\d{2})\s*(am|pm|น\.|an)?/i);
  if (!m) return t;
  let h = parseInt(m[1]), min = m[2], s = (m[3] || "").toLowerCase();
  if (s === "pm" && h < 12) h += 12;
  if ((s === "am" || s === "an") && h === 12) h = 0;
  return `${h.toString().padStart(2, "0")}:${min}`;
}

function fallbackPeople(prev) {
  if (!prev) return "";
  return prev.replace(/\s*\+.*$/, "").trim();
}

function isPickupKey(line) {
  return /^(pick up hotel|hotel pick up|pickup hotel|hotel pick|pickup at|pick:|location pick|name pick)/i.test(line.split(":")[0]);
}

function isDropKey(line) {
  return /^(drop hotel|hotel drop|to hotel|destination|drop at|drop:|location drop|name drop)/i.test(line.split(":")[0]);
}

function matchRoute(rawRoute, routeLibrary) {
  const known = ["full day", "drop only", "city tour"];
  let lower = rawRoute.toLowerCase();
  let matchedType = known.find(k => lower.includes(k)) || "";
  for (let r of routeLibrary) {
    if (lower.includes(r.pattern)) return {
      route: rawRoute,
      trip_type: r.trip_type || matchedType
    };
  }
  return { route: rawRoute, trip_type: matchedType };
}

function resolveFallbackHotel(lines, trip, usedLines) {
  const mapRegex = /^https?:\/\//i;
  let unresolved = lines.filter(l => !usedLines.includes(l));
  let pending = null;
  for (let i = 0; i < unresolved.length; i++) {
    let line = unresolved[i];
    if (mapRegex.test(line) && !pending) continue;
    if (!mapRegex.test(line) && !pending) {
      pending = line;
      continue;
    }
    if (pending && mapRegex.test(line)) {
      const pickupEmpty = !trip.Pickup_Hotel.name && !trip.Pickup_Hotel.map;
      const dropEmpty = !trip.Drop_Hotel.name && !trip.Drop_Hotel.map;
      if (pickupEmpty) {
        trip.Pickup_Hotel.name = pending;
        trip.Pickup_Hotel.map = line;
        usedLines.push(pending, line);
      } else if (dropEmpty) {
        trip.Drop_Hotel.name = pending;
        trip.Drop_Hotel.map = line;
        usedLines.push(pending, line);
      }
      pending = null;
    }
  }
}


console.log("✅ Output JSON:");
console.log(JSON.stringify(trips, null, 2));

// 🔻 เพิ่มบรรทัดนี้ 🔻
Script.setShortcutOutput(JSON.stringify(trips));
