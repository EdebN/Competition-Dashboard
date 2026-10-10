const SERVICE_NAME = "competition-community-api";
const API_VERSION = 1;

const TEAM_SETTINGS_TAB = "Team Settings";
const TEAM_EDITOR_PINS_TAB = "Team Editor PINs";
const TEAM_EDITOR_PIN_HEADERS = ["Team ID", "PIN", "Updated At"];
const TEAM_IDS = ["A", "B", "C", "D", "E"];
const TEAM_SETTINGS_HEADERS = [
  "Team ID",
  "Display Name",
  "Primary Color",
  "Secondary Color",
  "Logo URL",
  "Updated At"
];

/**
 * Public GET endpoints:
 *   /exec?action=health
 *   /exec?action=getTeamSettings
 *
 * Add ?callback=someFunction for JSONP reads from GitHub Pages.
 * Do not return credentials or private spreadsheet content.
 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = String(params.action || "health").trim();
  const callback = String(params.callback || "").trim();

  let result;

  try {
    if (action === "health") {
      const properties = PropertiesService.getScriptProperties();
      result = {
        ok: true,
        service: SERVICE_NAME,
        apiVersion: API_VERSION,
        configured: Boolean(
          properties.getProperty("SPREADSHEET_ID") &&
          properties.getProperty("ADMIN_TOKEN")
        ),
        actions: ["health", "getTeamSettings"]
      };
    } else if (action === "getTeamSettings") {
      result = {
        ok: true,
        service: SERVICE_NAME,
        apiVersion: API_VERSION,
        action: action,
        teams: readTeamSettings_()
      };
    } else {
      result = {
        ok: false,
        service: SERVICE_NAME,
        apiVersion: API_VERSION,
        error: "Unknown action"
      };
    }
  } catch (error) {
    console.error(error);
    result = {
      ok: false,
      service: SERVICE_NAME,
      apiVersion: API_VERSION,
      error: "Request failed. Check Apps Script configuration and execution logs."
    };
  }

  return respond_(result, callback);
}

/**
 * The only write operation is updateTeamSettings.
 * It cannot write to fixtures, scores, or any other sheet.
 *
 * Send JSON as the POST body. For browser no-cors requests, use
 * Content-Type: text/plain;charset=UTF-8, then read the saved settings
 * through the public GET endpoint to verify persistence.
 */
function doPost(e) {
  let body;

  try {
    body = JSON.parse(
      e && e.postData && e.postData.contents
        ? e.postData.contents
        : "{}"
    );
  } catch (error) {
    return jsonResponse_({
      ok: false,
      service: SERVICE_NAME,
      error: "Invalid JSON"
    });
  }

  if (body.action !== "updateTeamSettings") {
    return jsonResponse_({
      ok: false,
      service: SERVICE_NAME,
      error: "Operation not allowed"
    });
  }

  const expectedToken = PropertiesService
    .getScriptProperties()
    .getProperty("ADMIN_TOKEN");
  const suppliedToken = String(body.adminToken || "");

  if (!expectedToken || suppliedToken.length < 1 || suppliedToken !== expectedToken) {
    return jsonResponse_({
      ok: false,
      service: SERVICE_NAME,
      error: "Not authorised"
    });
  }

  let teams;
  try {
    teams = validateTeamSettings_(body.teams);
  } catch (error) {
    return jsonResponse_({
      ok: false,
      service: SERVICE_NAME,
      error: error.message || "Invalid team settings"
    });
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    return jsonResponse_({
      ok: false,
      service: SERVICE_NAME,
      error: "Service busy. Try again."
    });
  }

  try {
    const sheet = getTeamSettingsSheet_();
    const updatedAt = new Date();

    const rows = TEAM_IDS.map(function (teamId) {
      const team = teams[teamId];
      return [
        teamId,
        team.displayName,
        team.primaryColor,
        team.secondaryColor,
        team.logoUrl,
        updatedAt
      ];
    });

    // Store user-controlled fields as plain text, not spreadsheet formulas.
    sheet.getRange(2, 1, TEAM_IDS.length, 5).setNumberFormat("@");
    sheet.getRange(2, 6, TEAM_IDS.length, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
    sheet.getRange(2, 1, rows.length, TEAM_SETTINGS_HEADERS.length).setValues(rows);

    return jsonResponse_({
      ok: true,
      service: SERVICE_NAME,
      apiVersion: API_VERSION,
      action: "updateTeamSettings",
      saved: true,
      teams: readTeamSettings_()
    });
  } catch (error) {
    console.error(error);
    return jsonResponse_({
      ok: false,
      service: SERVICE_NAME,
      error: "Could not save team settings. Check Apps Script execution logs."
    });
  } finally {
    lock.releaseLock();
  }
}

function readTeamSettings_() {
  const sheet = getTeamSettingsSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, TEAM_SETTINGS_HEADERS.length).getValues()
    : [];

  const byId = {};

  rows.forEach(function (row) {
    const teamId = String(row[0] || "").trim();
    if (!TEAM_IDS.includes(teamId)) return;

    byId[teamId] = {
      teamId: teamId,
      displayName: String(row[1] || ("Team " + teamId)),
      primaryColor: String(row[2] || ""),
      secondaryColor: String(row[3] || ""),
      logoUrl: String(row[4] || ""),
      updatedAt: row[5] instanceof Date ? row[5].toISOString() : null
    };
  });

  return TEAM_IDS.map(function (teamId) {
    return byId[teamId] || {
      teamId: teamId,
      displayName: "Team " + teamId,
      primaryColor: "",
      secondaryColor: "",
      logoUrl: "",
      updatedAt: null
    };
  });
}

