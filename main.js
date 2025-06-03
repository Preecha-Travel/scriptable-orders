// main.js - Scriptable
// แยกข้อมูลจาก Clipboard แล้วส่งออก JSON

let input = args.plainTexts?.join("\n") || await Pasteboard.paste();
let lines = input.split("\n").map(l => l.trim()).filter(l => l !== "");

// หาค่า Order ID จากบรรทัดที่มีคำว่า order
let orderID = lines.find(line => /order/i.test(line))?.match(/\d+/)?.[0] || "N/A";

// ส่งออกข้อมูลแบบ JSON
let result = {
  ID: orderID,
  Raw_Text: lines.join(" | "),
  Total_Lines: lines.length
};

Script.setShortcutOutput(JSON.stringify(result));
