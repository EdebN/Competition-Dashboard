const TEAMS = [
  "Team A",
  "Team B",
  "Team C",
  "Team D",
  "Team E"
];

const START_ELO = 1000;
const K = 25;

const MIN_GAMES_PER_TEAM = 3;
const MAX_GAMES_PER_TEAM = 16;
const DEFAULT_GAMES_PER_TEAM = 16;

const FINALS_COUNT = 4;

const COMMUNITY_API_URL = "https://script.google.com/macros/s/AKfycbxAzNw4qxdAI_Ky0SRgb28FBzcmpnuWrwe9ItNEUfI4WYpNz2XEEozmQ6IEdVTGHhke/exec";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vT2tLmAB4OB6uWLeBeCSWLMarzK9RjelvVTJRGqsm94yVijiT25leyXnPWhJybPtoyMKUgfBL6tTzFe/pub?output=csv";


/* =========================================================
   LOCAL COMPETITION SETTINGS
========================================================= */

let currentGamesPerTeam = DEFAULT_GAMES_PER_TEAM;
let sharedGamesSettingLoaded = false;
let sharedGamesSettingError = "";

function getGamesPerTeam() {
  return currentGamesPerTeam;
}

function setGamesPerTeam(value) {
  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number < MIN_GAMES_PER_TEAM ||
    number > MAX_GAMES_PER_TEAM
  ) {
    throw new Error(`Games per team must be an integer from ${MIN_GAMES_PER_TEAM} to ${MAX_GAMES_PER_TEAM}.`);
  }

  currentGamesPerTeam = number;
}

/* ─────────────────────────────────────
   TEAM DISPLAY NAMES
   Internal IDs stay Team A–D.
   These names are display-only.
───────────────────────────────────── */

let currentTeamSettings = TEAMS.map(team => ({
  teamId: team.slice(-1),
  displayName: team,
  primaryColor: "",
  secondaryColor: "",
  logoUrl: "",
  updatedAt: null
}));

let communitySettingsLoaded = false;
let communitySettingsError = "";

function getTeamNames() {
  const names = {};

  TEAMS.forEach(team => {
    const teamId = team.slice(-1);
    const setting = currentTeamSettings.find(item => item.teamId === teamId);
    names[team] = setting?.displayName || team;
  });

  return names;
}

function getTeamDisplayName(team) {
  if (!team) return "";
  return getTeamNames()[team] || team;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function normalizeCommunitySettings(response) {
  if (!response || response.ok !== true || !Array.isArray(response.teams)) {
    throw new Error("The API did not return a valid team-settings response.");
  }

  const byId = new Map();

  response.teams.forEach(item => {
    const teamId = String(item?.teamId || "").trim().toUpperCase();
    if (!["A", "B", "C", "D", "E"].includes(teamId) || byId.has(teamId)) {
      throw new Error("The API returned invalid or duplicate team IDs.");
    }

    const displayName = String(item.displayName || `Team ${teamId}`).trim();
    if (!displayName || displayName.length > 30) {
      throw new Error(`Team ${teamId} has an invalid display name.`);
    }

    byId.set(teamId, {
      teamId,
      displayName,
      primaryColor: String(item.primaryColor || "").trim(),
      secondaryColor: String(item.secondaryColor || "").trim(),
      logoUrl: String(item.logoUrl || "").trim(),
      updatedAt: item.updatedAt ? String(item.updatedAt) : null
    });
  });

  if (byId.size !== 5) {
    throw new Error("The API must return exactly five team records.");
  }

  return ["A", "B", "C", "D", "E"].map(teamId => byId.get(teamId));
}

function readCommunityApi(action, extraParams = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(COMMUNITY_API_URL);
    const callbackName = "__competitionCommunityCallback_" +
      Date.now() + "_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    let finished = false;

    const timeout = setTimeout(() => {
      finish(new Error("The community API read timed out."));
    }, 15000);

    function finish(error, data) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      try { delete window[callbackName]; } catch {}
      script.remove();
      if (error) reject(error);
      else resolve(data);
    }

    window[callbackName] = data => finish(null, data);
    url.searchParams.set("action", action);
    Object.entries(extraParams).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("_cacheBust", String(Date.now()));

    script.async = true;
    script.src = url.toString();
    script.onerror = () => finish(new Error("The browser could not load the community API response."));
    document.head.appendChild(script);
  });
}

function postCommunityAction(payload) {
  return fetch(COMMUNITY_API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(payload)
  });
}

function postCommunitySettings(token, teams) {
  return postCommunityAction({
    action: "updateTeamSettings",
    adminToken: token,
    teams
  });
}

function postCommunityGamesPerTeam(token, gamesPerTeam) {
  return postCommunityAction({
    action: "updateCompetitionSettings",
    adminToken: token,
    gamesPerTeam
  });
}

function updateDashboardTeamNames() {
  updateTeamNavNames();
  calculate();
  renderGames();
  renderFinalsPage();

  const status = document.getElementById("teamNamesStatus");
  if (status && communitySettingsLoaded) {
    status.textContent = "Connected to shared team settings. Changes are visible to all visitors.";
    status.className = "admin-info";
  }

  if (currentPage === "admin" && adminUnlocked) {
    const names = getTeamNames();
    const inputIds = {
      "Team A": "teamNameA",
      "Team B": "teamNameB",
      "Team C": "teamNameC",
      "Team D": "teamNameD",
      "Team E": "teamNameE"
    };

    TEAMS.forEach(team => {
      const input = document.getElementById(inputIds[team]);
      if (input && document.activeElement !== input) {
        input.value = names[team];
      }
    });
  }
}

async function loadCommunitySettings() {
  try {
    const response = await readCommunityApi("getTeamSettings");
    currentTeamSettings = normalizeCommunitySettings(response);
    communitySettingsLoaded = true;
    communitySettingsError = "";
    updateDashboardTeamNames();
  } catch (error) {
    communitySettingsLoaded = false;
    communitySettingsError = error?.message || "Could not load shared team settings.";
    console.error("Could not load shared team settings:", error);

    const status = document.getElementById("teamNamesStatus");
    if (status) {
      status.textContent = "Shared settings unavailable. Team names are using defaults until the API reconnects.";
      status.className = "admin-warning";
    }
  }
}

async function loadSharedCompetitionSettings() {
  try {
    const response = await readCommunityApi("getCompetitionSettings");
    if (!response || response.ok !== true) {
      throw new Error(response?.error || "The API did not return shared competition settings.");
    }

    const value = Number(response.gamesPerTeam);
    if (!Number.isInteger(value) || value < MIN_GAMES_PER_TEAM || value > MAX_GAMES_PER_TEAM) {
      throw new Error("The API returned an invalid games-per-team value.");
    }

    setGamesPerTeam(value);
    sharedGamesSettingLoaded = true;
    sharedGamesSettingError = "";

    calculate();
    renderGames();
    renderFinalsPage();

    const slider = document.getElementById("gamesPerTeamSlider");
    const valueLabel = document.getElementById("gamesPerTeamValue");
    const status = document.getElementById("gamesPerTeamStatus");
    if (slider) slider.value = String(value);
    if (valueLabel) valueLabel.textContent = String(value);
    if (status) {
      status.className = "admin-info";
      status.textContent = "Connected to shared competition settings.";
    }
  } catch (error) {
    sharedGamesSettingLoaded = false;
    sharedGamesSettingError = error?.message || "Could not load shared competition settings.";
    console.error("Could not load shared competition settings:", error);

    const status = document.getElementById("gamesPerTeamStatus");
    if (status) {
      status.className = "admin-warning";
      status.textContent = "Shared season length unavailable: " + sharedGamesSettingError;
    }
  }
}