function getTeamSettingsSheet_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty("SPREADSHEET_ID");

  if (!spreadsheetId) {
    throw new Error("Missing SPREADSHEET_ID script property");
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(TEAM_SETTINGS_TAB);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(TEAM_SETTINGS_TAB);
  }

  if (sheet.getLastRow() === 0) {
    initialiseTeamSettingsSheet_(sheet);
    return sheet;
  }

  const header = sheet
    .getRange(1, 1, 1, TEAM_SETTINGS_HEADERS.length)
    .getDisplayValues()[0];

  const headerMatches = TEAM_SETTINGS_HEADERS.every(function (value, index) {
    return header[index] === value;
  });

  if (!headerMatches) {
    throw new Error(
      "The Team Settings tab exists but its headers do not match the API schema. No data was changed."
    );
  }

  if (sheet.getLastRow() < 2) {
    initialiseTeamSettingsRows_(sheet);
  }

  return sheet;
}

function initialiseTeamSettingsSheet_(sheet) {
  sheet.getRange(1, 1, 1, TEAM_SETTINGS_HEADERS.length)
    .setValues([TEAM_SETTINGS_HEADERS]);
  sheet.getRange(1, 1, 1, TEAM_SETTINGS_HEADERS.length).setFontWeight("bold");
  initialiseTeamSettingsRows_(sheet);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, TEAM_SETTINGS_HEADERS.length);
}

function initialiseTeamSettingsRows_(sheet) {
  const rows = TEAM_IDS.map(function (teamId) {
    return [teamId, "Team " + teamId, "", "", "", ""];
  });

  sheet.getRange(2, 1, rows.length, 5).setNumberFormat("@");
  sheet.getRange(2, 1, rows.length, TEAM_SETTINGS_HEADERS.length).setValues(rows);
}

function validateTeamSettings_(input) {
  if (!Array.isArray(input) || input.length !== TEAM_IDS.length) {
    throw new Error("Exactly five team settings are required.");
  }

  const byId = {};

  input.forEach(function (item) {
    if (!item || typeof item !== "object") {
      throw new Error("Each team setting must be an object.");
    }

    const teamId = String(item.teamId || "").trim().toUpperCase();

    if (!TEAM_IDS.includes(teamId) || byId[teamId]) {
      throw new Error("Team IDs must be A, B, C, D, and E exactly once.");
    }

    const displayName = String(item.displayName == null ? "" : item.displayName).trim();
    const primaryColor = String(item.primaryColor || "").trim();
    const secondaryColor = String(item.secondaryColor || "").trim();
    const logoUrl = String(item.logoUrl || "").trim();

    if (!displayName || displayName.length > 30) {
      throw new Error("Team " + teamId + " needs a display name of 1 to 30 characters.");
    }

    if (/[\u0000-\u001F\u007F]/.test(displayName)) {
      throw new Error("Team names cannot contain control characters.");
    }

    if (primaryColor && !/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
      throw new Error("Primary colours must be blank or a hex value such as #3366FF.");
    }

    if (secondaryColor && !/^#[0-9a-fA-F]{6}$/.test(secondaryColor)) {
      throw new Error("Secondary colours must be blank or a hex value such as #3366FF.");
    }

    if (logoUrl && (
      logoUrl.length > 500 ||
      !/^https:\/\/[^\s]+$/i.test(logoUrl)
    )) {
      throw new Error("Logo URLs must be blank or a valid HTTPS URL under 500 characters.");
    }

    byId[teamId] = {
      displayName: displayName,
      primaryColor: primaryColor,
      secondaryColor: secondaryColor,
      logoUrl: logoUrl
    };
  });

  TEAM_IDS.forEach(function (teamId) {
    if (!byId[teamId]) {
      throw new Error("Missing settings for Team " + teamId + ".");
    }
  });

  return byId;
}

function respond_(value, callback) {
  if (!callback) return jsonResponse_(value);

  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
    return jsonResponse_({
      ok: false,
      service: SERVICE_NAME,
      error: "Invalid callback"
    });
  }

  return ContentService
    .createTextOutput(callback + "(" + JSON.stringify(value) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
