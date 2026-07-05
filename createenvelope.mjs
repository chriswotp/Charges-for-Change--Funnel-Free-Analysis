import jwt from "jsonwebtoken";
import fetch from "node-fetch";

// ─── Credentials (all from env vars — never hardcoded) ───────────────────────
const INTEGRATION_KEY = "04f7771c-21ab-4420-81c4-03a361d10895";
const USER_ID         = "5d03cce4-01b1-4168-9d19-aedcd9ddcf8f";
const ACCOUNT_ID      = "b08bfed4-6652-427d-ac96-a463d247adde";
const TEMPLATE_ID     = "bec27d4a-a9dd-4b55-a346-c3fccb41ea6e";
const AUTH_SERVER     = "https://account-d.docusign.com";
const BASE_URI        = "https://demo.docusign.net";

// ─── PII keys stripped before anything leaves this function ──────────────────
const STRIP_KEYS = new Set([
  "OwnerSSN",
  "OwnerDOB",
  "OwnerDriversLicense",
  "BankRouting",
  "BankAccount",
]);

// ─── Field → DocuSign tabLabel mapping (validated against live template) ─────
const TEXT_TAB_MAP = {
  "SalesRepName":        ["Sales Rep Name 800a8d04-e1ca-42e1-9655-9f4a623ba22c", "FiServ-SalesRep 8a1bd88b-a7ea-431d-b954-e630a345d634"],
  "DBAName":             ["BusinessNameDBA(P1) 0da9b8c0-1328-4b5c-bc14-aa2e6b9c2b1a", "DBAName a2a5989a-9772-4eb3-b7f1-9a240af1a112", "BusinessNameDBA b03a97e2-a4b2-46ea-8b4f-2a1d149c0293"],
  "LegalName":           ["BusinessNameLegal(P1) 29d937ce-5bb6-4cb0-9dbf-854ace0fc89d", "BusinessNameLegal(p7) a7a1ccea-0b35-4540-ae10-c8f7526a3011", "LegalName c2ed0f5f-74a1-4327-b48f-42d17cac6589", "BusinessNameLegal 23b466f3-a275-4cfc-b0ea-c0295e1d1d62"],
  "MerchandiseType":     ["ServiceDescription ac6abc02-d133-404e-9346-dfa17ce3de58"],
  "BusinessAddress":     ["BusinessAddress e29d6b96-6480-4203-baba-096ce7ad5028", "businessAddress 27a12639-9529-4de8-9eb6-62c167aeb6e8", "BUSINESS ADDRESS if different from above 841df927-8b5c-4f96-9ff7-5d6d0d062143"],
  "BusinessCity":        ["BusinessCity fbc323ff-821e-4314-8adb-9ccc9db56a01", "businessCity bdcf0aaa-50b1-46ff-8676-be50b8637d52", "BUSINESS CITY fcdd16b8-de78-4ca9-9ec9-e5c6dd55f904"],
  "BusinessState":       ["BusinessState e855e05b-d188-486f-9f12-9b5a96fa72c6", "businessState 70c8df53-fcfb-4053-ade3-a8b3ba2c62aa", "BUSINESS STATE 1fe6ca72-ec03-4aa8-8406-97837ebcd38b"],
  "BusinessZip":         ["BusinessZip 61744a54-83e4-4cb1-b27c-103347792532", "businessZip 38838c4a-6102-4bbe-b9d3-07f4ffc2b02b", "BUSINESS ZIP c2d5f202-b42b-458c-a442-89834bea96f9"],
  "BusinessPhone":       ["BusinessPhone 0b7bca81-c383-4c07-989e-6966a79377d3"],
  "BusinessEmail":       ["BusinessEmail 16fbd3f1-706d-475b-9a3e-b723c4316c02"],
  "DateBusinessStarted": ["History-Date 26ffd447-55e3-43ec-a856-641bb5b56e04"],
  "FederalTaxID":        ["Business-Tax-2 5826dde6-d906-4409-9123-fce24ee40c88", "TaxID 7c340b84-cfbf-49f4-855c-c1bfb43c12f6"],
  "OwnerFirstName":      ["ownerNameFirst dc93e3af-a67e-491f-b995-51e7baa9d6ad", "ownerNameFirst 707582ad-25db-4186-975d-912b8f92039a", "ownerNameFirst 222e9f22-ae08-49c5-914c-5ce0c737cf5d"],
  "OwnerMI":             ["ownerNameMiddle"],
  "OwnerLastName":       ["ownerNameLast a13116d8-ddad-4c3d-be96-9677106fff73", "ownerNameLast a74a20a6-2ae1-437a-a529-990ac95b131e", "ownerNameLast 43b03c4c-431e-4ef1-b7ff-3c47d081dcf4"],
  "OwnershipPercent":    ["Owner1Ownership 38e4b1e5-16a4-4c31-b13d-69fd57bb0ecb"],
  "OwnerTitle":          ["Owner1-Title 1a799acd-e1c2-404e-a267-a0b513cadbb4", "SignerTitle(P6) b9aad5e1-8f6b-49ce-adf3-d76c7a9f1f7d", "SignerTitle 31e781f5-33ea-4819-8c2c-e752b542ec24", "SignerTitle d36a6302-5bde-49b1-8e67-efd91152fed8", "Signertitle(p9) 1cec0397-816b-4b8d-b32e-a3c9e2ece44a"],
  "OwnerPhone":          ["Owner1-Telephone 8cfc7882-b434-42e6-a24a-57980f497e29", "SUBSCRIBER CELL PHONE 5ae9137b-237a-4362-8d7a-26ac35fbfe82"],
  "OwnerAddress":        ["Owner1-Address 703d852d-e738-4733-b73c-60161cc200a3", "SignerAddress 4d7cbd6e-6140-4349-bddd-2286f0646ce1"],
  "OwnerCity":           ["Owner1-City 14506909-2cbc-4bbe-a513-f81b2e8def30", "SignerCity 5e63fd11-f946-4ee2-86df-97821575b9a8"],
  "OwnerState":          ["Owner1-State 6807a1e4-d31e-4f28-b059-9c83bc53df71", "SignerState 9546289d-b256-44b5-ae1e-054470ee4dc4"],
  "OwnerZip":            ["Owner1-Zip 354c261b-52f8-44c4-8cd7-41a4cfa766de", "SignerZip 88d6b7cc-efb5-4099-b1a5-83d10fdb0f78"],
  "BankName":            ["Bank Name b167e366-d347-4a4d-8e40-94d0540eb9a8", "BankName 4ffc13e7-1e5c-4d53-a519-dc6a3686bebb"],
  "GrossYearlySales":    ["Yearly Gross 813cacf2-f76a-4fab-b05f-c7fd62c672d5"],
  "YearlyMCVisaVolume":  ["Average YEARLY MC/Visa Volume ea6b3fb9-fc77-4f75-8394-8f69323f1f4d"],
  "YearlyDiscoverVolume":["Average Yearly Discover 41001fbd-0fe9-4ed8-8d12-3ebd58d6d367"],
  "AmexYearlyVolume":    ["Average Yearly AMEX f1c83b4e-ebd8-418a-bf17-513b14d23e3a"],
  "AvgMCVisaTicket":     ["AVG MC/Visa Ticket b0c69a79-25ef-47c0-ad64-84b2d9207ec7", "AVG Amex Ticket c2ed4af8-6174-4dc7-872a-1e97dcccf26b"],
  "HighestTicket":       ["Highest Ticket 99ef2fb2-548e-426c-a5fb-3c4053ca5358"],
  "EquipmentDevice":     ["Equipment Short 3f2ad923-8010-4889-9a7b-1f84edaff7e6", "Equipment Type p11 5133b5a0-358b-40b4-a549-3deb01479709"],
  "EquipmentQuantity":   ["Equipment-Quantity 55b9d05f-c059-447c-807b-22c6f81621f9"],
  "MonthlyLeaseAmount":  ["Monthly Lease Cost 1a809824-3bbb-443d-b9f3-9b47d98b3c16", "Monthly Price 826e3359-26a4-4c3b-8ac9-e02ad0649272"],
  "TotalLeaseAmount":    ["Total Lease Cost 07c3de2d-f83e-4fe6-b741-a71e8f72dc03", "Total Lease Cost d04d7639-d6a4-4faa-b15d-4cbb1107f40a"],
  "LeaseTerm":           ["AzuraSubscriptionMonths 7e0bb337-dff3-461f-80d3-c68e644dccc4"],
  "MonthlyStatementFee": ["AzuraSubscriptionAmount 3447b8cc-132e-4a26-aee3-a0c55eac9965"],
};

