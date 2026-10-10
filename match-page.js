let matchCentreFilter = "all", selectedMatchId = null;
function matchRound(g) {
 const a=getActiveRegularGames(), i=a.findIndex(x=>Number(x.id)===Number(g.id));
 if(i<0)return "Finals";
 const r=Math.floor(i/2)%5+1,c=Math.floor(i/10)+1;
 return "Round "+r+(c>1?" · Cycle "+c:"");
}
function matchScore(g){return isPlayed(g)?{home:Number(scores[g.id].home),away:Number(scores[g.id].away)}:null}
function matchWinner(g){const s=matchScore(g);return !s?"":s.home>s.away?g.home:s.away>s.home?g.away:"Draw"}
function teamResult(g,t){const s=matchScore(g);if(!s)return "";const a=g.home===t?s.home:s.away,b=g.home===t?s.away:s.home;return a>b?"W":a<b?"L":"D"}
function matchElo(g){return calculateElo().rows.find(r=>Number(r.game)===Number(g.id))||null}
function recentMatches(t){return getActiveRegularGames().filter(g=>isPlayed(g)&&(g.home===t||g.away===t)).sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,5).reverse()}
function formMarkup(t,list){
 if(!list.length)return '<div class="match-muted">No completed matches recorded.</div>';
 return '<div class="match-form-list">'+list.map(g=>'<button class="match-form-chip '+(teamResult(g,t)==="W"?"form-win":teamResult(g,t)==="L"?"form-loss":"form-draw")+'" onclick="openMatchDetail('+Number(g.id)+')" type="button"><b>'+teamResult(g,t)+'</b><small>G'+Number(g.id)+'</small></button>').join("")+'</div>';
}
function renderMatchCentre(){
 const page=document.getElementById("matches-page");if(!page)return;
 if(selectedMatchId!==null){renderMatchDetail(selectedMatchId);return}
 const all=getActiveRegularGames(),visible=all.filter(g=>matchCentreFilter==="played"?isPlayed(g):matchCentreFilter==="upcoming"?!isPlayed(g):true);
 let rows="";
 visible.forEach(g=>{
  const s=matchScore(g),w=matchWinner(g),e=matchElo(g),num=all.findIndex(x=>x.id===g.id)+1;
  rows+='<button class="match-centre-row" type="button" onclick="openMatchDetail('+Number(g.id)+')"><span class="match-centre-number"><b>GAME '+num+'</b><small>'+escapeHTML(matchRound(g))+'</small></span><span class="match-centre-teams"><span class="'+(w===g.home?"match-team-winner":"")+'">'+escapeHTML(getTeamDisplayName(g.home||"TBD"))+'<b>'+(s?s.home:"–")+'</b></span><span class="'+(w===g.away?"match-team-winner":"")+'">'+escapeHTML(getTeamDisplayName(g.away||"TBD"))+'<b>'+(s?s.away:"–")+'</b></span>'+(g.referee?'<small>REFEREE · '+escapeHTML(getTeamDisplayName(g.referee))+'</small>':"")+'</span><span class="match-centre-summary"><b class="'+(s?"match-status-played":"match-status-upcoming")+'">'+(s?(w==="Draw"?"DRAW":"FINAL"):"UPCOMING")+'</b><small>'+(s&&e?"Elo "+e.preA.toFixed(0)+" → "+e.postA.toFixed(0):"View match details")+'</small></span><span class="match-open-arrow">›</span></button>';
 });
 page.innerHTML='<div class="match-page-heading"><div><div class="section-title">COMPETITION</div><h1 class="match-page-title">Match Centre</h1><p class="match-page-subtitle">Fixtures, results and rating changes from the live Google Sheet.</p></div><div class="match-count"><strong>'+all.filter(isPlayed).length+'</strong><span>of '+all.length+' played</span></div></div><section class="card"><div class="match-toolbar"><div><div class="section-title">FIXTURES & RESULTS</div><h2>Regular season</h2></div><div class="match-filters"><button class="match-filter '+(matchCentreFilter==="all"?"active":"")+'" data-filter="all">All</button><button class="match-filter '+(matchCentreFilter==="played"?"active":"")+'" data-filter="played">Results</button><button class="match-filter '+(matchCentreFilter==="upcoming"?"active":"")+'" data-filter="upcoming">Upcoming</button></div></div><div class="match-centre-list">'+(rows||'<div class="empty">No matches match this filter.</div>')+'</div></section>';
 page.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",()=>{matchCentreFilter=b.dataset.filter;renderMatchCentre()}));
}
function openMatchDetail(id){if(!games.some(g=>Number(g.id)===Number(id)))return;selectedMatchId=Number(id);showPage("matches");renderMatchDetail(id)}
function renderMatchDetail(id){
 const page=document.getElementById("matches-page"),g=games.find(x=>Number(x.id)===Number(id));if(!page||!g){selectedMatchId=null;renderMatchCentre();return}
 const s=matchScore(g),w=matchWinner(g),e=matchElo(g),home=getTeamDisplayName(g.home||"TBD"),away=getTeamDisplayName(g.away||"TBD");
 const meetings=getActiveRegularGames().filter(x=>isPlayed(x)&&((x.home===g.home&&x.away===g.away)||(x.home===g.away&&x.away===g.home))).sort((a,b)=>Number(a.id)-Number(b.id));
 let hw=0,aw=0,d=0;meetings.forEach(x=>{const z=matchWinner(x);if(z==="Draw")d++;else if(z===g.home)hw++;else if(z===g.away)aw++});
 const recentH=recentMatches(g.home),recentA=recentMatches(g.away),hc=s&&e?e.changeA:null,ac=s&&e?e.changeB:null;
 const ch=v=>v===null?"Pending":(v>0?"+":"")+v.toFixed(2);
 const history=meetings.slice(-4).reverse().map(x=>{const z=matchScore(x),win=matchWinner(x);return '<button onclick="openMatchDetail('+Number(x.id)+')" type="button"><span>GAME '+Number(x.id)+'</span><b>'+z.home+' – '+z.away+'</b><small>'+(win==="Draw"?"DRAW":escapeHTML(getTeamDisplayName(win))+" WON")+'</small></button>'}).join("");
 page.innerHTML='<div class="match-detail-topline"><button id="matchBack" class="match-back-button">‹ ALL MATCHES</button><span class="match-detail-status '+(s?"match-status-played":"match-status-upcoming")+'">'+(s?(w==="Draw"?"MATCH DRAWN":"MATCH COMPLETE"):"AWAITING RESULT")+'</span></div>'+
 '<section class="match-detail-hero card"><div class="section-title">'+escapeHTML(normalizeStage(g.stage)||"REGULAR")+' SEASON</div><div class="match-detail-meta">GAME '+Number(g.id)+' · '+escapeHTML(matchRound(g))+(g.referee?' · REFEREE: '+escapeHTML(getTeamDisplayName(g.referee)):"")+'</div><div class="match-scoreboard"><div class="match-detail-team '+(s&&w===g.home?"match-detail-winner":"")+'"><span class="match-team-initial">'+escapeHTML(String(g.home||"?").slice(-1))+'</span><h2>'+escapeHTML(home)+'</h2><div class="match-team-rating">'+(e?(s?e.postA:e.preA).toFixed(2):START_ELO.toFixed(2))+'<small>ELO '+(s?"AFTER":"BEFORE")+'</small></div></div><div class="match-detail-score"><div class="match-score-numbers"><span>'+(s?s.home:"–")+'</span><i>:</i><span>'+(s?s.away:"–")+'</span></div><div class="match-score-caption">'+(s?(w==="Draw"?"DRAW":escapeHTML(getTeamDisplayName(w))+" WON"):"VS")+'</div></div><div class="match-detail-team '+(s&&w===g.away?"match-detail-winner":"")+'"><span class="match-team-initial">'+escapeHTML(String(g.away||"?").slice(-1))+'</span><h2>'+escapeHTML(away)+'</h2><div class="match-team-rating">'+(e?(s?e.postB:e.preB).toFixed(2):START_ELO.toFixed(2))+'<small>ELO '+(s?"AFTER":"BEFORE")+'</small></div></div></div></section>'+
 '<div class="match-detail-grid"><section class="card"><div class="section-title">RATING CHANGE</div><h2>Elo before & after</h2><div class="match-elo-table"><div class="match-elo-head"><span>TEAM</span><span>BEFORE</span><span>CHANGE</span><span>AFTER</span></div><div><span>'+escapeHTML(home)+'</span><b>'+(e?e.preA.toFixed(2):"—")+'</b><b class="'+(hc===null?"":hc>=0?"positive":"negative")+'">'+ch(hc)+'</b><b>'+(s&&e?e.postA.toFixed(2):"—")+'</b></div><div><span>'+escapeHTML(away)+'</span><b>'+(e?e.preB.toFixed(2):"—")+'</b><b class="'+(ac===null?"":ac>=0?"positive":"negative")+'">'+ch(ac)+'</b><b>'+(s&&e?e.postB.toFixed(2):"—")+'</b></div></div><p class="match-footnote">'+(s?"Uses the dashboard’s existing Elo calculation.":"Elo changes appear when both scores are recorded in Google Sheets.")+'</p></section>'+
 '<section class="card"><div class="section-title">HEAD-TO-HEAD</div><h2>Previous meetings</h2><div class="h2h-score"><b>'+hw+'</b><span>WINS</span><i>:</i><b>'+aw+'</b><span>WINS</span></div><div class="h2h-subline">'+d+' draw'+(d===1?"":"s")+' · '+meetings.length+' completed meeting'+(meetings.length===1?"":"s")+' this regular season</div><div class="h2h-history">'+(history||'<div class="match-muted">No previous completed meetings.</div>')+'</div></section>'+
 '<section class="card"><div class="section-title">RECENT FORM</div><h2>'+escapeHTML(home)+'</h2>'+formMarkup(g.home,recentH)+'</section><section class="card"><div class="section-title">RECENT FORM</div><h2>'+escapeHTML(away)+'</h2>'+formMarkup(g.away,recentA)+'</section></div>';
 document.getElementById("matchBack").addEventListener("click",()=>{selectedMatchId=null;renderMatchCentre()});
}
document.addEventListener("DOMContentLoaded",renderMatchCentre);