function delayCommunityApi(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function saveSharedGamesPerTeam(value) {
  if (!adminToken) {
    throw new Error("Enter the admin token before saving.");
  }

  const desired = Number(value);
  if (!Number.isInteger(desired) || desired < MIN_GAMES_PER_TEAM || desired > MAX_GAMES_PER_TEAM) {
    throw new Error(`Games per team must be an integer from ${MIN_GAMES_PER_TEAM} to ${MAX_GAMES_PER_TEAM}.`);
  }

  await postCommunityGamesPerTeam(adminToken, desired);

  let saved = null;
  let lastReadError = null;

  for (let attempt = 0; attempt < 7; attempt++) {
    if (attempt > 0) {
      await delayCommunityApi(700 + attempt * 400);
    }

    try {
      const response = await readCommunityApi("getCompetitionSettings");
      if (!response || response.ok !== true) {
        throw new Error(response?.error || "The API did not return shared competition settings.");
      }

      const valueFromApi = Number(response.gamesPerTeam);
      if (!Number.isInteger(valueFromApi) || valueFromApi < MIN_GAMES_PER_TEAM || valueFromApi > MAX_GAMES_PER_TEAM) {
        throw new Error("The API returned an invalid games-per-team value.");
      }

      saved = valueFromApi;
      if (saved === desired) break;
    } catch (error) {
      lastReadError = error;
    }
  }

  if (saved === null) {
    throw new Error(
      "The write was sent, but the shared setting could not be read back" +
      (lastReadError?.message ? ": " + lastReadError.message : ".")
    );
  }

  if (saved !== desired) {
    throw new Error(`Expected ${desired} games per team, but the API returned ${saved}.`);
  }

  setGamesPerTeam(saved);
  sharedGamesSettingLoaded = true;
  sharedGamesSettingError = "";
  calculate();
  renderGames();
  renderFinalsPage();
}

async function saveSharedTeamNames(names) {
  if (!adminToken) {
    throw new Error("Enter the admin token before saving.");
  }

  if (!communitySettingsLoaded) {
    throw new Error("Shared team settings have not loaded. Check the API connection and try again.");
  }

  const cleanedNames = {};
  TEAMS.forEach(team => {
    const value = String(names[team] ?? "").trim();
    if (!value || value.length > 30 || /[\u0000-\u001F\u007F]/.test(value)) {
      throw new Error(`${team} must have a name of 1–30 characters.`);
    }
    cleanedNames[team] = value;
  });

  // Re-read first so the write preserves the latest non-name fields.
  const beforeResponse = await readCommunityApi("getTeamSettings");
  const before = normalizeCommunitySettings(beforeResponse);
  const desired = before.map(setting => ({
    ...setting,
    displayName: cleanedNames[`Team ${setting.teamId}`]
  }));

  await postCommunitySettings(adminToken, desired);

  // A cross-origin no-cors POST is intentionally unreadable to the browser.
  // Poll the public read endpoint briefly rather than assuming the sheet is
  // visible after a single fixed delay.
  let saved = null;
  let namesMatch = false;
  let lastReadError = null;

  for (let attempt = 0; attempt < 7; attempt++) {
    if (attempt > 0) {
      await delayCommunityApi(700 + attempt * 400);
    }

    try {
      const savedResponse = await readCommunityApi("getTeamSettings");
      saved = normalizeCommunitySettings(savedResponse);
      namesMatch = saved.every(setting =>
        setting.displayName === cleanedNames[`Team ${setting.teamId}`]
      );

      if (namesMatch) break;
    } catch (error) {
      lastReadError = error;
    }
  }

  if (!saved) {
    throw new Error(
      "The save request was sent, but the API read-back failed" +
      (lastReadError?.message ? ": " + lastReadError.message : ".") +
      " Check the connection and read the team settings again before retrying."
    );
  }

  if (!namesMatch) {
    const differences = saved
      .filter(setting =>
        setting.displayName !== cleanedNames[`Team ${setting.teamId}`]
      )
      .map(setting =>
        `Team ${setting.teamId}: expected "${cleanedNames[`Team ${setting.teamId}`]}", API returned "${setting.displayName}"`
      );

    throw new Error(
      "The API read-back still differs after retrying. " +
      differences.join("; ") +
      ". This usually means the API rejected the write (for example, an incorrect token) or the update was not applied."
    );
  }

  currentTeamSettings = saved;
  communitySettingsLoaded = true;
  communitySettingsError = "";
  updateDashboardTeamNames();
}

function updateTeamNavNames() {
  const names = getTeamNames();

  const navMap = {
    "team-a": "Team A",
    "team-b": "Team B",
    "team-c": "Team C",
    "team-d": "Team D",
    "team-e": "Team E"
  };

  document.querySelectorAll("[data-page]").forEach(button => {
    const page = button.dataset.page;
    const team = navMap[page];

    if (!team) return;

    button.textContent = names[team] || team;
  });
}
function getRegularGameCount() {
  return getGamesPerTeam() * TEAMS.length / 2;
}
/* =========================================================
   FIXTURE STRUCTURE
========================================================= */

function generateFixtureTemplate() {
  const fixtures = [];

  // Each round has two games and one team on referee duty.
  // The bye/referee rotates through the five teams.
  const rounds = [
    { referee: "Team E", games: [["Team A", "Team B"], ["Team C", "Team D"]] },
    { referee: "Team D", games: [["Team A", "Team C"], ["Team B", "Team E"]] },
    { referee: "Team B", games: [["Team A", "Team D"], ["Team C", "Team E"]] },
    { referee: "Team C", games: [["Team A", "Team E"], ["Team B", "Team D"]] },
    { referee: "Team A", games: [["Team B", "Team C"], ["Team D", "Team E"]] }
  ];

  const teamIndex = new Map(TEAMS.map((team, index) => [team, index]));
  const matchesPerCycle = TEAMS.length * (TEAMS.length - 1) / 2;
  const regularGameLimit = MAX_GAMES_PER_TEAM * TEAMS.length / 2;
  const cyclesNeeded = Math.ceil(regularGameLimit / matchesPerCycle);
  let gameId = 1;

  for (let cycle = 0; cycle < cyclesNeeded; cycle++) {
    for (const round of rounds) {
      for (const [first, second] of round.games) {
        if (fixtures.length >= regularGameLimit) break;

        const firstIndex = teamIndex.get(first);
        const secondIndex = teamIndex.get(second);
        const offset = (secondIndex - firstIndex + TEAMS.length) % TEAMS.length;
        let home = offset > 0 && offset <= Math.floor((TEAMS.length - 1) / 2)
          ? first
          : second;
        let away = home === first ? second : first;

        // Reverse home/away on every second round-robin cycle.
        if (cycle % 2 === 1) {
          [home, away] = [away, home];
        }

        fixtures.push({
          id: gameId++,
          home,
          away,
          referee: round.referee,
          stage: "REGULAR"
        });
      }
    }
  }

  for (let i = 0; i < FINALS_COUNT; i++) {
    fixtures.push({
      id: gameId + i,
      home: "",
      away: "",
      referee: "",
      stage: i === FINALS_COUNT - 1 ? "GRAND FINAL" : "FINAL"
    });
  }

  return fixtures;
}
let games = [];


/* =========================================================
   SCORES
========================================================= */

const scores = {};


/* =========================================================
   ACTIVE REGULAR SEASON
========================================================= */
function normalizeStage(stage) {
  return String(stage || "")
    .trim()
    .toUpperCase();
}

function getActiveRegularGames() {

  const count =
    getRegularGameCount();

  return games
    .filter(
      game =>
        normalizeStage(game.stage) === "REGULAR"
    )
    .slice(0, count);
}

function getFinalGames() {

  return games.filter(
    game =>
      normalizeStage(game.stage) === "FINAL" ||
      normalizeStage(game.stage) === "GRAND FINAL"
  );
}


/* =========================================================
   GAME VALIDATION
========================================================= */

function isPlayed(game) {

  return (
    game.home !== "" &&
    game.away !== "" &&
    scores[game.id] &&
    scores[game.id].home !== "" &&
    scores[game.id].away !== "" &&
    scores[game.id].home !== null &&
    scores[game.id].away !== null
  );
}


/* =========================================================
   ELO
========================================================= */

function expectedScore(
  ratingA,
  ratingB
) {

  return (
    1 /
    (
      1 +
      Math.pow(
        10,
        (ratingB - ratingA) / 400
      )
    )
  );
}

function marginFactor(
  scoreA,
  scoreB
) {

  return Math.log(
    Math.abs(
      scoreA - scoreB
    ) + 1
  );
}

function actualScore(
  scoreA,
  scoreB
) {

  if (scoreA > scoreB)
    return 1;

  if (scoreA < scoreB)
    return 0;

  return 0.5;
}

function formatChange(value) {

  if (
    Math.abs(value) <
    0.000001
  ) {
    return "0.00";
  }

  return value > 0
    ? `+${value.toFixed(2)}`
    : value.toFixed(2);
}

function calculateElo() {

  const ratings = {};

  TEAMS.forEach(team => {
    ratings[team] =
      START_ELO;
  });

  const eloRows = [];

  getActiveRegularGames()
    .forEach(game => {

      const preA =
        ratings[game.home];

      const preB =
        ratings[game.away];

      let scoreA = "";
      let scoreB = "";

      if (scores[game.id]) {

        scoreA =
          scores[game.id].home;

        scoreB =
          scores[game.id].away;
      }

      let expectedA = 0.5;
      let margin = 0;
      let changeA = 0;
      let changeB = 0;

      let postA = preA;
      let postB = preB;

      if (isPlayed(game)) {

        scoreA =
          Number(scoreA);

        scoreB =
          Number(scoreB);

        expectedA =
          expectedScore(
            preA,
            preB
          );

        margin =
          marginFactor(
            scoreA,
            scoreB
          );

        const actualA =
          actualScore(
            scoreA,
            scoreB
          );

        changeA =
          K *
          margin *
          (
            actualA -
            expectedA
          );

        changeB =
          -changeA;

        postA =
          preA + changeA;

        postB =
          preB + changeB;

        ratings[game.home] =
          postA;

        ratings[game.away] =
          postB;
      }

      eloRows.push({

        game: game.id,

        teamA:
          game.home,

        scoreA,

        teamB:
          game.away,

        scoreB,

        preA,
        preB,

        expectedA,

        margin,

        changeA,
        changeB,

        postA,
        postB

      });

    });

  return {
    rows: eloRows,
    finalRatings: ratings
  };
}


/* =========================================================
   LADDER
========================================================= */

function calculateLadder(
  finalRatings
) {

  const stats = {};

  TEAMS.forEach(team => {

    stats[team] = {

      team,

      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,

      pf: 0,
      pa: 0,
      diff: 0,

      winPercent: 0,

      elo:
        finalRatings[team],

      form: [],

      latestEloChange: 0

    };

  });


  getActiveRegularGames()
    .forEach(game => {

      if (!isPlayed(game))
        return;

      const scoreA =
        Number(
          scores[game.id].home
        );

      const scoreB =
        Number(
          scores[game.id].away
        );

      const A =
        stats[game.home];

      const B =
        stats[game.away];


      A.played++;
      B.played++;

      A.pf += scoreA;
      A.pa += scoreB;

      B.pf += scoreB;
      B.pa += scoreA;


      let resultA;
      let resultB;


      if (scoreA > scoreB) {

        A.wins++;
        B.losses++;

        resultA = "W";
        resultB = "L";

      }

      else if (
        scoreA < scoreB
      ) {

        B.wins++;
        A.losses++;

        resultA = "L";
        resultB = "W";

      }

      else {

        A.draws++;
        B.draws++;

        resultA = "D";
        resultB = "D";

      }


      A.form.push({

        game: game.id,

        opponent:
          game.away,

        result: resultA,

        scoreFor:
          scoreA,

        scoreAgainst:
          scoreB

      });


      B.form.push({

        game: game.id,

        opponent:
          game.home,

        result: resultB,

        scoreFor:
          scoreB,

        scoreAgainst:
          scoreA

      });

    });


  TEAMS.forEach(team => {

    const s =
      stats[team];

    s.diff =
      s.pf - s.pa;

    s.winPercent =
      s.played === 0
        ? 0
        : s.wins /
          s.played;

    s.form =
      s.form.slice(-5);

  });


  const elo =
    calculateElo();


  elo.rows.forEach(row => {

    if (
      row.scoreA === "" ||
      row.scoreB === ""
    ) {
      return;
    }

    stats[row.teamA]
      .latestEloChange =
        row.changeA;

    stats[row.teamB]
      .latestEloChange =
        row.changeB;

  });


  const sorted =
    Object.values(stats)
      .sort((a, b) => {

        if (
          b.elo !== a.elo
        )
          return b.elo - a.elo;

        if (
          b.diff !== a.diff
        )
          return b.diff - a.diff;

        if (
          b.wins !== a.wins
        )
          return b.wins - a.wins;

        return b.pf - a.pf;

      });


  sorted.forEach(
    (team, index) => {

      team.rank =
        index + 1;

    }
  );


  return sorted;
}


/* =========================================================
   LADDER RENDER
========================================================= */

function renderLadder(
  ladder
) {

  const container =
    document.getElementById(
      "ladder"
    );

  if (!container)
    return;


  let html = `

    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>RANK</th>
            <th>TEAM</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>PF</th>
            <th>PA</th>
            <th>DIFF</th>
            <th>WIN %</th>
            <th>FORM</th>
            <th>ELO</th>
            <th>ELO Δ</th>

          </tr>

        </thead>

        <tbody>

  `;


  ladder.forEach(team => {

    const diffClass =
      team.diff > 0
        ? "positive"
        : team.diff < 0
        ? "negative"
        : "neutral";


    /* =========================
       FORM
    ========================= */

    let formHTML = "";


    if (
      team.form.length === 0
    ) {

      formHTML = `
        <span class="neutral">–</span>
      `;

    }

    else {

      formHTML =
        team.form
          .map(form => {

            const resultClass =
              form.result === "W"
                ? "form-win"
                : form.result === "L"
                ? "form-loss"
                : "form-draw";


            return `

              <span
                class="
                  form-result
                  ${resultClass}
                "
              >
                ${form.result}
              </span>

            `;

          })
          .join("");

    }


    /* =========================
       ELO MOVEMENT
    ========================= */

    let eloMovement =
      `<span class="neutral">→ 0.00</span>`;


    if (
      team.latestEloChange >
      0.000001
    ) {

      eloMovement =
        `
          <span class="positive">
            ↑ +${team.latestEloChange.toFixed(2)}
          </span>
        `;

    }

    else if (
      team.latestEloChange <
      -0.000001
    ) {

      eloMovement =
        `
          <span class="negative">
            ↓ ${team.latestEloChange.toFixed(2)}
          </span>
        `;

    }


    html += `

      <tr>

        <td class="ladder-rank">
          ${team.rank}
        </td>

        <td class="team-name">
  ${escapeHTML(getTeamDisplayName(team.team))}
</td>

        <td>${team.played}</td>
        <td>${team.wins}</td>
        <td>${team.draws}</td>
        <td>${team.losses}</td>

        <td>${team.pf}</td>

        <td>${team.pa}</td>

        <td class="${diffClass}">
          ${
            team.diff > 0
              ? "+"
              : ""
          }${team.diff}
        </td>

        <td>
          ${
            (
              team.winPercent *
              100
            ).toFixed(1)
          }%
        </td>

        <td class="ladder-form">

          ${
            team.form.length
              ? team.form.map(result => {

                  const cls =
                    result.result === "W"
                      ? "form-win"
                      : result.result === "D"
                      ? "form-draw"
                      : "form-loss";

                  return `
                    <button
                      class="form-result ${cls}"
                      onclick="jumpToGame(${result.game})"
                      title="Game ${result.game}: ${escapeHTML(getTeamDisplayName(team.team))} vs ${escapeHTML(getTeamDisplayName(result.opponent))}"
                    >
                      ${result.result}
                    </button>
                  `;

                }).join("")
              : "—"
          }

        </td>

        <td class="ladder-elo">
          ${team.elo.toFixed(2)}
        </td>

        <td class="ladder-elo-change">
          ${eloMovement}
        </td>

      </tr>

    `;

  });


  html += `

        </tbody>

      </table>

    </div>

  `;


  container.innerHTML =
    html;

}
/* =========================================================
   GAMES
========================================================= */

function renderGames() {
  console.log(
    "MATCH SETTINGS:",
    "games/team =", getGamesPerTeam(),
    "regular games =", getRegularGameCount(),
    "active games =", getActiveRegularGames().length
  );
  const container =
    document.getElementById(
      "games"
    );

  if (!container)
    return;


  container.innerHTML = "";


  const grid =
    document.createElement(
      "div"
    );

  grid.className =
    "games-grid";


  const gamesToDisplay =
  getActiveRegularGames();

gamesToDisplay.forEach(game => {

    const row =
      document.createElement(
        "div"
      );

    row.className =
      "game";

    row.dataset.gameId =
      game.id;


    const number =
  document.createElement(
    "div"
  );

number.className =
  "game-number";

const activeRegularGames = getActiveRegularGames();

const displayGameNumber =
  activeRegularGames.includes(game)
    ? activeRegularGames.indexOf(game) + 1
    : game.id;

number.textContent =
  `GAME ${displayGameNumber}`;


    const matchup =
      document.createElement(
        "div"
      );

    matchup.className =
      "game-matchup";


    const activeRegular =
      getActiveRegularGames()
        .some(
          g => g.id === game.id
        );


    if (
      game.home &&
      game.away
    ) {

      matchup.innerHTML = `

        <span class="team-home">
  ${escapeHTML(getTeamDisplayName(game.home))}
</span>

<span class="versus">
  VS
</span>

<span class="team-away">
  ${escapeHTML(getTeamDisplayName(game.away))}
</span>

        <div
          class="result"
          id="result-${game.id}"
        ></div>

      `;

    }

    else {

      matchup.innerHTML = `

        <span class="team-home">
          To be determined
        </span>

        <span class="versus">
          VS
        </span>

        <span class="team-away">
          To be determined
        </span>

        <div class="result">
          Finals
        </div>

      `;

    }


    if (game.referee && activeRegular) {
      const refereeLabel = document.createElement("div");
      refereeLabel.className = "game-referee";
      refereeLabel.textContent = `REFEREE: ${getTeamDisplayName(game.referee)}`
      matchup.appendChild(refereeLabel);
    }

    const scoreArea =
      document.createElement(
        "div"
      );

    scoreArea.className =
      "score-area";


    if (isPlayed(game)) {

      scoreArea.innerHTML = `

        <span>
          ${scores[game.id].home}
        </span>

        <span class="score-separator">
          –
        </span>

        <span>
          ${scores[game.id].away}
        </span>

      `;

    }

    else {

      scoreArea.innerHTML = `

        <span
          style="color:#596676"
        >
          TBD
        </span>

      `;

    }


    const stage =
      document.createElement(
        "div"
      );

    stage.className =
      "stage";

    stage.textContent =
      activeRegular
        ? "REGULAR"
        : game.stage;


    row.appendChild(number);
    row.appendChild(matchup);
    row.appendChild(scoreArea);
    row.appendChild(stage);

    grid.appendChild(row);

  });


  container.appendChild(
    grid
  );

  updateGameResults();

}


/* =========================================================
   RESULTS
========================================================= */

function updateGameResults() {

  getActiveRegularGames().forEach(game => {

    const result =
      document.getElementById(
        `result-${game.id}`
      );

    if (!result)
      return;


    if (!isPlayed(game)) {

      result.textContent =
        "Awaiting result";

      result.className =
        "result";

      return;

    }


    const A =
      Number(
        scores[game.id].home
      );

    const B =
      Number(
        scores[game.id].away
      );


    if (A > B) {

      result.textContent =
  `${getTeamDisplayName(game.home)} wins`;

      result.className =
        "result positive";

    }

    else if (B > A) {

      result.textContent =
  `${getTeamDisplayName(game.away)} wins`;

      result.className =
        "result negative";

    }

    else {

      result.textContent =
        "Draw";

      result.className =
        "result neutral";

    }

  });

}


/* =========================================================
   GAME JUMP
========================================================= */

function jumpToGame(
  gameId
) {

  showPage("home");


  setTimeout(() => {

    const row =
      document.querySelector(
        `.game[data-game-id="${gameId}"]`
      );

    if (!row)
      return;


    row.scrollIntoView({

      behavior: "smooth",

      block: "center"

    });


    row.classList.add(
      "game-highlight"
    );


    setTimeout(() => {

      row.classList.remove(
        "game-highlight"
      );

    }, 1800);

  }, 80);

}


/* =========================================================
   ELO TABLE
========================================================= */

function renderEloTable(
  rows
) {

  const container =
    document.getElementById(
      "eloTable"
    );

  if (!container)
    return;


  let html = `

    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>GAME</th>
            <th>TEAM A</th>
            <th>SCORE</th>
            <th>TEAM B</th>
            <th>SCORE</th>
            <th>PRE A</th>
            <th>PRE B</th>
            <th>EXPECTED A</th>
            <th>MARGIN</th>
            <th>CHANGE A</th>
            <th>CHANGE B</th>
            <th>POST A</th>
            <th>POST B</th>

          </tr>

        </thead>

        <tbody>

  `;


  rows.forEach(row => {

    const changeAClass =
      row.changeA > 0
        ? "elo-up"
        : row.changeA < 0
        ? "elo-down"
        : "elo-zero";


    const changeBClass =
      row.changeB > 0
        ? "elo-up"
        : row.changeB < 0
        ? "elo-down"
        : "elo-zero";


    html += `

      <tr>

        <td>${row.game}</td>

        <td class="team-name">
  ${escapeHTML(getTeamDisplayName(row.teamA))}
</td>

        <td>
          ${
            row.scoreA === ""
              ? "–"
              : row.scoreA
          }
        </td>

        <td class="team-name">
  ${escapeHTML(getTeamDisplayName(row.teamB))}
</td>

        <td>
          ${
            row.scoreB === ""
              ? "–"
              : row.scoreB
          }
        </td>

        <td>
          ${row.preA.toFixed(2)}
        </td>

        <td>
          ${row.preB.toFixed(2)}
        </td>

        <td>
          ${row.expectedA.toFixed(3)}
        </td>

        <td>
          ${row.margin.toFixed(3)}
        </td>

        <td class="${changeAClass}">
          ${formatChange(row.changeA)}
        </td>

        <td class="${changeBClass}">
          ${formatChange(row.changeB)}
        </td>

        <td>
          ${row.postA.toFixed(2)}
        </td>

        <td>
          ${row.postB.toFixed(2)}
        </td>

      </tr>

    `;

  });


  html += `

        </tbody>

      </table>

    </div>

  `;


  container.innerHTML =
    html;
}


/* =========================================================
   FINALS PAGE
========================================================= */

function renderFinalsPage() {

  const page =
    document.getElementById(
      "finals-page"
    );

  if (!page)
    return;


  /* ─────────────────────────
     GET CURRENT LADDER
  ───────────────────────── */

  const elo =
    calculateElo();

  const ladder =
    calculateLadder(
      elo.finalRatings
    );


  /* ─────────────────────────
     GET FINALS GAMES
  ───────────────────────── */

  const finals =
    getFinalGames();

  const finalsInOrder = [...finals].sort((a, b) => a.id - b.id);
  const openingFinals = finalsInOrder.filter(
    game => normalizeStage(game.stage) === "FINAL"
  );

  const final1 = openingFinals[0] || null;
  const final2 = openingFinals[1] || null;
  const final3 = openingFinals[2] || null;

  const grandFinal = finalsInOrder.find(
    game => normalizeStage(game.stage) === "GRAND FINAL"
  ) || null;


  /* ─────────────────────────
     INITIAL SEEDING
  ───────────────────────── */

  const first =
    ladder[0]
      ? ladder[0].team
      : "TBD";

  const second =
    ladder[1]
      ? ladder[1].team
      : "TBD";

  const third =
    ladder[2]
      ? ladder[2].team
      : "TBD";

  const fourth =
    ladder[3]
      ? ladder[3].team
      : "TBD";


  /* ─────────────────────────
     WINNER / LOSER HELPERS
  ───────────────────────── */

  function getWinner(game) {

    if (
      !game ||
      !isPlayed(game) ||
      !scores[game.id]
    ) {
      return null;
    }

    const homeScore =
      Number(
        scores[game.id].home
      );

    const awayScore =
      Number(
        scores[game.id].away
      );

    if (
      homeScore === awayScore
    ) {
      return null;
    }

    return homeScore > awayScore
      ? game.home
      : game.away;
  }


  function getLoser(game) {

    if (
      !game ||
      !isPlayed(game) ||
      !scores[game.id]
    ) {
      return null;
    }

    const homeScore =
      Number(
        scores[game.id].home
      );

    const awayScore =
      Number(
        scores[game.id].away
      );

    if (
      homeScore === awayScore
    ) {
      return null;
    }

    return homeScore < awayScore
      ? game.home
      : game.away;
  }


  /* ─────────────────────────
     FINAL 1 / FINAL 2 SEEDING
  ───────────────────────── */

  const final1Home =
    first;

  const final1Away =
    fourth;

  const final2Home =
    second;

  const final2Away =
    third;


  if (final1) {

    final1.home =
      final1Home;

    final1.away =
      final1Away;

  }


  if (final2) {

    final2.home =
      final2Home;

    final2.away =
      final2Away;

  }


  /* ─────────────────────────
     WINNERS / LOSERS
  ───────────────────────── */

  const winner1 =
    getWinner(final1);

  const winner2 =
    getWinner(final2);

  const loser1 =
    getLoser(final1);

  const loser2 =
    getLoser(final2);


  /* ─────────────────────────
     GRAND FINAL
  ───────────────────────── */

  const grandFinalHome =
    winner1 ||
    "Winner Final 1";

  const grandFinalAway =
    winner2 ||
    "Winner Final 2";


  if (grandFinal) {

    grandFinal.home =
      winner1 || "";

    grandFinal.away =
      winner2 || "";

  }


  const grandFinalWinner =
    getWinner(grandFinal);


  /* ─────────────────────────
     FINAL 3
  ───────────────────────── */

  const final3Home =
    loser1 ||
    "Loser Final 1";

  const final3Away =
    loser2 ||
    "Loser Final 2";


  if (final3) {

    final3.home =
      loser1 || "";

    final3.away =
      loser2 || "";

  }


  const final3Winner =
    getWinner(final3);


  /* ─────────────────────────
     DISPLAY HELPERS
  ───────────────────────── */

  function teamName(
  team,
  seed = ""
) {

  if (!team)
    team = "TBD";

  const displayTeam =
    (
      team === "TBD" ||
      team === "Winner Final 1" ||
      team === "Winner Final 2" ||
      team === "Loser Final 1" ||
      team === "Loser Final 2"
    )
      ? team
      : getTeamDisplayName(team);

  return `
    <span class="bracket-seed">
      ${seed}
    </span>
    ${escapeHTML(displayTeam)}
  `;

}


  function getScore(
    game,
    side
  ) {

    if (
      !game ||
      !isPlayed(game) ||
      !scores[game.id]
    ) {
      return null;
    }

    return scores[game.id][side];

  }


  function teamRow(
    team,
    score,
    seed = "",
    result = ""
  ) {

    let resultClass = "";

    if (result === "win")
      resultClass = " bracket-win";

    if (result === "loss")
      resultClass = " bracket-loss";

    return `
      <div class="bracket-team${resultClass}">

        ${teamName(
          team,
          seed
        )}

        ${
          score !== null &&
          score !== undefined
            ? `
              <div class="bracket-score">
                ${score}
              </div>
            `
            : ""
        }

      </div>
    `;

  }


  function resultHTML(
    game,
    winner
  ) {

    if (
      !game ||
      !isPlayed(game) ||
      !winner
    ) {
      return "";
    }

    return `
  <div class="bracket-result">
    ${escapeHTML(getTeamDisplayName(winner))} won
  </div>
`;

  }


  function statusHTML(game) {

    if (!game)
      return "TBD";

    return isPlayed(game)
      ? "PLAYED"
      : "UPCOMING";

  }


  /* ─────────────────────────
     PAGE
  ───────────────────────── */

  page.innerHTML = `

    <div class="finals-header">

      <div class="section-title">
        CHAMPIONSHIP
      </div>

      <h1 class="finals-title">
        Finals
      </h1>

      <div class="finals-subtitle">
        ${getGamesPerTeam()}
        regular-season games per team
      </div>

    </div>


    <section class="card">

      <div class="section-title">
        FINALS BRACKET
      </div>

      <h2>
        Championship Tree
      </h2>


      <div class="final-bracket">


        <!-- =========================================
             OPENING FINALS
        ========================================== -->

        <div class="bracket-round bracket-opening">


          <!-- FINAL 1 -->

          <div class="bracket-match">

            <div class="bracket-match-title">
              FINAL 1
            </div>


            ${teamRow(
              final1Home,
              getScore(
                final1,
                "home"
              ),
              "#1",
              winner1 === final1Home
                ? "win"
                : winner1
                  ? "loss"
                  : ""
            )}


            ${teamRow(
              final1Away,
              getScore(
                final1,
                "away"
              ),
              "#4",
              winner1 === final1Away
                ? "win"
                : winner1
                  ? "loss"
                  : ""
            )}


            ${resultHTML(
              final1,
              winner1
            )}


            <div class="bracket-status">
              ${statusHTML(
                final1
              )}
            </div>

          </div>


          <!-- FINAL 2 -->

          <div class="bracket-match">

            <div class="bracket-match-title">
              FINAL 2
            </div>


            ${teamRow(
              final2Home,
              getScore(
                final2,
                "home"
              ),
              "#2",
              winner2 === final2Home
                ? "win"
                : winner2
                  ? "loss"
                  : ""
            )}


            ${teamRow(
              final2Away,
              getScore(
                final2,
                "away"
              ),
              "#3",
              winner2 === final2Away
                ? "win"
                : winner2
                  ? "loss"
                  : ""
            )}


            ${resultHTML(
              final2,
              winner2
            )}


            <div class="bracket-status">
              ${statusHTML(
                final2
              )}
            </div>

          </div>


        </div>


        <!-- =========================================
             CONNECTORS
        ========================================== -->

        <div class="bracket-connectors">

          <div class="connector-top">

            <span>
              WINNER
            </span>

          </div>


          <div class="connector-bottom">

            <span>
              WINNER
            </span>

          </div>

        </div>


        <!-- =========================================
             GRAND FINAL
        ========================================== -->

        <div class="bracket-round bracket-final">


          <div class="bracket-match grand-final-match">

            <div class="bracket-match-title">
              GRAND FINAL
            </div>


            ${teamRow(
              grandFinalHome,
              getScore(
                grandFinal,
                "home"
              ),
              "",
              grandFinalWinner === grandFinalHome
                ? "win"
                : grandFinalWinner
                  ? "loss"
                  : ""
            )}


            ${teamRow(
              grandFinalAway,
              getScore(
                grandFinal,
                "away"
              ),
              "",
              grandFinalWinner === grandFinalAway
                ? "win"
                : grandFinalWinner
                  ? "loss"
                  : ""
            )}


            ${resultHTML(
              grandFinal,
              grandFinalWinner
            )}


            <div class="bracket-status">
              ${statusHTML(
                grandFinal
              )}
            </div>

          </div>


        </div>


      </div>


      <!-- =========================================
           THIRD PLACE
      ========================================== -->

      <div class="third-place-section">

        <div class="section-title">
          PLACEMENT
        </div>

        <h2>
          Final 3
        </h2>


        <div class="third-place-bracket">

          <div class="bracket-match">

            <div class="bracket-match-title">
              FINAL 3
            </div>


            ${teamRow(
              final3Home,
              getScore(
                final3,
                "home"
              ),
              "",
              final3Winner === final3Home
                ? "win"
                : final3Winner
                  ? "loss"
                  : ""
            )}


            ${teamRow(
              final3Away,
              getScore(
                final3,
                "away"
              ),
              "",
              final3Winner === final3Away
                ? "win"
                : final3Winner
                  ? "loss"
                  : ""
            )}


            ${resultHTML(
              final3,
              final3Winner
            )}


            <div class="bracket-status">
              ${statusHTML(
                final3
              )}
            </div>

          </div>

        </div>

      </div>


    </section>

  `;

}
let adminToken = "";
let adminUnlocked = false;
function renderAdminPage() {

  const page =
    document.getElementById(
      "admin-page"
    );

  if (!page)
    return;


  if (!adminUnlocked) {
    page.innerHTML = `
      <section class="card admin-card">
        <div class="section-title">ADMINISTRATION</div>
        <h2>Admin access</h2>
        <div class="admin-lock">
          <label class="admin-label" for="adminTokenInput">API ADMIN TOKEN</label>
          <input
            id="adminTokenInput"
            class="admin-input"
            type="password"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="Enter your API admin token"
          >
          <button class="admin-button" id="adminUnlock">OPEN ADMIN SETTINGS</button>
          <div id="adminError" class="admin-error" role="status" aria-live="polite"></div>
          <div class="admin-info">
            The token stays in this page's memory only and is never saved to browser storage or included in the website code. The server checks it when you save shared settings.
          </div>
          <div class="admin-info">
            ${communitySettingsLoaded
              ? "Shared team settings connected."
              : communitySettingsError
                ? "Shared settings could not be loaded. Check the API connection."
                : "Connecting to shared team settings…"}
          </div>
        </div>
      </section>
      <div class="admin-portal-entry"><a class="admin-button page-access-studio" href="team-editor.html">OPEN TEAM EDITOR PORTAL ↗</a></div>
    `;

    document.getElementById("adminUnlock").addEventListener("click", unlockAdmin);
    document.getElementById("adminTokenInput").addEventListener("keydown", event => {
      if (event.key === "Enter") unlockAdmin();
    });
    return;
  }


  const gamesPerTeam =
    getGamesPerTeam();

  const regularGames =
    getRegularGameCount();

  const sheetRegularGames =
    games.filter(
      game =>
        normalizeStage(game.stage) === "REGULAR"
    ).length;


  const enoughFixtures =
    sheetRegularGames >=
    regularGames;


  const teamNames =
    getTeamNames();


  page.innerHTML = `

    <section class="card admin-card">

      <div class="section-title">
        ADMINISTRATION
      </div>

      <h2>
        Competition settings
      </h2>


      <div class="admin-settings">


        <!-- TEAM NAMES -->

        <div class="admin-setting">

          <div class="admin-setting-header">

            <div class="admin-setting-name">
              Team names
            </div>

          </div>


          <div class="team-name-editor">

            <div class="team-name-row">

              <div class="team-name-label">
                TEAM A
              </div>

              <input
                id="teamNameA"
                class="admin-input team-name-input"
                type="text"
                maxlength="30"
                value="${escapeHTML(teamNames["Team A"])}"
              >

            </div>


            <div class="team-name-row">

              <div class="team-name-label">
                TEAM B
              </div>

              <input
                id="teamNameB"
                class="admin-input team-name-input"
                type="text"
                maxlength="30"
                value="${escapeHTML(teamNames["Team B"])}"
              >

            </div>


            <div class="team-name-row">

              <div class="team-name-label">
                TEAM C
              </div>

              <input
                id="teamNameC"
                class="admin-input team-name-input"
                type="text"
                maxlength="30"
                value="${escapeHTML(teamNames["Team C"])}"
              >

            </div>


            <div class="team-name-row">

              <div class="team-name-label">
                TEAM D
              </div>

              <input
                id="teamNameD"
                class="admin-input team-name-input"
                type="text"
                maxlength="30"
                value="${escapeHTML(teamNames["Team D"])}"
              >

            </div>

            <div class="team-name-row">
              <div class="team-name-label">
                TEAM E
              </div>
              <input
                id="teamNameE"
                class="admin-input team-name-input"
                type="text"
                maxlength="30"
                value="${escapeHTML(teamNames["Team E"])}"
              >
            </div>

          </div>


          <div class="admin-info">
            Team names are stored in the shared community database, so every visitor sees the same names.
            Internal team IDs, fixtures, and official score data remain unchanged.
          </div>

          <div id="teamNamesStatus" class="admin-info" role="status" aria-live="polite">
            ${communitySettingsLoaded
              ? "Connected to shared team settings."
              : communitySettingsError
                ? "Shared settings unavailable: " + escapeHTML(communitySettingsError)
                : "Loading shared team settings…"}
          </div>


          <button
            id="adminSaveNames"
            class="admin-button"
          >
            SAVE TEAM NAMES
          </button>

        </div>


        <!-- GAMES PER TEAM -->

        <div class="admin-setting">

          <div class="admin-setting-header">

            <div class="admin-setting-name">
              Games per team
            </div>

            <div
              id="gamesPerTeamValue"
              class="admin-setting-value"
            >
              ${gamesPerTeam}
            </div>

          </div>


          <input
            id="gamesPerTeamSlider"
            class="admin-range"
            type="range"
            min="${MIN_GAMES_PER_TEAM}"
            max="${MAX_GAMES_PER_TEAM}"
            step="1"
            value="${gamesPerTeam}"
          >


          <div class="admin-info">

            Controls how many regular-season
            games each team plays. All visitors
            use the same shared season length.

          </div>

          <div id="gamesPerTeamStatus" class="admin-info" role="status" aria-live="polite">
            ${sharedGamesSettingLoaded
              ? "Connected to shared competition settings."
              : sharedGamesSettingError
                ? "Shared setting unavailable: " + escapeHTML(sharedGamesSettingError)
                : "Loading shared competition settings…"}
          </div>

        </div>


        <div class="admin-summary">

          <div class="admin-summary-box">

            <div class="admin-summary-label">
              GAMES / TEAM
            </div>

            <div class="admin-summary-value">
              ${gamesPerTeam}
            </div>

          </div>


          <div class="admin-summary-box">

            <div class="admin-summary-label">
              REGULAR GAMES
            </div>

            <div class="admin-summary-value">
              ${regularGames}
            </div>

          </div>


          <div class="admin-summary-box">

            <div class="admin-summary-label">
              FINALS
            </div>

            <div class="admin-summary-value">
              ${FINALS_COUNT}
            </div>

          </div>

        </div>


        ${
          enoughFixtures
            ? `
              <div class="admin-success">
                Fixture capacity is sufficient for
                the selected season length.
              </div>
            `
            : `
              <div class="admin-warning">
                The selected competition requires
                ${regularGames} regular-season games,
                but only ${sheetRegularGames}
                regular fixture slots are available.
              </div>
            `
        }


        <button
          id="adminSave"
          class="admin-button"
        >
          SAVE COMPETITION SETTING
        </button>


        <button
          id="adminLock"
          class="admin-button"
        >
          LOCK ADMIN
        </button>


        


      </div>

    </section>


    


    <section class="card admin-card page-access-card">
      <div class="section-title">TEAM CONTENT</div>
      <div class="page-access-heading"><div><h2>Page Editor Access</h2><p class="page-access-intro">Give each team’s social manager access to their own page. They can build the look, write updates and manage photos without touching competition settings.</p></div><div class="page-access-mark" aria-hidden="true">✦</div></div>
      <div class="page-access-notice"><span class="page-access-notice-dot"></span><div><strong>Shared Team Editor access</strong><br>PINs are saved to the private Google Sheet and work across devices.</div></div>
      <div class="page-access-grid" id="pageAccessTeams"></div>
      
      <div id="pageAccessStatus" class="admin-info" role="status" aria-live="polite">Loading saved PIN status from the shared Google Sheet…</div>
    </section>


    

  `;


  const pageAccessTeams = document.getElementById("pageAccessTeams");
  if (pageAccessTeams) {
    const accents = ["#8b7cff", "#55d6be", "#ffb86b", "#ff729f", "#7bb7ff"];
    pageAccessTeams.innerHTML = TEAMS.map((team, index) => {
      const teamId = team.slice(-1);
      const displayName = teamNames[team] || team;
      return '<article class="page-access-team" style="--team-accent:' + accents[index % accents.length] + '">' +
        '<div class="page-access-team-top"><div class="page-access-avatar">' + escapeHTML(teamId) + '</div><span class="page-access-status">NOT SET UP</span></div>' +
        '<h3>' + escapeHTML(displayName) + '</h3><p>Team ' + escapeHTML(teamId) + ' page</p>' +
        '<div class="page-access-pin" id="pageAccessPin' + teamId + '">••••••</div>' +
        '<div class="page-access-actions"><button type="button" class="admin-button page-access-generate" data-team="' + teamId + '">GENERATE DEMO PIN</button>' +
        '<button type="button" class="page-access-copy" data-team="' + teamId + '" disabled>COPY</button></div></article>';
    }).join("");
  }
  try {
    const savedPins = JSON.parse(localStorage.getItem("team-editor-pins-v1") || "{}") || {};
    Object.entries(savedPins).forEach(([teamId, entry]) => {
      if (!["A", "B", "C", "D", "E"].includes(teamId) || !/^\d{6}$/.test(String(entry?.pin || ""))) return;
      const pinDisplay = document.getElementById("pageAccessPin" + teamId);
      const card = pinDisplay?.closest(".page-access-team");
      const badge = card?.querySelector(".page-access-status");
      const button = card?.querySelector(".page-access-generate");
      const copyButton = card?.querySelector(".page-access-copy");
      if (pinDisplay) pinDisplay.textContent = entry.pin;
      if (badge) { badge.textContent = "PIN READY"; badge.classList.add("is-demo"); }
      if (button) button.textContent = "REGENERATE PIN";
      if (copyButton) copyButton.disabled = false;
    });
  } catch {}

  /* ─────────────────────────────
     GAMES PER TEAM
  ───────────────────────────── */

  const slider =
    document.getElementById(
      "gamesPerTeamSlider"
    );

  const value =
    document.getElementById(
      "gamesPerTeamValue"
    );


  slider.addEventListener(
    "input",
    () => {

      value.textContent =
        slider.value;

    }
  );


  /* ─────────────────────────────
     SAVE TEAM NAMES
  ───────────────────────────── */

  document.getElementById("adminSaveNames").addEventListener("click", async event => {
    const button = event.currentTarget;
    const status = document.getElementById("teamNamesStatus");

    const names = {
      "Team A": document.getElementById("teamNameA").value,
      "Team B": document.getElementById("teamNameB").value,
      "Team C": document.getElementById("teamNameC").value,
      "Team D": document.getElementById("teamNameD").value,
      "Team E": document.getElementById("teamNameE").value
    };

    button.disabled = true;
    if (status) {
      status.className = "admin-info";
      status.textContent = "Saving names to the shared database and verifying the saved values…";
    }

    try {
      await saveSharedTeamNames(names);
      if (status) {
        status.className = "admin-success";
        status.textContent = "Saved and verified. All visitors will now see these team names.";
      }
    } catch (error) {
      console.error("Could not save shared team names:", error);
      if (status) {
        status.className = "admin-warning";
        status.textContent = "Could not verify the shared save: " + (error?.message || "Unknown error");
      }
    } finally {
      button.disabled = false;
    }
  });



  /* ─────────────────────────────
     SAVE COMPETITION SETTING
  ───────────────────────────── */

  document
    .getElementById("adminSave")
    .addEventListener("click", async event => {
      const button = event.currentTarget;
      const desired = Number(slider.value);
      const status = document.getElementById("gamesPerTeamStatus");

      button.disabled = true;
      if (status) {
        status.className = "admin-info";
        status.textContent = "Saving season length to the shared database and verifying…";
      }

      try {
        await saveSharedGamesPerTeam(desired);
        renderAdminPage();
        const refreshedStatus = document.getElementById("gamesPerTeamStatus");
        if (refreshedStatus) {
          refreshedStatus.className = "admin-success";
          refreshedStatus.textContent = "Saved and verified. All visitors now use " + desired + " games per team.";
        }
      } catch (error) {
        console.error("Could not save shared competition settings:", error);
        if (status) {
          status.className = "admin-warning";
          status.textContent = "Could not verify the shared season-length save: " + (error?.message || "Unknown error");
        }
      } finally {
        button.disabled = false;
      }
    });


  /* ─────────────────────────────
     LOCK ADMIN
  ───────────────────────────── */

  document
    .getElementById(
      "adminLock"
    )
    .addEventListener(
      "click",
      () => {

        adminUnlocked = false;
        adminToken = "";

        renderAdminPage();

      }
    );

  document.querySelectorAll(".page-access-generate").forEach(button => {
    button.addEventListener("click", () => {
      const teamId = button.dataset.team;
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      const pinDisplay = document.getElementById("pageAccessPin" + teamId);
      const pinStoreKey = "team-editor-pins-v1";
      let savedPins = {};
      try { savedPins = JSON.parse(localStorage.getItem(pinStoreKey) || "{}") || {}; } catch {}
      savedPins[teamId] = { pin, updatedAt: new Date().toISOString() };
      try { localStorage.setItem(pinStoreKey, JSON.stringify(savedPins)); } catch {}
      const copyButton = document.querySelector('.page-access-copy[data-team="' + teamId + '"]');
      const status = document.getElementById("pageAccessStatus");
      if (pinDisplay) pinDisplay.textContent = pin;
      if (copyButton) { copyButton.disabled = false; copyButton.textContent = "COPY"; }
      button.textContent = "REGENERATE PIN";
      const badge = button.closest(".page-access-team")?.querySelector(".page-access-status");
      if (badge) { badge.textContent = "PIN READY"; badge.classList.add("is-demo"); }
      if (status) status.textContent = "PIN created for Team " + teamId + ". It works on this browser only until shared PIN storage is connected."; 
    });
  });

  document.querySelectorAll(".page-access-copy").forEach(button => {
    button.addEventListener("click", async () => {
      const teamId = button.dataset.team;
      const pinDisplay = document.getElementById("pageAccessPin" + teamId);
      const status = document.getElementById("pageAccessStatus");
      if (!pinDisplay || !/^\d{6}$/.test(pinDisplay.textContent.trim())) return;
      try {
        await navigator.clipboard.writeText(pinDisplay.textContent.trim());
        button.textContent = "COPIED";
        if (status) status.textContent = "PIN copied. Remember: this prototype stores PINs in this browser only."; 
      } catch (error) {
        if (status) status.textContent = "Clipboard access was blocked. Select the PIN and copy it manually."; 
      }
    });
  });

}
const ADMIN_TOKEN_SHA256 = "e6ef5b690136ed115a1f22323c86ba0316ffbf62118c83ae99cd192eff845d36";

async function unlockAdmin() {
  const input = document.getElementById("adminTokenInput");
  const error = document.getElementById("adminError");

  if (!input || !input.value.trim()) {
    if (error) error.textContent = "Enter your API admin token.";
    if (input) input.focus();
    return;
  }

  if (error) error.textContent = "Checking token…";

  try {
    const token = input.value.trim();
    const bytes = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");

    if (hash !== ADMIN_TOKEN_SHA256) {
      adminToken = "";
      adminUnlocked = false;
      if (error) error.textContent = "Invalid admin token.";
      input.focus();
      input.select();
      return;
    }

    // Keep the original token in memory for authenticated backend writes.
    adminToken = token;
    adminUnlocked = true;
    renderAdminPage();
  } catch (err) {
    if (error) {
      error.textContent = "Could not verify the token in this browser. Try reloading the page.";
    }
  }
}

/* =========================================================
   PAGE SYSTEM
========================================================= */

let currentPage =
  "home";


function showPage(
  pageName
) {
updateTeamNavNames();
  document
    .querySelectorAll(
      ".page"
    )
    .forEach(page => {

      page.classList.remove(
        "active-page"
      );

    });


  document
    .querySelectorAll(
      ".nav-button"
    )
    .forEach(button => {

      button.classList.remove(
        "active"
      );

    });


  const page =
    document.getElementById(
      `${pageName}-page`
    );


  const button =
    document.querySelector(
      `.nav-button[data-page="${pageName}"]`
    );


  if (
    !page ||
    !button
  ) {
    return;
  }


  page.classList.add(
    "active-page"
  );

  button.classList.add(
    "active"
  );


  currentPage =
    pageName;


  if (
    pageName !== "home" &&
    pageName !== "finals" &&
    pageName !== "admin"
  ) {
console.log("TEAM PAGE:", pageName, "→", getTeamNameFromPage(pageName));
    renderTeamPage(
      getTeamNameFromPage(
        pageName
      )
    );

  }


  if (
    pageName === "finals"
  ) {

    renderFinalsPage();

  }


  if (
    pageName === "admin"
  ) {

    renderAdminPage();

  }


  window.scrollTo({

    top: 0,

    behavior: "smooth"

  });

}


document
  .querySelectorAll(
    ".nav-button"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        showPage(
          button.dataset.page
        );

      }
    );

  });


