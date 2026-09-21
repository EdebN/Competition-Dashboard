const TEAMS = [
  "Team A",
  "Team B",
  "Team C",
  "Team D"
];

const START_ELO = 1000;
const K = 25;

const MIN_GAMES_PER_TEAM = 3;
const MAX_GAMES_PER_TEAM = 12;
const DEFAULT_GAMES_PER_TEAM = 6;

const FINALS_COUNT = 4;

const ADMIN_PIN = "298562";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQNDPHaocEHFaoAeVmME_8x_k3ZGSCd5hYkKhh9wIldd1brzVR3FjCordF2AwmY4lzPLml61HCyDPFj/pub?output=csv";


/* =========================================================
   LOCAL COMPETITION SETTINGS
========================================================= */

function getGamesPerTeam() {
  const saved = Number(localStorage.getItem("ultimate_games_per_team"));

  if (
    Number.isInteger(saved) &&
    saved >= MIN_GAMES_PER_TEAM &&
    saved <= MAX_GAMES_PER_TEAM
  ) {
    return saved;
  }

  return DEFAULT_GAMES_PER_TEAM;
}

function setGamesPerTeam(value) {
  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number < MIN_GAMES_PER_TEAM ||
    number > MAX_GAMES_PER_TEAM
  ) {
    return;
  }

  localStorage.setItem("ultimate_games_per_team", number);
}

/* ─────────────────────────────────────
   TEAM DISPLAY NAMES
   Internal IDs stay Team A–D.
   These names are display-only.
───────────────────────────────────── */

function getTeamNames() {
  const defaults = {
    "Team A": "Team A",
    "Team B": "Team B",
    "Team C": "Team C",
    "Team D": "Team D"
  };

  const saved = localStorage.getItem("ultimate_team_names");

  if (!saved) return defaults;

  try {
    const parsed = JSON.parse(saved);

    TEAMS.forEach(team => {
      const value = String(parsed[team] ?? "").trim();
      defaults[team] = value || team;
    });

    return defaults;
  } catch {
    return defaults;
  }
}

function setTeamNames(names) {
  const cleaned = {};

  TEAMS.forEach(team => {
    const value = String(names[team] ?? "").trim();
    cleaned[team] = value || team;
  });

  localStorage.setItem(
    "ultimate_team_names",
    JSON.stringify(cleaned)
  );
}

function getTeamDisplayName(team) {
  if (!team) return "";
  return getTeamNames()[team] || team;
}
function updateTeamNavNames() {
  const names = getTeamNames();

  const navMap = {
    "team-a": "Team A",
    "team-b": "Team B",
    "team-c": "Team C",
    "team-d": "Team D"
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

  const cycle = [
    ["Team A", "Team B"],
    ["Team C", "Team D"],

    ["Team A", "Team C"],
    ["Team B", "Team D"],

    ["Team A", "Team D"],
    ["Team B", "Team C"]
  ];

  let gameId = 1;

  while (
    fixtures.length <
    MAX_GAMES_PER_TEAM *
    TEAMS.length /
    2
  ) {

    for (
      const matchup of cycle
    ) {

      if (
        fixtures.length >=
        MAX_GAMES_PER_TEAM *
        TEAMS.length /
        2
      ) {
        break;
      }

      fixtures.push({
        id: gameId,
        home: matchup[0],
        away: matchup[1],
        stage: "REGULAR"
      });

      gameId++;
    }
  }

  for (
    let i = 0;
    i < FINALS_COUNT;
    i++
  ) {

    fixtures.push({
      id:
        gameId + i,
      home: "",
      away: "",
      stage:
        i === FINALS_COUNT - 1
          ? "GRAND FINAL"
          : "FINAL"
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
  ${getTeamDisplayName(team.team)}
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
                      title="Game ${result.game}: ${getTeamDisplayName(team.team)} vs ${getTeamDisplayName(result.opponent)}"
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
  ${getTeamDisplayName(game.home)}
</span>

<span class="versus">
  VS
</span>

<span class="team-away">
  ${getTeamDisplayName(game.away)}
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
  ${getTeamDisplayName(row.teamA)}
</td>

        <td>
          ${
            row.scoreA === ""
              ? "–"
              : row.scoreA
          }
        </td>

        <td class="team-name">
  ${getTeamDisplayName(row.teamB)}
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

  const final1 =
    finals.find(
      game => game.id === 25
    );

  const final2 =
    finals.find(
      game => game.id === 26
    );

  const final3 =
    finals.find(
      game => game.id === 27
    );

  const grandFinal =
    finals.find(
      game => game.id === 28
    );


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
    ${displayTeam}
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
    ${getTeamDisplayName(winner)} won
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

        <div class="section-title">
          ADMINISTRATION
        </div>

        <h2>
          Admin access
        </h2>

        <div class="admin-lock">

          <label
            class="admin-label"
            for="adminPin"
          >
            ADMIN PIN
          </label>

          <input
            id="adminPin"
            class="admin-input"
            type="password"
            inputmode="numeric"
            autocomplete="off"
            placeholder="Enter PIN"
          >

          <button
            class="admin-button"
            id="adminUnlock"
          >
            UNLOCK
          </button>

          <div
            id="adminError"
            class="admin-error"
          ></div>

        </div>

      </section>

    `;


    document
      .getElementById(
        "adminUnlock"
      )
      .addEventListener(
        "click",
        unlockAdmin
      );


    document
      .getElementById(
        "adminPin"
      )
      .addEventListener(
        "keydown",
        event => {

          if (
            event.key === "Enter"
          ) {
            unlockAdmin();
          }

        }
      );


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
                value="${teamNames["Team A"]}"
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
                value="${teamNames["Team B"]}"
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
                value="${teamNames["Team C"]}"
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
                value="${teamNames["Team D"]}"
              >

            </div>

          </div>


          <div class="admin-info">

            These names are displayed on the
            dashboard only. The Google Sheet and
            internal team IDs remain unchanged.

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
            games each team plays.

            This setting is stored only in
            this browser.

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

  `;


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

  document
    .getElementById(
      "adminSaveNames"
    )
    .addEventListener(
      "click",
      () => {

        setTeamNames({

          "Team A":
            document.getElementById(
              "teamNameA"
            ).value,

          "Team B":
            document.getElementById(
              "teamNameB"
            ).value,

          "Team C":
            document.getElementById(
              "teamNameC"
            ).value,

          "Team D":
            document.getElementById(
              "teamNameD"
            ).value

        });


        calculate();
        renderGames();
        renderFinalsPage();
        renderAdminPage();

      }
    );


  /* ─────────────────────────────
     SAVE COMPETITION SETTING
  ───────────────────────────── */

  document
    .getElementById(
      "adminSave"
    )
    .addEventListener(
      "click",
      () => {

        setGamesPerTeam(
          slider.value
        );

        calculate();
        renderGames();
        renderFinalsPage();
        renderAdminPage();

      }
    );


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

        adminUnlocked =
          false;

        renderAdminPage();

      }
    );

}
function unlockAdmin() {

  const input =
    document.getElementById(
      "adminPin"
    );

  const error =
    document.getElementById(
      "adminError"
    );


  if (
    input.value ===
    ADMIN_PIN
  ) {

    adminUnlocked =
      true;

    renderAdminPage();

  }

  else {

    error.textContent =
      "Incorrect PIN.";

    input.value = "";

    input.focus();

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
  vs ${getTeamDisplayName(form.opponent)}
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
  getTeamDisplayName(match.opponent);
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
  vs ${getTeamDisplayName(row.opponent)}
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
  ${getTeamDisplayName(team.team)}
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
