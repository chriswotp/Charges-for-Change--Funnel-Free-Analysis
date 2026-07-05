/**
 * Test runner for create-envelope.mjs
 *
 * Tests buildTabs() logic offline (no DocuSign creds needed), then optionally
 * fires a live call if DOCUSIGN_RSA_PRIVATE_KEY is present in the environment.
 *
 * Run: node test/test-create-envelope.mjs
 */

import { buildTabs } from "../netlify/functions/create-envelope.mjs";

// ─── Sample payload ───────────────────────────────────────────────────────────
const SAMPLE_FIELDS = {
  SalesRepName:          "Jane Smith",
  DBAName:               "Acme Coffee",
  LegalName:             "Acme Coffee LLC",
  EntityType:            "LLC",
  MerchandiseType:       "Coffee & Beverages",
  BusinessAddress:       "123 Main St",
  BusinessCity:          "Austin",
  BusinessState:         "TX",
  BusinessZip:           "78701",
  BusinessPhone:         "5125551234",
  BusinessEmail:         "owner@acmecoffee.com",
  DateBusinessStarted:   "2018-03-15",
  FederalTaxID:          "12-3456789",
  OwnerFirstName:        "John",
  OwnerMI:               "A",
  OwnerLastName:         "Doe",
  OwnershipPercent:      "100",
  OwnerTitle:            "Owner",
  OwnerPhone:            "5125559876",
  OwnerAddress:          "456 Oak Ave",
  OwnerCity:             "Austin",
  OwnerState:            "TX",
  OwnerZip:              "78702",
  BankName:              "Chase Bank",
  GrossYearlySales:      "250000",
  YearlyMCVisaVolume:    "200000",
  YearlyDiscoverVolume:  "25000",
  AmexYearlyVolume:      "25000",
  AvgMCVisaTicket:       "35",
  HighestTicket:         "500",
  EquipmentDevice:       "Clover Mini",
  EquipmentQuantity:     "2",
  MonthlyLeaseAmount:    "49.99",
  TotalLeaseAmount:      "1799.64",
  LeaseTerm:             "36",
  MonthlyStatementFee:   "9.95",
  // PII — must be stripped before building tabs
  OwnerSSN:              "123-45-6789",
  OwnerDOB:              "1980-01-01",
  OwnerDriversLicense:   "TX12345678",
  BankRouting:           "021000021",
  BankAccount:           "9876543210",
};

const PII_KEYS = ["OwnerSSN", "OwnerDOB", "OwnerDriversLicense", "BankRouting", "BankAccount"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, label, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ─── Strip PII before calling buildTabs (mirrors function logic) ───────────────
const stripped = Object.fromEntries(
  Object.entries(SAMPLE_FIELDS).filter(([k]) => !PII_KEYS.includes(k))
);

console.log("\n── Tab generation tests ─────────────────────────────────────────\n");

const { textTabs, checkboxTabs } = buildTabs(stripped);

// 1. textTab count — 68 from map + 1 constant = 69 for a fully-populated payload
assert(
  textTabs.length >= 69,
  `textTabs count ≥ 69 (got ${textTabs.length})`,
);

// 2. checkboxTab count
assert(
  checkboxTabs.length === 2,
  `checkboxTabs count === 2 (got ${checkboxTabs.length})`,
);

// 3. No PII in textTabs values
const allTextValues = textTabs.map((t) => t.value).join("|");
for (const key of PII_KEYS) {
  const piiValue = SAMPLE_FIELDS[key];
  assert(
    !allTextValues.includes(piiValue),
    `PII key "${key}" value not present in textTab values`,
  );
}

// 4. No PII in textTabs labels
const allTextLabels = textTabs.map((t) => t.tabLabel).join("|");
for (const key of PII_KEYS) {
  assert(
    !allTextLabels.includes(key),
    `PII key "${key}" not present in textTab labels`,
  );
}

// 5. EntityType LLC → LLC checkbox on page 8
const p8Checkbox = checkboxTabs.find(
  (c) => c.tabLabel === "LLC 71c49731-31f9-4132-aeea-a172adfa6d47"
);
assert(!!p8Checkbox && p8Checkbox.selected === "true", "LLC page-8 checkbox selected");

// 6. EntityType LLC → Corp checkbox on page 1
const p1Checkbox = checkboxTabs.find(
  (c) => c.tabLabel === "Corp c626a0f0-6ad6-425d-b56b-66b9ce480810"
);
assert(!!p1Checkbox && p1Checkbox.selected === "true", "Corp (LLC) page-1 checkbox selected");

// 7. Constant tab injected
const countryTab = textTabs.find(
  (t) => t.tabLabel === "FiServ Country c4042919-bf2c-4aaf-936f-21f7ea8f5043"
);
assert(
  !!countryTab && countryTab.value === "United States",
  "Constant country tab injected as 'United States'",
);

// 8. Multi-label broadcast (LegalName → 4 tabs)
const legalNameTabs = textTabs.filter((t) => t.value === "Acme Coffee LLC");
assert(
  legalNameTabs.length >= 4,
  `LegalName broadcast to ≥ 4 tabs (got ${legalNameTabs.length})`,
);

// 9. SalesRepName present
const salesRepTab = textTabs.find((t) => t.value === "Jane Smith");
assert(!!salesRepTab, "SalesRepName present in textTabs");

// ─── Live DocuSign call (skipped if no key) ───────────────────────────────────
console.log("\n── Live DocuSign call ───────────────────────────────────────────\n");

if (!process.env.DOCUSIGN_RSA_PRIVATE_KEY) {
  console.log("  ⚠  DOCUSIGN_RSA_PRIVATE_KEY not set — skipping live call\n");
} else {
  try {
    const { handler } = await import("../netlify/functions/create-envelope.mjs");
    const fakeEvent = {
      httpMethod: "POST",
      body: JSON.stringify({
        sales_rep_email: "salesrep@example.com",
        email:           "merchant@example.com",
        docusign_fields: SAMPLE_FIELDS,
      }),
    };

    const result = await handler(fakeEvent);
    const resBody = JSON.parse(result.body);

    assert(result.statusCode === 200, `Live call status 200 (got ${result.statusCode})`);
    assert(!!resBody.envelopeId, `Live call returned envelopeId: ${resBody.envelopeId}`);

    if (result.statusCode !== 200) {
      console.error("  DocuSign error detail:", resBody);
    }
  } catch (err) {
    console.error("  ✗ Live call threw:", err.message);
    failed++;
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n── Results: ${passed} passed, ${failed} failed ─────────────────────────\n`);
if (failed > 0) process.exit(1);