/* =========================================================
   TEAM PAGES
========================================================= */

function getTeamMatches(
  teamName
) {

  const matches = [];


  getActiveRegularGames()
    .forEach(game => {

      if (
        !isPlayed(game)
      ) {
        return;
      }


      if (
        game.home !== teamName &&
        game.away !== teamName
      ) {
        return;
      }


      const isHome =
        game.home === teamName;


      const teamScore =
        Number(
          scores[game.id][
            isHome
              ? "home"
              : "away"
          ]
        );


      const opponentScore =
        Number(
          scores[game.id][
            isHome
              ? "away"
              : "home"
          ]
        );


      let result = "D";


      if (
        teamScore >
        opponentScore
      ) {
        result = "W";
      }

      else if (
        teamScore <
        opponentScore
      ) {
        result = "L";
      }


      matches.push({

        game: game.id,

        opponent:
          isHome
            ? game.away
            : game.home,

        teamScore,

        opponentScore,

        result,

        stage:
          game.stage

      });

    });


  return matches.sort(
    (a, b) =>
      a.game - b.game
  );

}


function getTeamEloHistory(
  teamName,
  eloRows
) {

  const history = [];


  eloRows.forEach(row => {

    if (
      row.scoreA === "" ||
      row.scoreB === ""
    ) {
      return;
    }


    if (
      row.teamA !== teamName &&
      row.teamB !== teamName
    ) {
      return;
    }


    const isTeamA =
      row.teamA === teamName;


    history.push({

      game:
        row.game,

      opponent:
        isTeamA
          ? row.teamB
          : row.teamA,

      teamScore:
        Number(
          isTeamA
            ? row.scoreA
            : row.scoreB
        ),

      opponentScore:
        Number(
          isTeamA
            ? row.scoreB
            : row.scoreA
        ),

      pre:
        isTeamA
          ? row.preA
          : row.preB,

      change:
        isTeamA
          ? row.changeA
          : row.changeB,

      post:
        isTeamA
          ? row.postA
          : row.postB

    });

  });


  return history;
}