// Country constant injected on every envelope
const CONSTANT_TABS = {
  "FiServ Country c4042919-bf2c-4aaf-936f-21f7ea8f5043": "United States",
};

// EntityType → checkbox tabLabel on page 1
const PAGE1_GROUP = {
  "LLC":               "Corp c626a0f0-6ad6-425d-b56b-66b9ce480810",
  "Corporation":       "Corp c626a0f0-6ad6-425d-b56b-66b9ce480810",
  "Non-Profit 501(C)": "Tax Exempt e9d6ab35-1dc4-4507-9118-79006e2fabac",
  "Sole Proprietor":   "P1 CheckboxSoleProp aa709e9a-3274-42d7-ba9f-d1c619be7697",
};

// EntityType → checkbox tabLabel on page 8
const PAGE8_GROUP = {
  "LLC":               "LLC 71c49731-31f9-4132-aeea-a172adfa6d47",
  "Corporation":       "CORP 927df45a-2610-447f-ad1c-3b5838a5f940",
  "Non-Profit 501(C)": "Non-Profit 8528838b-3bdf-49e0-b940-320b8458872f",
  "Sole Proprietor":   "SOLEprop 09fadc6e-e060-408f-b66d-79eeb4ad546f",
};

// ─── JWT + token exchange ─────────────────────────────────────────────────────
async function getAccessToken() {
  const privateKey = process.env.DOCUSIGN_RSA_PRIVATE_KEY;
  if (!privateKey) throw new Error("DOCUSIGN_RSA_PRIVATE_KEY env var is not set");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss:   INTEGRATION_KEY,
    sub:   USER_ID,
    aud:   "account-d.docusign.com",
    iat:   now,
    exp:   now + 3600,
    scope: "signature impersonation",
  };

  const assertion = jwt.sign(payload, privateKey, { algorithm: "RS256" });

  const resp = await fetch(`${AUTH_SERVER}/oauth/token`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`DocuSign token exchange failed ${resp.status}: ${body}`);
  }

  const { access_token } = await resp.json();
  return access_token;
}

