import { buildEmail, getFromEmail, renderTemplate } from "../lib/email.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("PASS", name); }
  else { fail++; console.log("FAIL", name); }
}

// 1. default sender when FROM_EMAIL unset
delete process.env.FROM_EMAIL;
check("default sender = sales@scapiab2b.com", getFromEmail() === "sales@scapiab2b.com");

// 2. custom sender when FROM_EMAIL set
process.env.FROM_EMAIL = "custom@scapiab2b.com";
check("custom sender honoured", getFromEmail() === "custom@scapiab2b.com");

const lead = { company: "Acme Realty", website: "https://acme.com", location: "Austin", email: "a@acme.com", region: "us" };

// 3. fallback when no templates configured
delete process.env.EMAIL_SUBJECT; delete process.env.EMAIL_BODY_TEMPLATE;
let m = buildEmail(lead);
check("fallback sender used", m.from === "custom@scapiab2b.com");
check("fallback subject mentions company", m.subject.includes("Acme Realty"));
check("fallback html has unsubscribe link", m.html.includes("Unsubscribe"));

// 4. custom subject + body templates with placeholder substitution
process.env.EMAIL_SUBJECT = "Hello {{company}} in {{location}}";
process.env.EMAIL_BODY_TEMPLATE = "<p>Hi {{company}}, contact {{email}}</p>";
m = buildEmail(lead);
check("custom subject substituted", m.subject === "Hello Acme Realty in Austin");
check("custom body substituted", m.html === "<p>Hi Acme Realty, contact a@acme.com</p>");

// 5. unknown placeholder -> empty string
check("unknown placeholder empties", renderTemplate("x{{nope}}y", lead) === "xy");

console.log(`\nEMAIL TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