function getTeamPageId(
  teamName
) {

  return (
    teamName
      .toLowerCase()
      .replace(" ", "-") +
    "-page"
  );

}


function getTeamNameFromPage(
  pageName
) {

  const letter =
    pageName
      .replace(
        "team-",
        ""
      )
      .toUpperCase();

  return `Team ${letter}`;

}


/* =========================================================
   TEAM PAGE
========================================================= */

function renderTeamPage(teamName) {
  console.log("RENDERING TEAM:", teamName);
  const container =
  document.getElementById(
    getTeamPageId(teamName)
  );

if (!container) {
  console.error(
    "Team page container not found:",
    getTeamPageId(teamName)
  );
  return;
}

  const elo = calculateElo();
  const ladder = calculateLadder(elo.finalRatings);
  const team = ladder.find(t => t.team === teamName);

  console.log("LOOKUP:", teamName);
  console.log("FOUND TEAM:", team);
  console.log("LADDER:", ladder.map(t => t.team));
  if (!team) {
    container.innerHTML = `
      <div class="card">
        <div class="empty">Team not found.</div>
      </div>
    `;
    return;
  }

  const matches = getTeamMatches(teamName);
  const eloHistory = getTeamEloHistory(teamName, elo.rows);

  /* ─────────────────────────
     ELO MOVEMENT
  ───────────────────────── */

  let eloMovement = `<span class="neutral">→ 0.0</span>`;

  if (team.latestEloChange > 0.000001) {
    eloMovement =
      `<span class="positive">↑ +${team.latestEloChange.toFixed(1)}</span>`;
  } else if (team.latestEloChange < -0.000001) {
    eloMovement =
      `<span class="negative">↓ ${team.latestEloChange.toFixed(1)}</span>`;
  }

  /* ─────────────────────────
     RECENT FORM
  ───────────────────────── */

  const formHTML = team.form.length
    ? team.form.map(form => {

        const resultClass =
          form.result === "W"
            ? "form-win"
            : form.result === "L"
            ? "form-loss"
            : "form-draw";

        return `
          <button
            class="team-form-item"
            onclick="jumpToGame(${form.game})"
          >
            <span class="form-result ${resultClass}">
              ${form.result}
            </span>

            <span class="team-form-game">
              GAME ${form.game}
            </span>

            <span class="team-form-opponent">
  vs ${escapeHTML(getTeamDisplayName(form.opponent))}
</span>

            <span class="team-form-score">
              ${form.scoreFor} – ${form.scoreAgainst}
            </span>
          </button>
        `;
      }).join("")
    : `
      <div class="empty">
        No completed games yet.
      </div>
    `;

  /* ─────────────────────────
     MATCH HISTORY
  ───────────────────────── */

  const matchHTML = matches.length
  ? matches.map(match => {

      const opponent =
  escapeHTML(getTeamDisplayName(match.opponent));
      const teamScore = match.teamScore;
      const opponentScore = match.opponentScore;

      let result = "D";

      if (Number(teamScore) > Number(opponentScore)) {
        result = "W";
      } else if (Number(teamScore) < Number(opponentScore)) {
        result = "L";
      }

        return `
  <div class="team-match-row">

    <div
      class="team-match-game"
      onclick="jumpToGame(${match.game})"
      style="cursor:pointer"
    >
      GAME ${match.game}
    </div>

    <div class="team-match-opponent">
      vs ${opponent}
    </div>

    <div class="team-match-score">
      ${teamScore} – ${opponentScore}
    </div>

    <div class="team-match-result">
      ${result}
    </div>

    <div class="team-match-stage">
      ${match.stage}
    </div>

  </div>
`;
      }).join("")
    : `
      <div class="empty">
        No completed games yet.
      </div>
    `;

  /* ─────────────────────────
     ELO HISTORY
  ───────────────────────── */

  const eloHistoryHTML = eloHistory.length
    ? eloHistory.map(row => {

        const change = Number(row.change);

        let changeHTML =
          `<span class="elo-zero">→ 0.0</span>`;

        if (change > 0.000001) {
          changeHTML =
            `<span class="elo-up">↑ +${change.toFixed(1)}</span>`;
        } else if (change < -0.000001) {
          changeHTML =
            `<span class="elo-down">↓ ${change.toFixed(1)}</span>`;
        }

        return `
          <button
            class="team-elo-row"
            onclick="jumpToGame(${row.game})"
          >
            <div class="team-elo-game">
              GAME ${row.game}
            </div>

            <div class="team-elo-opponent">
  vs ${escapeHTML(getTeamDisplayName(row.opponent))}
</div>

            <div class="team-elo-score">
              ${row.teamScore} – ${row.opponentScore}
            </div>

            <div class="team-elo-before">
              ${Number(row.pre).toFixed(1)}
            </div>

            <div class="team-elo-change">
              ${changeHTML}
            </div>

            <div class="team-elo-after">
              ${Number(row.post).toFixed(1)}
            </div>
          </button>
        `;
      }).join("")
    : `
      <div class="empty">
        No Elo history yet.
      </div>
    `;

  /* ─────────────────────────
     TEAM PAGE
  ───────────────────────── */

  container.innerHTML = `
    <div class="team-hero">

      <div class="team-page-label">
        TEAM PROFILE
      </div>

      <h1 class="team-page-name">
  ${escapeHTML(getTeamDisplayName(team.team))}
</h1>

      <div class="team-page-subtitle">
        Rank #${team.rank} · ${team.played} games played
      </div>

    </div>

    <div class="team-stat-grid">

      <div class="team-stat">
        <div class="team-stat-label">
          ELO
        </div>

        <div class="team-stat-value">
          ${team.elo.toFixed(1)}
        </div>

        <div>
          ${eloMovement}
        </div>
      </div>

            <div class="team-stat">
        <div class="team-stat-label">
          WINS
        </div>

        <div class="team-stat-value">
          ${team.wins}
        </div>
      </div>

      <div class="team-stat">
        <div class="team-stat-label">
          LOSSES
        </div>

        <div class="team-stat-value">
          ${team.losses}
        </div>
      </div>

      <div class="team-stat">
        <div class="team-stat-label">
          DRAWS
        </div>

        <div class="team-stat-value">
          ${team.draws}
        </div>
      </div>

      <div class="team-stat">
        <div class="team-stat-label">
          POINT DIFF
        </div>

        <div class="team-stat-value ${
          team.diff > 0
            ? "positive"
            : team.diff < 0
            ? "negative"
            : ""
        }">
          ${team.diff > 0 ? "+" : ""}${team.diff}
        </div>
      </div>

      <div class="team-stat">
        <div class="team-stat-label">
          WIN %
        </div>

        <div class="team-stat-value">
          ${(team.winPercent * 100).toFixed(1)}%
        </div>
      </div>

    </div>

    <div class="card">

      <div class="section-title">
        RECENT FORM
      </div>

      <h2>
        Last 5 Games
      </h2>

      <div class="team-form-large">
        ${formHTML}
      </div>

    </div>

    <div class="card">

      <div class="section-title">
        MATCH HISTORY
      </div>

      <h2>
        Completed Games
      </h2>

      <div class="team-match-history">
        ${matchHTML}
      </div>

    </div>

    <div class="card">

      <div class="section-title">
        ELO HISTORY
      </div>

      <h2>
        Rating Changes
      </h2>

      <div class="team-elo-history">
        ${eloHistoryHTML}
      </div>

    </div>
  `;
}
 

