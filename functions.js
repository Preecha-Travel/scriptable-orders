// functions.js

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
  return ${h.toString().padStart(2, "0")}:${min};
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

// 👉 Export ทุกฟังก์ชัน
module.exports = {
  splitTripBlocks,
  to24Hour,
  fallbackPeople,
  isPickupKey,
  isDropKey,
  matchRoute,
  resolveFallbackHotel
};