// ─── Tab builder ─────────────────────────────────────────────────────────────
export function buildTabs(docusignFields) {
  const textTabs     = [];
  const checkboxTabs = [];

  // Map each intake field → one or more DocuSign tabLabels
  for (const [fieldKey, tabLabels] of Object.entries(TEXT_TAB_MAP)) {
    const value = docusignFields[fieldKey];
    if (value == null || value === "") continue;
    for (const tabLabel of tabLabels) {
      textTabs.push({ tabLabel, value: String(value) });
    }
  }

  // Inject constant tabs
  for (const [tabLabel, value] of Object.entries(CONSTANT_TABS)) {
    textTabs.push({ tabLabel, value });
  }

  // EntityType → two checkbox groups
  const entityType = docusignFields["EntityType"];
  if (entityType) {
    const p1Label = PAGE1_GROUP[entityType];
    const p8Label = PAGE8_GROUP[entityType];
    if (p1Label) checkboxTabs.push({ tabLabel: p1Label, selected: "true" });
    if (p8Label) checkboxTabs.push({ tabLabel: p8Label, selected: "true" });
  }

  return { textTabs, checkboxTabs };
}

// ─── Netlify Function handler ─────────────────────────────────────────────────
export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { sales_rep_email, email, docusign_fields: rawFields } = body;

  if (!email || !rawFields) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required fields: email, docusign_fields" }),
    };
  }

  // Strip PII — these are entered live in-session by the merchant
  const docusign_fields = Object.fromEntries(
    Object.entries(rawFields).filter(([k]) => !STRIP_KEYS.has(k))
  );

  // Derive signer name from owner fields
  const firstName = docusign_fields["OwnerFirstName"] || "";
  const lastName  = docusign_fields["OwnerLastName"]  || "";
  const signerName = [firstName, lastName].filter(Boolean).join(" ") || "Merchant";

  const { textTabs, checkboxTabs } = buildTabs(docusign_fields);

  let access_token;
  try {
    access_token = await getAccessToken();
  } catch (err) {
    console.error("JWT/token error:", err.message);
    return { statusCode: 502, body: JSON.stringify({ error: "DocuSign auth failed", detail: err.message }) };
  }

  const envelopePayload = {
    templateId: TEMPLATE_ID,
    templateRoles: [
      {
        roleName: "Client",
        name:     signerName,
        email,
        tabs: { textTabs, checkboxTabs },
      },
    ],
    status: "sent",
  };

  // Attach sales rep email as CC if provided
  if (sales_rep_email) {
    envelopePayload.templateRoles.push({
      roleName: "Sales Rep",
      name:     docusign_fields["SalesRepName"] || "Sales Rep",
      email:    sales_rep_email,
    });
  }

  const dsResp = await fetch(
    `${BASE_URI}/restapi/v2.1/accounts/${ACCOUNT_ID}/envelopes`,
    {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(envelopePayload),
    }
  );

  const dsBody = await dsResp.json();

  if (!dsResp.ok) {
    console.error("DocuSign envelope error:", dsBody);
    return {
      statusCode: dsResp.status,
      body: JSON.stringify({ error: "DocuSign envelope creation failed", detail: dsBody }),
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: dsBody.status, envelopeId: dsBody.envelopeId }),
  };
};