/* =========================================================
   CSV PARSER
========================================================= */


function parseCSV(text) {

  const rows = [];

  let row = [];
  let value = "";
  let insideQuotes = false;


  for (
    let i = 0;
    i < text.length;
    i++
  ) {

    const char =
      text[i];

    const next =
      text[i + 1];


    if (
      char === '"' &&
      insideQuotes &&
      next === '"'
    ) {

      value += '"';
      i++;

      continue;
    }


    if (
      char === '"'
    ) {

      insideQuotes =
        !insideQuotes;

      continue;
    }


    if (
      char === "," &&
      !insideQuotes
    ) {

      row.push(value);
      value = "";

      continue;
    }


    if (
      (
        char === "\n" ||
        char === "\r"
      ) &&
      !insideQuotes
    ) {

      if (
        char === "\r" &&
        next === "\n"
      ) {
        i++;
      }


      row.push(value);
      value = "";


      if (
        row.some(
          cell =>
            cell.trim() !== ""
        )
      ) {

        rows.push(row);

      }


      row = [];

      continue;

    }


    value += char;

  }


  if (
    value !== "" ||
    row.length > 0
  ) {

    row.push(value);


    if (
      row.some(
        cell =>
          cell.trim() !== ""
      )
    ) {

      rows.push(row);

    }

  }


  return rows;

}


/* =========================================================
   LOAD GOOGLE SHEET
========================================================= */

async function loadScoresFromSheet() {

  try {

    const response =
      await fetch(
        SHEET_URL +
        "&cacheBust=" +
        Date.now()
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    const csv =
      await response.text();


    const rows =
      parseCSV(csv);


    if (
      rows.length < 2
    ) {

      throw new Error(
        "No game data found"
      );

    }


    Object.keys(scores)
      .forEach(id => {

        delete scores[id];

      });


    rows
      .slice(1)
      .forEach(row => {

        if (
          !row ||
          row.length < 5
        ) {
          return;
        }


        const gameId =
          Number(
            String(
              row[0]
            ).trim()
          );


        if (
          !Number.isInteger(
            gameId
          )
        ) {
          return;
        }


        let game =
  games.find(
    g =>
      g.id === gameId
  );

if (!game) {

  game = {
    id: gameId,
    home: "",
    away: "",
    stage: "REGULAR"
  };

  games.push(game);
}


        /*
          IMPORTANT:
          Read team names from the Sheet too.
        */

        const sheetHome =
          String(
            row[1] ?? ""
          ).trim();


        const sheetAway =
          String(
            row[3] ?? ""
          ).trim();
          const sheetStage =
             String(
             row[5] ?? "REGULAR"
            )
            .trim()
            .toUpperCase();

game.stage =
  sheetStage || "REGULAR";

game.referee =
  String(row[6] ?? "").trim();

        if (
          sheetHome !== ""
        ) {

          game.home =
            sheetHome;

        }


        if (
          sheetAway !== ""
        ) {

          game.away =
            sheetAway;

        }


        const homeScore =
          String(
            row[2] ?? ""
          ).trim();


        const awayScore =
          String(
            row[4] ?? ""
          ).trim();


        if (
          homeScore === "" ||
          awayScore === ""
        ) {
          return;
        }


        const homeNumber =
          Number(homeScore);


        const awayNumber =
          Number(awayScore);


        if (
          !Number.isFinite(
            homeNumber
          ) ||
          !Number.isFinite(
            awayNumber
          )
        ) {
          return;
        }


        scores[gameId] = {

          home:
            homeNumber,

          away:
            awayNumber

        };

      });


    calculate();
    renderGames();
    renderFinalsPage();

    showSheetStatus(true);


  }

  catch (error) {

    console.error(
      "Could not load Google Sheet:",
      error
    );


    calculate();
    renderGames();
    renderFinalsPage();

    showSheetStatus(false);

  }

}


/* =========================================================
   SHEET STATUS
========================================================= */

function showSheetStatus(
  connected
) {

  let status =
    document.getElementById(
      "sheet-status"
    );


  if (!status) {

    status =
      document.createElement(
        "div"
      );

    status.id =
      "sheet-status";

    status.style.textAlign =
      "center";

    status.style.fontSize =
      "12px";

    status.style.marginTop =
      "10px";

    status.style.opacity =
      "0.7";


    const gamesContainer =
      document.getElementById(
        "games"
      );


    if (gamesContainer) {

      gamesContainer
        .parentElement
        .appendChild(
          status
        );

    }

    else {

      document.body
        .appendChild(
          status
        );

    }

  }


  if (connected) {

    status.textContent =
      "● LIVE RESULTS • Google Sheets";

    status.style.color =
      "#52d273";

  }

  else {

    status.textContent =
      "● RESULTS SOURCE UNAVAILABLE";

    status.style.color =
      "#ff5964";

  }

}


/* =========================================================
   MAIN CALCULATION
========================================================= */

function calculate() {

  const elo =
    calculateElo();


  const ladder =
    calculateLadder(
      elo.finalRatings
    );


  renderLadder(
    ladder
  );


  renderEloTable(
    elo.rows
  );


  updateGameResults();


  if (
    currentPage !== "home" &&
    currentPage !== "finals" &&
    currentPage !== "admin"
  ) {

    renderTeamPage(
      getTeamNameFromPage(
        currentPage
      )
    );

  }

}


/* =========================================================
   START
========================================================= */

renderAdminPage();
loadScoresFromSheet();
loadCommunitySettings();
loadSharedCompetitionSettings();
