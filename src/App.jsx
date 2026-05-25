import { useState, useMemo, useCallback, useRef, useEffect } from "react";

// ─── constants ────────────────────────────────────────────────────────────────
const VIDEO_EXT = new Set(["mkv","mp4","avi","mov","wmv","m4v","ts","m2ts","mpg","mpeg"]);
const MEDIA_EXT = new Set([...VIDEO_EXT,"flac","vob","srt","sub","ass","idx","nfo","jpg","png"]);
const SUB_EXT   = new Set(["srt","sub","ass","ssa","idx"]);
const sleep     = ms => new Promise(r => setTimeout(r, ms));
const API = typeof window !== "undefined" && window.location.hostname !== "localhost"
  ? `${window.location.protocol}//${window.location.host}/api`
  : "http://localhost:3001/api";

// ─── SQLite API client ────────────────────────────────────────────────────────
const db = {
  stats:        ()          => fetch(`${API}/stats`).then(r=>r.json()).catch(()=>null),
  getCache:     ()          => fetch(`${API}/cache`).then(r=>r.json()).catch(()=>({})),
  getCacheOne:  (id)        => fetch(`${API}/cache/${encodeURIComponent(id)}`).then(r=>r.json()).catch(()=>null),
  saveCache:    (id,data)   => fetch(`${API}/cache`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,data})}).catch(()=>{}),
  delCache:     (id)        => fetch(`${API}/cache/${encodeURIComponent(id)}`,{method:"DELETE"}).catch(()=>{}),
  getSeasons:   ()          => fetch(`${API}/seasons`).then(r=>r.json()).catch(()=>({})),
  getSeason:    (id)        => fetch(`${API}/seasons/${encodeURIComponent(id)}`).then(r=>r.json()).catch(()=>null),
  saveSeason:   (id,data)   => fetch(`${API}/seasons`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,data})}).catch(()=>{}),
  delSeason:    (id)        => fetch(`${API}/seasons/${encodeURIComponent(id)}`,{method:"DELETE"}).catch(()=>{}),
  getOverrides: ()          => fetch(`${API}/overrides`).then(r=>r.json()).catch(()=>({})),
  saveOverride: (key,imdbId)=> fetch(`${API}/overrides`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key,imdbId})}).catch(()=>{}),
  delOverride:  (key)       => fetch(`${API}/overrides/${encodeURIComponent(key)}`,{method:"DELETE"}).catch(()=>{}),
  getSetting:   (key)       => fetch(`${API}/settings/${key}`).then(r=>r.json()).catch(()=>null),
  saveSetting:  (key,value) => fetch(`${API}/settings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key,value})}).catch(()=>{}),
  exportAll:    ()          => window.open(`${API}/export`,"_blank"),
  importAll:    (data)      => fetch(`${API}/import`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}).then(r=>r.json()),
  clearAll:     ()          => fetch(`${API}/clear`,{method:"DELETE"}).then(r=>r.json()),
};

// ─── AniList API ──────────────────────────────────────────────────────────────
const ANILIST_QUERY = `
query($search:String){Media(search:$search,type:ANIME){id title{romaji english}episodes
coverImage{large}averageScore genres description startDate{year}status
externalLinks{site url}}}`;

async function anilistSearch(title) {
  try {
    const r = await fetch("https://graphql.anilist.co", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({query:ANILIST_QUERY, variables:{search:title}})
    });
    const d = await r.json();
    const m = d?.data?.Media;
    if (!m) return null;
    return {
      Title:      m.title.english || m.title.romaji,
      Year:       m.startDate?.year?.toString() || "N/A",
      imdbRating: m.averageScore ? (m.averageScore/10).toFixed(1) : "N/A",
      Poster:     m.coverImage?.large || "N/A",
      Plot:       m.description?.replace(/<[^>]*>/g,"") || "N/A",
      Genre:      m.genres?.slice(0,3).join(", ") || "N/A",
      totalSeasons:"1",
      totalEpisodes: m.episodes,
      imdbID:     null,
      anilistId:  m.id,
      anilistUrl: `https://anilist.co/anime/${m.id}`,
      Type:       "series",
      _source:    "anilist",
    };
  } catch { return null; }
}

// ─── themes ───────────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    "--bg":"#07090c","--bg2":"#0d1117","--bg3":"#0a0f18","--surface":"#060910",
    "--border":"#1a2230","--border2":"#0d1520","--text":"#c8d0da","--text2":"#6a7a8a",
    "--text3":"#3a4a5a","--text4":"#1e2838","--accent":"#f5c518","--accent2":"#5a4800",
    "--green":"#4ade80","--red":"#f87171","--blue":"#60a5fa","--overlay":"#000000aa",
  },
  light: {
    "--bg":"#f0f4f8","--bg2":"#ffffff","--bg3":"#e8edf2","--surface":"#f8fafc",
    "--border":"#d0d8e4","--border2":"#e4eaf0","--text":"#1a2230","--text2":"#4a5a6a",
    "--text3":"#8a9aaa","--text4":"#c0cad4","--accent":"#d4a000","--accent2":"#f5e080",
    "--green":"#16a34a","--red":"#dc2626","--blue":"#2563eb","--overlay":"#00000066",
  },
  amoled: {
    "--bg":"#000000","--bg2":"#0a0a0a","--bg3":"#050505","--surface":"#000000",
    "--border":"#1a1a1a","--border2":"#111111","--text":"#e0e0e0","--text2":"#606060",
    "--text3":"#303030","--text4":"#181818","--accent":"#f5c518","--accent2":"#3a3000",
    "--green":"#00e676","--red":"#ff5252","--blue":"#448aff","--overlay":"#000000cc",
  },
  nord: {
    "--bg":"#2e3440","--bg2":"#3b4252","--bg3":"#434c5e","--surface":"#242932",
    "--border":"#4c566a","--border2":"#3b4252","--text":"#eceff4","--text2":"#d8dee9",
    "--text3":"#8090a0","--text4":"#4c566a","--accent":"#88c0d0","--accent2":"#2e5060",
    "--green":"#a3be8c","--red":"#bf616a","--blue":"#81a1c1","--overlay":"#00000099",
  },
};

// ─── quality / audio helpers ──────────────────────────────────────────────────
function parseQuality(fn) {
  const f = fn.toUpperCase();
  if (f.includes("2160P")||f.includes("4K")||f.includes("UHD")) return "4K";
  if (f.includes("1080P")||f.includes("1080I")||f.includes("FHD")) return "1080p";
  if (f.includes("720P")||f.includes("HD")) return "720p";
  if (f.includes("480P")||f.includes("SD")) return "480p";
  return null;
}
function parseAudio(fn) {
  const f = fn.toUpperCase();
  if (f.includes("TRUEHD")||f.includes("TRUE-HD")) return "TrueHD";
  if (f.includes("DTS-HD")||f.includes("DTSHD")) return "DTS-HD";
  if (f.includes("DTS")) return "DTS";
  if (f.includes("FLAC")) return "FLAC";
  if (f.includes("EAC3")||f.includes("E-AC3")||f.includes("ATMOS")) return "EAC3";
  if (f.includes("AAC")) return "AAC";
  if (f.includes("AC3")||f.includes("DD5")||f.includes("DOLBY")) return "AC3";
  if (f.includes("MP3")) return "MP3";
  return null;
}
function parseVideoCodec(fn) {
  const f = fn.toUpperCase();
  if (f.includes("X265")||f.includes("H265")||f.includes("HEVC")) return "x265";
  if (f.includes("X264")||f.includes("H264")||f.includes("AVC")) return "x264";
  if (f.includes("AV1")) return "AV1";
  return null;
}

// ─── sample ───────────────────────────────────────────────────────────────────
const SAMPLE = `   4831838976 2024-01-10 14:23:11.000000000 Breaking Bad/Season 1/Breaking Bad - S01E01 - Pilot.mkv
   5012345678 2024-01-10 14:23:11.000000000 Breaking Bad/Season 1/Breaking Bad - S01E02 - Cats in the Bag.mkv
   4912345678 2024-01-10 14:23:11.000000000 Breaking Bad/Season 1/Breaking Bad - S01E03 - River.mkv
   5112345678 2024-01-10 14:23:11.000000000 Breaking Bad/Season 1/Breaking Bad - S01E05 - Gray Matter.mkv
   5200000000 2024-01-10 14:23:11.000000000 Breaking Bad/Season 2/Breaking Bad - S02E01 - Seven Thirty-Seven.mkv
   5300000000 2024-01-10 14:23:11.000000000 Breaking Bad/Season 2/Breaking Bad - S02E03 - Bit by a Dead Bee.mkv
   6100000000 2024-01-10 14:23:11.000000000 The Wire/Season 1/The Wire - S01E01 - The Target.mkv
   6200000000 2024-01-10 14:23:11.000000000 The Wire/Season 1/The Wire - S01E02 - The Detail.mkv
   6300000000 2024-01-10 14:23:11.000000000 The Wire/Season 1/The Wire - S01E03 - The Buys.mkv
   6600000000 2024-01-10 14:23:11.000000000 The Wire/Season 2/The Wire - S02E01 - Ebb Tide.mkv
   5500000000 2024-01-10 14:23:11.000000000 Succession/Season 1/Succession - S01E01 - Celebration.mkv
   5600000000 2024-01-10 14:23:11.000000000 Succession/Season 1/Succession - S01E02 - Shit Show.mkv
   5800000000 2024-01-10 14:23:11.000000000 Succession/Season 2/Succession - S02E01 - Summer Palace.mkv
   5800000000 2024-01-10 14:23:11.000000000 Succession/Season 2/Succession.S02E01.Summer.Palace.1080p.BluRay.FLAC.mkv
  12300000000 2024-01-10 14:23:11.000000000 Movies/Dune Part Two (2024).mkv
  15400000000 2024-01-10 14:23:11.000000000 Movies/Oppenheimer (2023).mkv
   9800000000 2024-01-10 14:23:11.000000000 Movies/Past Lives (2023).mkv`;

// ─── parse helpers ────────────────────────────────────────────────────────────
function formatBytes(b) {
  if (!b) return "\u2014";
  const u=["B","KB","MB","GB","TB"]; let i=0,v=b;
  while(v>=1024&&i<4){v/=1024;i++;}
  return `${v.toFixed(i===0?0:2)} ${u[i]}`;
}

function parseLine(line) {
  line=line.trim(); if(!line) return null;
  let size=null,path=null;
  const lsl=line.match(/^\s*(\d+)\s+\d{4}-\d{2}-\d{2}\s+[\d:.]+\s+(.+)$/);
  if(lsl){size=parseInt(lsl[1],10);path=lsl[2].trim();}
  else{const lsf=line.match(/^(\d+)\s+(.+)$/);if(lsf&&!lsf[2].match(/^\d{4}-\d{2}-\d{2}/)){size=parseInt(lsf[1],10);path=lsf[2].trim();}else path=line;}
  if(!path) return null;
  const ext=path.split(".").pop().toLowerCase();
  if(!MEDIA_EXT.has(ext)) return null;
  const fn=path.split('/').pop();
  return {size,path,ext,quality:parseQuality(fn),audio:parseAudio(fn),codec:parseVideoCodec(fn)};
}

function parseEpisode(fn) {
  const m1=fn.match(/[Ss](\d{1,2})\s*[._]?\s*[Ee](\d{1,3})/);
  if(m1) return {season:parseInt(m1[1],10),episode:parseInt(m1[2],10)};
  const m2=fn.match(/(?:[-\s_])0*(\d{1,3})(?:\s*(?:\(|\[|_|-|$))/);
  if(m2&&parseInt(m2[1],10)>0) return {season:1,episode:parseInt(m2[1],10)};
  return null;
}

function deriveShow(path) {
  const parts=path.split(/[\/\\]/);
  if(parts.length>=2) return parts[0].replace(/\s*\(\d{4}\)/,"").trim();
  const fn=parts[parts.length-1];
  const m=fn.match(/^(.+?)\s*[Ss]\d+\s*[._]?\s*[Ee]\d+/);
  if(m) return m[1].replace(/[._]/g," ").trim();
  return "Unknown";
}

function parseFiles(text) {
  const lines=text.split(/\r?\n/);
  const shows={};const movies=[];let totalSize=0,totalFiles=0;
  // Track subtitles separately first
  const subFiles=new Set();
  const subMap={};  // "show:S01E01" => true

  for(const line of lines){
    const f=parseLine(line); if(!f) continue;
    if(SUB_EXT.has(f.ext)){
      subFiles.add(f.path);
      // Try to link subtitle to episode
      const fn=f.path.split('/').pop();
      const ep=parseEpisode(fn);
      const show=deriveShow(f.path);
      if(ep) subMap[`${show}:S${ep.season}E${ep.episode}`]=true;
      continue;
    }
    totalFiles++; if(f.size)totalSize+=f.size;
    const ep=parseEpisode(f.path.split('/').pop());
    if(ep){
      const show=deriveShow(f.path);
      if(!shows[show])shows[show]={name:show,episodes:[],size:0};
      shows[show].episodes.push({...ep,size:f.size,path:f.path,quality:f.quality,audio:f.audio,codec:f.codec});
      if(f.size)shows[show].size+=f.size;
    } else if(VIDEO_EXT.has(f.ext)) movies.push({path:f.path,size:f.size,quality:f.quality,audio:f.audio,codec:f.codec,omdb:null});
  }

  const showList=Object.values(shows).map(show=>{
    const byS={};
    // Detect duplicates
    const epCount={};
    for(const ep of show.episodes){
      const k=`S${ep.season}E${ep.episode}`;
      epCount[k]=(epCount[k]||0)+1;
      if(!byS[ep.season])byS[ep.season]=new Set();
      byS[ep.season].add(ep.episode);
    }
    const duplicates=Object.entries(epCount).filter(([,v])=>v>1).map(([k])=>k);
    const seasons=[];
    for(const[s,epSet]of Object.entries(byS)){
      const sn=parseInt(s,10);
      seasons.push({season:sn,have:epSet,count:epSet.size,max:Math.max(...epSet),min:Math.min(...epSet)});
    }
    seasons.sort((a,b)=>a.season-b.season);
    // Quality summary for show
    const qualities=[...new Set(show.episodes.map(e=>e.quality).filter(Boolean))];
    const audios=[...new Set(show.episodes.map(e=>e.audio).filter(Boolean))];
    // Subtitle presence
    const hasSubs=false; // computed in ShowTile
    return {...show,seasons,episodeCount:show.episodes.length,omdb:null,omdbStatus:"idle",
      duplicates,qualities,audios,subMap,isAnime:false};
  });
  showList.sort((a,b)=>a.name.localeCompare(b.name));
  return{showList,movies,totalSize,totalFiles,subMap};
}

// ─── OMDb ─────────────────────────────────────────────────────────────────────
async function omdbRaw(p,k){const r=await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(k)}&${new URLSearchParams(p)}`);if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}
async function omdbGet(p,k){const d=await omdbRaw(p,k);if(d.Response==="False")return null;return d;}

// ─── Export CSV ───────────────────────────────────────────────────────────────
function exportMissingCSV(shows) {
  const rows=[["Show","Season","Episode","Episode Title","IMDb ID"]];
  for(const show of shows){
    for(const s of show.seasons){
      const od=show.omdb?.seasonData?.[s.season];
      if(od?.Episodes){
        for(const ep of od.Episodes){
          const num=parseInt(ep.Episode,10);
          if(!s.have.has(num)){
            rows.push([show.omdb?.Title||show.name, `S${String(s.season).padStart(2,"0")}`,
              `E${String(num).padStart(2,"0")}`, ep.Title||"", show.omdb?.imdbID||""]);
          }
        }
      }
    }
  }
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'\'\'')}"`).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="missing-episodes.csv";a.click();
}

// ─── CSS (theme-aware via CSS vars) ───────────────────────────────────────────
const css = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'IBM Plex Sans',sans-serif;min-height:100vh;font-size:16px;transition:background .2s,color .2s}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:var(--bg2)}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
.app{max-width:1700px;margin:0 auto;padding:18px 20px}

/* header */
.hdr{display:flex;align-items:center;gap:12px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.hdr h1{font-family:'IBM Plex Mono',monospace;font-size:1.05rem;font-weight:500;color:var(--accent);letter-spacing:.06em}
.hdr h1 em{color:var(--accent2);font-style:normal}
.hdr-sub{font-family:'IBM Plex Mono',monospace;font-size:.68rem;color:var(--text3);letter-spacing:.12em;text-transform:uppercase}
.hdr-right{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.db-pill{font-family:'IBM Plex Mono',monospace;font-size:.63rem;padding:3px 10px;border:1px solid;border-radius:20px;display:flex;align-items:center;gap:5px}
.db-pill.ok{border-color:color-mix(in srgb,var(--green) 40%,transparent);color:var(--green);background:color-mix(in srgb,var(--green) 8%,transparent)}
.db-pill.err{border-color:color-mix(in srgb,var(--red) 40%,transparent);color:var(--red)}
.db-dot{width:5px;height:5px;border-radius:50%;background:currentColor;display:inline-block;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}

/* theme switcher */
.theme-btns{display:flex;gap:1px}
.theme-btn{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;transition:all .15s;position:relative}
.theme-btn.active{border-color:var(--accent)}
.theme-btn::after{content:'';position:absolute;inset:2px;border-radius:50%;background:inherit}

/* api bar */
.apibar{display:flex;gap:10px;align-items:center;background:var(--bg2);border:1px solid var(--border);padding:10px 14px;margin-bottom:12px;flex-wrap:wrap}
.apibar-label{font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:var(--accent2);text-transform:uppercase;letter-spacing:.1em;white-space:nowrap;display:flex;align-items:center;gap:6px}
.imdb-logo{background:var(--accent);color:#000;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:.65rem;padding:1px 5px;border-radius:2px}
.apibar input{flex:1;min-width:200px;background:transparent;border:none;outline:none;font-family:'IBM Plex Mono',monospace;font-size:.82rem;color:var(--accent)}
.apibar input::placeholder{color:var(--text4)}
.apibar-st{font-family:'IBM Plex Mono',monospace;font-size:.68rem;padding:3px 9px;border-radius:2px}
.st-ok{background:color-mix(in srgb,var(--accent) 10%,transparent);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);color:var(--accent)}
.st-err{background:color-mix(in srgb,var(--red) 10%,transparent);border:1px solid color-mix(in srgb,var(--red) 30%,transparent);color:var(--red)}
.st-idle{border:1px solid var(--border);color:var(--text3)}
.err-msg{font-family:'IBM Plex Mono',monospace;font-size:.68rem;color:var(--red);padding:6px 10px;background:color-mix(in srgb,var(--red) 8%,transparent);border:1px solid color-mix(in srgb,var(--red) 25%,transparent);border-radius:2px;margin-bottom:10px}

/* stats */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1px;background:var(--border);border:1px solid var(--border);margin-bottom:16px}
.stat{background:var(--bg);padding:14px 18px}
.stat-lbl{font-family:'IBM Plex Mono',monospace;font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px}
.stat-val{font-family:'IBM Plex Mono',monospace;font-size:1.6rem;font-weight:600;color:var(--text)}
.g{color:var(--green)}.r{color:var(--red)}.y{color:var(--accent)}.b{color:var(--blue)}

/* toolbar */
.toolbar{display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
.sbox{flex:1;min-width:200px;background:var(--bg2);border:1px solid var(--border);display:flex;align-items:center;padding:0 12px;gap:8px}
.sbox input{background:transparent;border:none;outline:none;color:var(--text);font-family:'IBM Plex Mono',monospace;font-size:.82rem;padding:9px 0;width:100%}
.sbox input::placeholder{color:var(--text4)}
.sortsel{background:var(--bg2);border:1px solid var(--border);color:var(--text2);font-family:'IBM Plex Mono',monospace;font-size:.72rem;padding:9px 12px;outline:none;cursor:pointer}
.fbtns,.vbtns{display:flex;gap:1px}
.fbtn,.vbtn{font-family:'IBM Plex Mono',monospace;font-size:.7rem;padding:8px 13px;border:1px solid var(--border);background:var(--bg2);color:var(--text3);cursor:pointer;transition:all .15s}
.fbtn.on{background:color-mix(in srgb,var(--accent) 10%,transparent);border-color:color-mix(in srgb,var(--accent) 40%,transparent);color:var(--accent)}
.vbtn.on{background:color-mix(in srgb,var(--blue) 10%,transparent);border-color:color-mix(in srgb,var(--blue) 40%,transparent);color:var(--blue)}
.btn{font-family:'IBM Plex Mono',monospace;font-size:.72rem;padding:7px 14px;border:1px solid;cursor:pointer;transition:all .15s;letter-spacing:.04em;background:transparent}
.btn-y{border-color:var(--accent);color:var(--accent)}.btn-y:hover{background:color-mix(in srgb,var(--accent) 10%,transparent)}
.btn-g{border-color:var(--green);color:var(--green)}.btn-g:hover{background:color-mix(in srgb,var(--green) 10%,transparent)}
.btn-r{border-color:var(--red);color:var(--red)}.btn-r:hover{background:color-mix(in srgb,var(--red) 10%,transparent)}
.btn-b{border-color:var(--blue);color:var(--blue)}.btn-b:hover{background:color-mix(in srgb,var(--blue) 10%,transparent)}
.btn-d{border-color:var(--border);color:var(--text3)}.btn-d:hover{border-color:var(--text3);color:var(--text2)}
.btn-sm{font-size:.65rem;padding:4px 9px}
.btn:disabled{opacity:.3;cursor:default}

/* input */
.ipanel{background:var(--bg2);border:1px solid var(--border);margin-bottom:16px}
.ipanel-hdr{padding:8px 14px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:var(--accent)}
.dot{width:5px;height:5px;border-radius:50%;background:currentColor;display:inline-block}
.ipanel textarea{width:100%;background:transparent;border:none;outline:none;color:var(--text3);font-family:'IBM Plex Mono',monospace;font-size:.72rem;line-height:1.65;padding:12px 14px;resize:vertical;min-height:80px;max-height:180px}
.ipanel textarea::placeholder{color:var(--text4)}
.iactions{padding:8px 14px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.hint{font-family:'IBM Plex Mono',monospace;font-size:.62rem;color:var(--text4);margin-left:auto}
.prog{height:2px;background:var(--border);margin-bottom:16px}
.prog-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--green));transition:width .4s}
.spin{display:inline-block;width:10px;height:10px;border:1px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:sp .6s linear infinite;vertical-align:middle}
@keyframes sp{to{transform:rotate(360deg)}}

/* ═══ TILES ══════════════════════════════════════════════════════════════════ */
.tile-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px}
.tile-grid.wall{grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px}
.tile{background:var(--bg2);border:1px solid var(--border);border-radius:4px;overflow:hidden;cursor:pointer;transition:all .18s;position:relative}
.tile:hover{border-color:var(--text3);transform:translateY(-2px);box-shadow:0 8px 24px #0008}
.tile.wall{border-radius:2px;border-color:transparent}
.tile.wall:hover{transform:scale(1.03);z-index:2;border-color:var(--accent)}
.tile-poster{position:relative;width:100%;padding-top:148%;background:var(--bg3);overflow:hidden}
.tile-poster img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.tile-poster-ph{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text4)}
.tile-poster-ph svg{width:36px;height:36px;opacity:.3}
.tile-poster-ph span{font-family:'IBM Plex Mono',monospace;font-size:.6rem;color:var(--text4);text-align:center;padding:0 8px}
.tile-badges{position:absolute;top:6px;left:6px;right:6px;display:flex;justify-content:space-between;align-items:flex-start;gap:4px;pointer-events:none}
.tile-badge{font-family:'IBM Plex Mono',monospace;font-size:.6rem;padding:2px 5px;border-radius:2px;font-weight:500;line-height:1.4;backdrop-filter:blur(4px)}
.tb-miss{background:#f87171cc;color:#fff}
.tb-ok{background:#4ade80bb;color:#052a10}
.tb-fetch{background:color-mix(in srgb,var(--accent) 80%,transparent);color:#000;pointer-events:all;cursor:pointer}
.tb-dup{background:#a855f7cc;color:#fff}
.tb-ani{background:#ec4899cc;color:#fff}
.tb-loading{background:var(--bg3);color:var(--text3)}
.tile-rating{position:absolute;bottom:6px;right:6px;background:#000000aa;font-family:'IBM Plex Mono',monospace;font-size:.65rem;color:var(--accent);padding:2px 6px;border-radius:2px;backdrop-filter:blur(4px)}
.tile-id-btn{position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:2px;background:#000000aa;border:1px solid #2a3848;color:#3a4a5a;font-size:.7rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;pointer-events:all;backdrop-filter:blur(4px)}
.tile-id-btn:hover{border-color:color-mix(in srgb,var(--accent) 60%,transparent);color:var(--accent)}
.tile-id-btn.set{border-color:color-mix(in srgb,var(--green) 60%,transparent);color:var(--green)}

/* progress bar on tile */
.tile-progress{height:3px;background:var(--border);position:relative}
.tile-progress-fill{height:100%;transition:width .4s;border-radius:0 2px 2px 0}

.tile-info{padding:8px 10px 10px}
.tile-title{font-size:.82rem;font-weight:500;color:var(--text);line-height:1.3;margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.2em}
.tile-meta{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
.tile-yr{font-family:'IBM Plex Mono',monospace;font-size:.65rem;color:var(--text3)}
.tile-size{font-family:'IBM Plex Mono',monospace;font-size:.62rem;color:var(--text4);margin-left:auto}

/* quality/audio badges */
.qbadge{font-family:'IBM Plex Mono',monospace;font-size:.55rem;padding:1px 4px;border-radius:1px;font-weight:600}
.q4k{background:#7c3aed20;border:1px solid #7c3aed60;color:#a78bfa}
.q1080{background:#1d4ed820;border:1px solid #3b82f660;color:#60a5fa}
.q720{background:#0d9488201;border:1px solid #14b8a660;color:#2dd4bf}
.qsd{background:var(--bg3);border:1px solid var(--border);color:var(--text3)}
.qaudio{background:var(--bg3);border:1px solid var(--border);color:var(--text2)}
.qsub{background:#16a34a20;border:1px solid #4ade8060;color:#4ade80}
.qdup{background:#a855f720;border:1px solid #a855f760;color:#d8b4fe}

/* wall mode overlay */
.tile.wall .tile-info{position:absolute;bottom:0;left:0;right:0;padding:20px 8px 8px;background:linear-gradient(transparent,#000000dd);opacity:0;transition:opacity .2s}
.tile.wall:hover .tile-info{opacity:1}
.tile.wall .tile-title{color:#fff;-webkit-line-clamp:1}
.tile.wall .tile-meta{opacity:.8}

/* ═══ DETAIL PANEL ════════════════════════════════════════════════════════════ */
.detail-overlay{position:fixed;inset:0;background:var(--overlay);z-index:100;display:flex;justify-content:flex-end;animation:fadeIn .15s}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.detail-panel{width:min(580px,100vw);height:100vh;background:var(--bg);border-left:1px solid var(--border);overflow-y:auto;animation:slideIn .2s ease-out;display:flex;flex-direction:column}
@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
.detail-poster-wrap{position:relative;width:100%;padding-top:52%;overflow:hidden;background:var(--bg2);flex-shrink:0}
.detail-poster-wrap img.blur{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(20px) brightness(.35);transform:scale(1.1)}
.detail-poster-front{position:absolute;inset:0;display:flex;align-items:flex-end;padding:16px;gap:14px}
.detail-poster-img{width:95px;flex-shrink:0;border-radius:3px;box-shadow:0 4px 20px #000;display:block}
.detail-poster-ph{width:95px;flex-shrink:0;border-radius:3px;background:var(--bg3);border:1px solid var(--border);aspect-ratio:2/3;display:flex;align-items:center;justify-content:center;color:var(--text4);font-size:1.5rem}
.detail-title-block{flex:1;min-width:0}
.detail-name{font-size:1.25rem;font-weight:600;color:#fff;text-shadow:0 2px 8px #000;margin-bottom:4px;line-height:1.2}
.detail-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
.dchip{font-family:'IBM Plex Mono',monospace;font-size:.65rem;padding:2px 7px;border-radius:2px;background:#00000050;border:1px solid #ffffff18;color:#ffffffaa;backdrop-filter:blur(4px)}
.dchip.gold{border-color:color-mix(in srgb,var(--accent) 60%,transparent);color:var(--accent)}
.dchip.green{border-color:#4ade8060;color:#4ade80}
.dchip.red{border-color:#f8717160;color:#f87171}
.dchip.purple{border-color:#a855f760;color:#d8b4fe}
.detail-close{position:absolute;top:12px;right:12px;width:28px;height:28px;border-radius:50%;background:#00000070;border:1px solid #ffffff18;color:#fff;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center}
.detail-body{padding:16px;flex:1;display:flex;flex-direction:column;gap:14px}
.detail-plot{font-size:.88rem;color:var(--text2);line-height:1.7}
.detail-links{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.imdb-badge{background:var(--accent);color:#000;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:.65rem;padding:2px 7px;border-radius:2px;text-decoration:none}
.anilist-badge{background:#02a9ff20;border:1px solid #02a9ff60;color:#02a9ff;font-family:'IBM Plex Mono',monospace;font-size:.65rem;padding:2px 7px;border-radius:2px;text-decoration:none}

/* progress bar in detail */
.detail-progress{background:var(--border);height:6px;border-radius:3px;overflow:hidden;margin-bottom:4px}
.detail-progress-fill{height:100%;border-radius:3px;transition:width .6s}
.detail-progress-label{font-family:'IBM Plex Mono',monospace;font-size:.68rem;color:var(--text3);display:flex;justify-content:space-between}

/* dup warning */
.dup-warning{background:color-mix(in srgb,#a855f7 8%,transparent);border:1px solid color-mix(in srgb,#a855f7 30%,transparent);padding:8px 12px;border-radius:2px;font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:#d8b4fe}

/* manual id */
.mid-panel{background:var(--surface);border:1px solid var(--border);padding:12px;display:flex;flex-direction:column;gap:8px}
.mid-title{font-family:'IBM Plex Mono',monospace;font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:.1em}
.mid-row{display:flex;gap:8px}
.mid-row input{flex:1;background:var(--bg);border:1px solid var(--border);outline:none;font-family:'IBM Plex Mono',monospace;font-size:.78rem;color:var(--accent);padding:6px 10px;border-radius:2px}
.mid-row input:focus{border-color:color-mix(in srgb,var(--accent) 40%,transparent)}
.mid-row input::placeholder{color:var(--text4)}
.mid-hint{font-family:'IBM Plex Mono',monospace;font-size:.63rem;color:var(--text4)}
.mid-saved{font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:var(--green)}

/* season grid */
.detail-section-ttl{font-family:'IBM Plex Mono',monospace;font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px;display:flex;align-items:center;gap:8px}
.detail-section-ttl::after{content:'';flex:1;height:1px;background:var(--border)}
.sgrid{display:flex;flex-direction:column;gap:8px}
.srow{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}
.slbl{font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:var(--text3);min-width:55px;padding-top:3px;flex-shrink:0}
.slbl span{font-size:.6rem;color:var(--text4)}
.eps{display:flex;flex-wrap:wrap;gap:3px}
.ep{font-family:'IBM Plex Mono',monospace;font-size:.68rem;padding:2px 5px;border-radius:1px;cursor:default}
.ep-h{background:color-mix(in srgb,var(--green) 12%,transparent);color:color-mix(in srgb,var(--green) 70%,transparent);border:1px solid color-mix(in srgb,var(--green) 25%,transparent)}
.ep-m{background:color-mix(in srgb,var(--red) 12%,transparent);color:var(--red);border:1px solid color-mix(in srgb,var(--red) 30%,transparent)}
.ep-missing-list{font-family:'IBM Plex Mono',monospace;font-size:.68rem;color:var(--red);padding:4px 8px;border-left:2px solid color-mix(in srgb,var(--red) 35%,transparent);margin-top:3px;background:color-mix(in srgb,var(--red) 5%,transparent)}

/* DB inspector */
.dbi{background:var(--surface);border:1px solid var(--border);margin-bottom:14px}
.dbi-hdr{padding:9px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none}
.dbi-hdr-title{font-family:'IBM Plex Mono',monospace;font-size:.72rem;color:var(--green);display:flex;align-items:center;gap:8px}
.dbi-counts{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap}
.dc{font-family:'IBM Plex Mono',monospace;font-size:.65rem;padding:2px 8px;border-radius:12px;border:1px solid}
.dc-g{border-color:color-mix(in srgb,var(--green) 30%,transparent);color:var(--green)}
.dc-b{border-color:color-mix(in srgb,var(--blue) 30%,transparent);color:var(--blue)}
.dc-y{border-color:color-mix(in srgb,var(--accent) 30%,transparent);color:var(--accent)}
.dbi-body{padding:12px 14px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:12px}
.dbi-table{width:100%;border-collapse:collapse}
.dbi-table th{font-family:'IBM Plex Mono',monospace;font-size:.6rem;color:var(--text3);text-transform:uppercase;padding:5px 8px;text-align:left;background:var(--bg);border-bottom:1px solid var(--border2)}
.dbi-table td{font-family:'IBM Plex Mono',monospace;font-size:.68rem;padding:5px 8px;border-bottom:1px solid var(--border2);color:var(--text2);vertical-align:middle}
.dbi-table tr:last-child td{border-bottom:none}
.dbi-table tr:hover td{background:var(--bg2)}
.dbi-key{color:var(--blue);max-width:200px;word-break:break-all;display:block}
.dbi-imdb{color:var(--accent);text-decoration:none}.dbi-imdb:hover{text-decoration:underline}
.dbi-poster{width:22px;height:32px;object-fit:cover;border-radius:1px}
.dbi-del{font-family:'IBM Plex Mono',monospace;font-size:.58rem;padding:2px 6px;border:1px solid color-mix(in srgb,var(--red) 30%,transparent);color:var(--red);background:transparent;cursor:pointer;border-radius:1px}
.dbi-del:hover{background:color-mix(in srgb,var(--red) 10%,transparent)}
.dbi-empty{font-family:'IBM Plex Mono',monospace;font-size:.72rem;color:var(--text4);padding:12px;text-align:center}
.dbi-actions{display:flex;gap:8px;flex-wrap:wrap;padding-top:6px;border-top:1px solid var(--border2)}

/* section title */
.sec-ttl{font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:var(--text3);text-transform:uppercase;letter-spacing:.15em;margin-bottom:12px;display:flex;align-items:center;gap:10px}
.sec-ttl::after{content:'';flex:1;height:1px;background:var(--border)}
.empty{text-align:center;padding:50px 20px;font-family:'IBM Plex Mono',monospace;font-size:.82rem;color:var(--text4)}
.empty span{color:var(--accent)}
`;

// ─── ManualIdPanel ────────────────────────────────────────────────────────────
const ManualIdPanel = ({ itemKey, overrides, onSave, onClear, apiKey, onFetch, type }) => {
  const saved = overrides[itemKey];
  const [val, setVal] = useState(saved?.imdbId || "");
  const handleSave = async () => {
    const v=val.trim(); if(!v) return;
    await onSave(itemKey, v);
    if(apiKey) onFetch(itemKey, v, type);
  };
  return (
    <div className="mid-panel">
      <div className="mid-title">⊕ Manual IMDb ID</div>
      {saved && <div className="mid-saved">✓ {saved.imdbId} <button className="btn btn-d btn-sm" onClick={()=>{onClear(itemKey);setVal("");}}>clear</button></div>}
      <div className="mid-row">
        <input value={val} onChange={e=>setVal(e.target.value)} placeholder="tt0903747" onKeyDown={e=>e.key==="Enter"&&handleSave()}/>
        <button className="btn btn-y btn-sm" onClick={handleSave} disabled={!val.trim()}>{apiKey?"Save & Fetch":"Save"}</button>
      </div>
      <div className="mid-hint">imdb.com/title/<span style={{color:"var(--accent)"}}>tt0903747</span> · <a href="https://www.imdb.com/search/title/" target="_blank" rel="noreferrer" style={{color:"var(--text3)"}}>search →</a></div>
    </div>
  );
};

// ─── QualityBadge ─────────────────────────────────────────────────────────────
const QualityBadge = ({q}) => {
  if(!q) return null;
  const cls=q==="4K"?"q4k":q==="1080p"?"q1080":q==="720p"?"q720":"qsd";
  return <span className={`qbadge ${cls}`}>{q}</span>;
};

// ─── DetailPanel ──────────────────────────────────────────────────────────────
const DetailPanel = ({ item, type, overrides, onClose, onEnrich, onEnrichAnime, onSaveOverride, onClearOverride, onFetchById, apiKey }) => {
  const o = item.omdb;
  const isShow = type==="series";
  if(isShow && !item.seasons) return null;
  const isAnime = item.isAnime || o?._source==="anilist";

  const seasonDetails = isShow ? item.seasons.map(s => {
    const od=o?.seasonData?.[s.season];
    let allEps=od?.Episodes
      ?od.Episodes.map(e=>({num:parseInt(e.Episode,10),title:e.Title}))
      :Array.from({length:s.max-s.min+1},(_,i)=>({num:s.min+i}));
    // For anilist, generate episode list from totalEpisodes
    if(isAnime&&o?.totalEpisodes&&!od){
      allEps=Array.from({length:o.totalEpisodes},(_,i)=>({num:i+1}));
    }
    return{season:s.season,have:s.have,allEps,missing:allEps.filter(e=>!s.have.has(e.num))};
  }) : [];

  const totalMissing = seasonDetails.reduce((s,x)=>s+x.missing.length,0);
  const totalEps = o?.totalEpisodes || seasonDetails.reduce((s,x)=>s+x.allEps.length,0);
  const progressPct = totalEps>0 ? Math.round((item.episodeCount/totalEps)*100) : null;
  const itemKey = isShow?item.name:item.path;
  const hasOverride = !!overrides[itemKey];

  // Quality summary
  const qualities = isShow ? [...new Set(item.episodes?.map(e=>e.quality).filter(Boolean))] : [item.quality].filter(Boolean);
  const audios = isShow ? [...new Set(item.episodes?.map(e=>e.audio).filter(Boolean))] : [item.audio].filter(Boolean);

  return (
    <div className="detail-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="detail-panel">
        <div className="detail-poster-wrap">
          {o?.Poster&&o.Poster!=="N/A"&&<img className="blur" src={o.Poster} alt=""/>}
          <div className="detail-poster-front">
            {o?.Poster&&o.Poster!=="N/A"
              ?<img className="detail-poster-img" src={o.Poster} alt=""/>
              :<div className="detail-poster-ph">▤</div>}
            <div className="detail-title-block">
              <div className="detail-name">{o?.Title||item.name||item.path.split('/').pop()}</div>
              <div style={{fontSize:".78rem",color:"#ffffff60",marginBottom:4}}>{o?.Genre||""}</div>
              <div className="detail-chips">
                {o?.Year&&<span className="dchip">{o.Year}</span>}
                {o?.imdbRating&&o.imdbRating!=="N/A"&&<span className="dchip gold">★ {o.imdbRating}</span>}
                {o?.Rated&&o.Rated!=="N/A"&&<span className="dchip">{o.Rated}</span>}
                {isShow&&o?.totalSeasons&&<span className="dchip">{o.totalSeasons}S</span>}
                {isShow&&<span className="dchip">{item.episodeCount} local eps</span>}
                {isShow&&totalMissing>0&&<span className="dchip red">−{totalMissing} missing</span>}
                {isShow&&totalMissing===0&&o&&<span className="dchip green">✓ complete</span>}
                {isAnime&&<span className="dchip purple">Anime</span>}
                {item.duplicates?.length>0&&<span className="dchip purple">⚠ {item.duplicates.length} dups</span>}
                {!isShow&&<span className="dchip">{formatBytes(item.size)}</span>}
                {o?.Runtime&&o.Runtime!=="N/A"&&<span className="dchip">{o.Runtime}</span>}
              </div>
            </div>
          </div>
          <button className="detail-close" onClick={onClose}>✕</button>
        </div>

        <div className="detail-body">
          {/* Progress bar */}
          {isShow&&progressPct!==null&&(
            <div>
              <div className="detail-progress">
                <div className="detail-progress-fill" style={{
                  width:`${progressPct}%`,
                  background:progressPct===100?"var(--green)":progressPct>50?"var(--accent)":"var(--red)"
                }}/>
              </div>
              <div className="detail-progress-label">
                <span>Collection: {item.episodeCount}/{totalEps} eps</span>
                <span style={{color:progressPct===100?"var(--green)":progressPct>50?"var(--accent)":"var(--red)"}}>{progressPct}%</span>
              </div>
            </div>
          )}

          {/* Quality / Audio */}
          {(qualities.length>0||audios.length>0)&&(
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {qualities.map(q=><QualityBadge key={q} q={q}/>)}
              {audios.map(a=><span key={a} className="qbadge qaudio">{a}</span>)}
              {item.hasSubs&&<span className="qbadge qsub">SUB</span>}
            </div>
          )}

          {/* Links */}
          <div className="detail-links">
            {o?.imdbID&&<a className="imdb-badge" href={`https://www.imdb.com/title/${o.imdbID}`} target="_blank" rel="noreferrer">IMDb</a>}
            {o?.anilistUrl&&<a className="anilist-badge" href={o.anilistUrl} target="_blank" rel="noreferrer">AniList</a>}
            {o?.Metascore&&o.Metascore!=="N/A"&&<span style={{fontFamily:"IBM Plex Mono",fontSize:".7rem",color:"var(--blue)"}}>Metascore: {o.Metascore}</span>}
            {o?.Actors&&o.Actors!=="N/A"&&<span style={{fontFamily:"IBM Plex Mono",fontSize:".7rem",color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:300}}>{o.Actors}</span>}
          </div>

          {/* Plot */}
          {o?.Plot&&o.Plot!=="N/A"&&<div className="detail-plot">{o.Plot}</div>}

          {/* Duplicate warning */}
          {item.duplicates?.length>0&&(
            <div className="dup-warning">
              ⚠ Duplicate episodes detected: {item.duplicates.join(", ")}
              <br/><span style={{opacity:.7,fontSize:".65rem"}}>Same episode exists from multiple sources</span>
            </div>
          )}

          {/* Fetch buttons */}
          {!o&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {apiKey&&<button className="btn btn-y btn-sm" onClick={()=>onEnrich(isShow?item.name:item.path)}>⬇ Fetch from OMDb</button>}
              {isShow&&<button className="btn btn-b btn-sm" onClick={()=>onEnrichAnime(item.name)}>⬇ Try AniList</button>}
              {!apiKey&&<span style={{fontFamily:"IBM Plex Mono",fontSize:".75rem",color:"var(--text4)"}}>Enter OMDb key to fetch</span>}
            </div>
          )}

          {/* Manual ID */}
          <ManualIdPanel itemKey={itemKey} overrides={overrides} onSave={onSaveOverride}
            onClear={onClearOverride} onFetch={onFetchById} apiKey={apiKey} type={type}/>

          {/* Season breakdown */}
          {isShow&&seasonDetails.length>0&&(
            <div>
              <div className="detail-section-ttl">Episodes</div>
              <div className="sgrid">
                {seasonDetails.map(({season,have,allEps,missing})=>(
                  <div key={season}>
                    <div className="srow">
                      <div className="slbl">S{String(season).padStart(2,"0")}<span> {allEps.length}ep</span></div>
                      <div className="eps">
                        {allEps.map(({num,title})=>{
                          const has=have.has(num);
                          const isDup=item.duplicates?.includes(`S${season}E${num}`);
                          return <div key={num} className={`ep ${has?"ep-h":"ep-m"}`}
                            style={isDup?{borderColor:"#a855f760",color:"#d8b4fe"}:{}}
                            title={[`E${String(num).padStart(2,"0")}`,title,isDup?"DUPLICATE":null,!has?"MISSING":null].filter(Boolean).join(" · ")}>
                            {String(num).padStart(2,"0")}
                          </div>;
                        })}
                      </div>
                    </div>
                    {missing.length>0&&(
                      <div className="ep-missing-list" style={{marginLeft:65,marginTop:4}}>
                        Missing: {missing.map(e=>`E${String(e.num).padStart(2,"0")}${e.title?" – "+e.title:""}`).join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── DbInspector ──────────────────────────────────────────────────────────────
const DbInspector = ({ dbStats, onRefresh }) => {
  const [open,setOpen]=useState(false);
  const [tab,setTab]=useState("cache");
  const [data,setData]=useState({cache:{},seasons:{},overrides:{}});
  const [szs,setSzs]=useState({total:0,dbPath:""});

  const reload = useCallback(async()=>{
    const[cache,seasons,overrides,stats]=await Promise.all([db.getCache(),db.getSeasons(),db.getOverrides(),db.stats()]);
    setData({cache:cache||{},seasons:seasons||{},overrides:overrides||{}});
    setSzs({total:stats?.dbSize||0,dbPath:stats?.dbPath||""});
  },[]);

  useEffect(()=>{if(open)reload();},[open,reload]);

  const fmtSz=b=>b>1048576?`${(b/1048576).toFixed(1)} MB`:b>1024?`${(b/1024).toFixed(1)} KB`:`${b} B`;
  const ce=Object.entries(data.cache);
  const se=Object.entries(data.seasons);
  const oe=Object.entries(data.overrides);

  const importDb=()=>{
    const inp=document.createElement("input");inp.type="file";inp.accept=".json";
    inp.onchange=e=>{
      const file=e.target.files[0];if(!file)return;
      const reader=new FileReader();
      reader.onload=async ev=>{try{const d=JSON.parse(ev.target.result);const r=await db.importAll(d);alert(`Imported: ${r.imported?.cache||0} cache, ${r.imported?.overrides||0} overrides`);reload();onRefresh();}catch{alert("Invalid JSON");}};
      reader.readAsText(file);
    };inp.click();
  };

  return (
    <div className="dbi">
      <div className="dbi-hdr" onClick={()=>setOpen(v=>{if(!v)reload();return !v;})}>
        <div className="dbi-hdr-title">🗄 SQLite DB</div>
        <div className="dbi-counts">
          <span className="dc dc-g">{dbStats.cache} cached</span>
          <span className="dc dc-b">{dbStats.seasons} seasons</span>
          <span className="dc dc-y">{dbStats.overrides} overrides</span>
          {szs.total>0&&<span className="dc" style={{borderColor:"var(--border)",color:"var(--text3)"}}>{fmtSz(szs.total)}</span>}
          <span style={{fontFamily:"IBM Plex Mono",fontSize:".7rem",color:open?"var(--green)":"var(--text4)"}}>{open?"▲":"▼"}</span>
        </div>
      </div>
      {open&&(
        <div className="dbi-body">
          {szs.dbPath&&<div style={{fontFamily:"IBM Plex Mono",fontSize:".65rem",color:"var(--text3)"}}>📁 {szs.dbPath} · {fmtSz(szs.total)}</div>}
          <div style={{display:"flex",gap:1,flexWrap:"wrap"}}>
            {[["cache","OMDb Cache"],["seasons","Seasons"],["overrides","Overrides"]].map(([t,l])=>(
              <button key={t} className={`fbtn ${tab===t?"on":""}`} onClick={()=>setTab(t)}>{l}</button>
            ))}
            <button className="btn btn-d btn-sm" style={{marginLeft:"auto"}} onClick={reload}>↺</button>
          </div>
          {tab==="cache"&&(ce.length===0?<div className="dbi-empty">No cached entries yet</div>:
            <table className="dbi-table"><thead><tr><th>Img</th><th>Key</th><th>Title</th><th>IMDb ID</th><th>Rating</th><th/></tr></thead>
            <tbody>{ce.map(([k,v])=>(<tr key={k}>
              <td>{v.Poster&&v.Poster!=="N/A"?<img className="dbi-poster" src={v.Poster} alt=""/>:"—"}</td>
              <td><span className="dbi-key">{k}</span></td>
              <td style={{color:"var(--text)"}}>{v.Title||"—"}</td>
              <td>{v.imdbID?<a className="dbi-imdb" href={`https://www.imdb.com/title/${v.imdbID}`} target="_blank" rel="noreferrer">{v.imdbID}</a>:"—"}</td>
              <td style={{color:"var(--accent)"}}>{v.imdbRating&&v.imdbRating!=="N/A"?`★${v.imdbRating}`:"—"}</td>
              <td><button className="dbi-del" onClick={async()=>{await db.delCache(k);reload();onRefresh();}}>del</button></td>
            </tr>))}</tbody></table>)}
          {tab==="seasons"&&(se.length===0?<div className="dbi-empty">No season data yet</div>:
            <table className="dbi-table"><thead><tr><th>Key</th><th>Show</th><th>Season</th><th>Episodes</th><th/></tr></thead>
            <tbody>{se.map(([k,v])=>(<tr key={k}>
              <td><span className="dbi-key">{k}</span></td>
              <td style={{color:"var(--text)"}}>{v.Title||"—"}</td>
              <td style={{color:"var(--blue)"}}>S{String(v.Season||"?").padStart(2,"0")}</td>
              <td style={{color:"var(--green)"}}>{v.Episodes?.length??0} eps</td>
              <td><button className="dbi-del" onClick={async()=>{await db.delSeason(k);reload();onRefresh();}}>del</button></td>
            </tr>))}</tbody></table>)}
          {tab==="overrides"&&(oe.length===0?<div className="dbi-empty">No overrides yet</div>:
            <table className="dbi-table"><thead><tr><th>Key</th><th>IMDb ID</th><th>Saved</th><th/></tr></thead>
            <tbody>{oe.map(([k,v])=>(<tr key={k}>
              <td><span className="dbi-key">{k}</span></td>
              <td><a className="dbi-imdb" href={`https://www.imdb.com/title/${v.imdbId}`} target="_blank" rel="noreferrer">{v.imdbId}</a></td>
              <td style={{color:"var(--text3)"}}>{v.savedAt?new Date(v.savedAt).toLocaleString():"—"}</td>
              <td><button className="dbi-del" onClick={async()=>{await db.delOverride(k);reload();onRefresh();}}>del</button></td>
            </tr>))}</tbody></table>)}
          <div className="dbi-actions">
            <button className="btn btn-g btn-sm" onClick={db.exportAll}>⬇ Export JSON</button>
            <button className="btn btn-d btn-sm" onClick={importDb}>⬆ Import JSON</button>
            <button className="btn btn-r btn-sm" style={{marginLeft:"auto"}} onClick={async()=>{if(!confirm("Clear ALL SQLite data?"))return;await db.clearAll();reload();onRefresh();}}>clear all</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [text,      setText]      = useState(SAMPLE);
  const [apiKey,    setApiKey]    = useState("");
  const [apiStatus, setApiStatus] = useState("idle");
  const [apiError,  setApiError]  = useState("");
  const [shows,     setShows]     = useState([]);
  const [movies,    setMovies]    = useState([]);
  const [stats,     setStats]     = useState(null);
  const [search,    setSearch]    = useState("");
  const [sort,      setSort]      = useState("name");
  const [movieSort, setMovieSort] = useState("size");
  const [filter,    setFilter]    = useState("all");
  const [view,      setView]      = useState("tile");
  const [theme,     setTheme]     = useState("dark");
  const [enriching, setEnriching] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [reqCount,  setReqCount]  = useState(0);
  const [overrides, setOverrides] = useState({});
  const [dbStats,   setDbStats]   = useState({cache:0,seasons:0,overrides:0});
  const [dbOnline,  setDbOnline]  = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [subMap,    setSubMap]    = useState({});
  const abortRef = useRef(false);

  // Apply theme CSS vars
  useEffect(()=>{
    const t=THEMES[theme]||THEMES.dark;
    Object.entries(t).forEach(([k,v])=>document.documentElement.style.setProperty(k,v));
  },[theme]);

  const refreshDbStats = useCallback(async()=>{
    const s=await db.stats();
    if(s){setDbStats({cache:s.cache,seasons:s.seasons,overrides:s.overrides});setDbOnline(true);}
    else setDbOnline(false);
    const ovr=await db.getOverrides();
    if(ovr) setOverrides(ovr);
  },[]);

  // Auto-load on startup
  useEffect(()=>{
    (async()=>{
      await refreshDbStats();
      const key=await db.getSetting("apikey");
      if(key) setApiKey(key);
      const savedTheme=await db.getSetting("theme");
      if(savedTheme&&THEMES[savedTheme]) setTheme(savedTheme);
      const savedText=await db.getSetting("filelist");
      if(savedText&&savedText.length>10){
        setText(savedText);
        const d=parseFiles(savedText);
        const[cache,seasonCache,ovr]=await Promise.all([db.getCache(),db.getSeasons(),db.getOverrides()]);
        const c=cache||{};const sc=seasonCache||{};const o=ovr||{};
        setSubMap(d.subMap||{});
        const enrichedShows=d.showList.map(show=>{
          const ovrEntry=o[show.name];
          const ck=ovrEntry?.imdbId||`title:series:${show.name.toLowerCase()}`;
          let omdbData=c[ck]||(ovrEntry?c[ovrEntry.imdbId]:null);
          if(!omdbData)return show;
          const seasonData={};
          for(const s of (show.seasons||[])){const sk=`${omdbData.imdbID}:${s.season}`;if(sc[sk])seasonData[s.season]=sc[sk];}
          return{...show,omdb:{...omdbData,seasonData},omdbStatus:"done"};
        });
        const enrichedMovies=d.movies.map(movie=>{
          const ovrEntry=o[movie.path];
          const fn=(movie.path||"").split("/").pop().replace(/\.[^.]+$/,"");
          const clean=fn.replace(/\s*\(\d{4}\)/,"").replace(/[._]/g," ").trim();
          const ck=ovrEntry?.imdbId||`title:movie:${clean.toLowerCase()}`;
          const omdbData=c[ck]||(ovrEntry?c[ovrEntry.imdbId]:null);
          return omdbData?{...movie,omdb:omdbData}:movie;
        });
        setShows(enrichedShows);setMovies(enrichedMovies);
        setStats({totalSize:d.totalSize,totalFiles:d.totalFiles});
        setOverrides(o);
      }
    })();
  },[]);

  useEffect(()=>{if(apiKey)db.saveSetting("apikey",apiKey);},[apiKey]);
  useEffect(()=>{db.saveSetting("theme",theme);},[theme]);

  // ── fetch by imdbId ───────────────────────────────────────────────────────
  const fetchById = useCallback(async(key,imdbId,type)=>{
    if(!apiKey||!imdbId) return;
    if(type==="series")setShows(prev=>prev.map(s=>s.name===key?{...s,omdbStatus:"loading"}:s));
    try{
      let data=await db.getCacheOne(imdbId);
      if(!data){data=await omdbGet({i:imdbId},apiKey);setReqCount(c=>c+1);if(data)await db.saveCache(imdbId,data);}
      if(!data) return;
      if(type==="series"){
        const show=shows.find(s=>s.name===key);
        const seasonData={};
        for(const s of(show?.seasons||[])){
          const sk=`${imdbId}:${s.season}`;
          let sd=await db.getSeason(sk);
          if(!sd){await sleep(150);sd=await omdbGet({i:imdbId,Season:s.season},apiKey);setReqCount(c=>c+1);if(sd)await db.saveSeason(sk,sd);}
          if(sd)seasonData[s.season]=sd;
        }
        setShows(prev=>prev.map(s=>s.name===key?{...s,omdb:{...data,seasonData},omdbStatus:"done"}:s));
      } else {
        setMovies(prev=>prev.map(m=>m.path===key?{...m,omdb:data}:m));
      }
    }catch{if(type==="series")setShows(prev=>prev.map(s=>s.name===key?{...s,omdbStatus:"done"}:s));}
    await refreshDbStats();
  },[apiKey,shows,refreshDbStats]);

  // ── AniList enrich ────────────────────────────────────────────────────────
  const enrichAnime = useCallback(async(name)=>{
    setShows(prev=>prev.map(s=>s.name===name?{...s,omdbStatus:"loading"}:s));
    const cacheKey=`title:anilist:${name.toLowerCase()}`;
    let data=await db.getCacheOne(cacheKey);
    if(!data){data=await anilistSearch(name);if(data)await db.saveCache(cacheKey,data);}
    if(data){
      setShows(prev=>prev.map(s=>s.name===name?{...s,omdb:data,isAnime:true,omdbStatus:"done"}:s));
    } else {
      setShows(prev=>prev.map(s=>s.name===name?{...s,omdbStatus:"done"}:s));
    }
    await refreshDbStats();
  },[refreshDbStats]);

  // ── save/clear override ───────────────────────────────────────────────────
  const saveOverride=useCallback(async(key,imdbId)=>{await db.saveOverride(key,imdbId);const ovr=await db.getOverrides();setOverrides(ovr||{});await refreshDbStats();},[refreshDbStats]);
  const clearOverride=useCallback(async(key)=>{await db.delOverride(key);const ovr=await db.getOverrides();setOverrides(ovr||{});await refreshDbStats();},[refreshDbStats]);

  // ── enrich show ───────────────────────────────────────────────────────────
  const enrichShow = useCallback(async(name)=>{
    if(!apiKey) return;
    const ovr=await db.getOverrides();
    if(ovr?.[name]?.imdbId){await fetchById(name,ovr[name].imdbId,"series");return;}
    setShows(prev=>prev.map(s=>s.name===name?{...s,omdbStatus:"loading"}:s));
    const ck=`title:series:${name.toLowerCase()}`;
    try{
      let res=await db.getCacheOne(ck);
      if(!res){res=await omdbGet({t:name,type:"series"},apiKey);setReqCount(c=>c+1);if(res){await db.saveCache(ck,res);await db.saveCache(res.imdbID,res);}}
      if(!res){setShows(prev=>prev.map(s=>s.name===name?{...s,omdbStatus:"done"}:s));return;}
      const show=shows.find(s=>s.name===name);
      const seasonData={};
      for(const s of(show?.seasons||[])){
        const sk=`${res.imdbID}:${s.season}`;
        let sd=await db.getSeason(sk);
        if(!sd){await sleep(150);sd=await omdbGet({i:res.imdbID,Season:s.season},apiKey);setReqCount(c=>c+1);if(sd)await db.saveSeason(sk,sd);}
        if(sd)seasonData[s.season]=sd;
      }
      setShows(prev=>prev.map(s=>s.name===name?{...s,omdb:{...res,seasonData},omdbStatus:"done"}:s));
    }catch{setShows(prev=>prev.map(s=>s.name===name?{...s,omdbStatus:"done"}:s));}
    await refreshDbStats();
  },[apiKey,shows,fetchById,refreshDbStats]);

  const enrichMovie = useCallback(async(movie)=>{
    if(!apiKey||movie.omdb) return;
    const fn=(movie.path||"").split("/").pop().replace(/\.[^.]+$/,"");
    const clean=fn.replace(/\s*\(\d{4}\)/,"").replace(/[._]/g," ").trim();
    const year=fn.match(/\((\d{4})\)/)?.[1];
    const ovr=await db.getOverrides();
    const ck=ovr?.[movie.path]?.imdbId||`title:movie:${clean.toLowerCase()}`;
    let res=await db.getCacheOne(ck);
    if(!res){
      const params=ovr?.[movie.path]?.imdbId?{i:ovr[movie.path].imdbId}:{t:clean,type:"movie",...(year?{y:year}:{})};
      res=await omdbGet(params,apiKey);setReqCount(c=>c+1);
      if(res){await db.saveCache(ck,res);await db.saveCache(res.imdbID,res);}
    }
    if(res)setMovies(prev=>prev.map(m=>m.path===movie.path?{...m,omdb:res}:m));
  },[apiKey]);

  // ── parse ─────────────────────────────────────────────────────────────────
  const parse = useCallback(async()=>{
    const d=parseFiles(text);
    const[cache,seasonCache,ovr]=await Promise.all([db.getCache(),db.getSeasons(),db.getOverrides()]);
    const c=cache||{};const sc=seasonCache||{};const o=ovr||{};
    setSubMap(d.subMap||{});
    const enrichedShows=d.showList.map(show=>{
      const ovrEntry=o[show.name];
      const ck=ovrEntry?.imdbId||`title:series:${show.name.toLowerCase()}`;
      let omdbData=c[ck]||(ovrEntry?c[ovrEntry.imdbId]:null);
      if(!omdbData)return show;
      const seasonData={};
      for(const s of (show.seasons||[])){const sk=`${omdbData.imdbID}:${s.season}`;if(sc[sk])seasonData[s.season]=sc[sk];}
      return{...show,omdb:{...omdbData,seasonData},omdbStatus:"done"};
    });
    const enrichedMovies=d.movies.map(movie=>{
      const ovrEntry=o[movie.path];
      const fn=(movie.path||"").split("/").pop().replace(/\.[^.]+$/,"");
      const clean=fn.replace(/\s*\(\d{4}\)/,"").replace(/[._]/g," ").trim();
      const ck=ovrEntry?.imdbId||`title:movie:${clean.toLowerCase()}`;
      const omdbData=c[ck]||(ovrEntry?c[ovrEntry.imdbId]:null);
      return omdbData?{...movie,omdb:omdbData}:movie;
    });
    setShows(enrichedShows);setMovies(enrichedMovies);
    setStats({totalSize:d.totalSize,totalFiles:d.totalFiles});
    setProgress(0);setReqCount(0);setOverrides(o);
    await db.saveSetting("filelist",text);
    await refreshDbStats();
  },[text,refreshDbStats]);

  // ── enrich all ────────────────────────────────────────────────────────────
  const enrichAll = useCallback(async()=>{
    if(!apiKey||enriching) return;
    setEnriching(true);abortRef.current=false;
    const total=shows.length+movies.length;let done=0;
    for(const show of shows){
      if(abortRef.current)break;
      if(!show.omdb)await enrichShow(show.name);
      done++;setProgress(Math.round(done/total*100));await sleep(250);
    }
    for(const movie of movies){
      if(abortRef.current)break;
      if(!movie.omdb)await enrichMovie(movie);
      done++;setProgress(Math.round(done/total*100));await sleep(250);
    }
    setEnriching(false);setProgress(100);await refreshDbStats();
  },[apiKey,enriching,shows,movies,enrichShow,enrichMovie,refreshDbStats]);

  // ── verify key ────────────────────────────────────────────────────────────
  const verifyKey=useCallback(async(key)=>{
    if(!key)return;setApiError("");
    try{
      const d=await omdbRaw({i:"tt0903747"},key);
      if(d.Response==="True")setApiStatus("ok");
      else{const msg=d.Error||"Unknown";if(msg.toLowerCase().includes("invalid api key")){setApiStatus("err");setApiError("OMDb: "+msg);}else if(msg.toLowerCase().includes("limit")){setApiStatus("ok");setApiError("Warning: "+msg);}else{setApiStatus("ok");setApiError("OMDb: "+msg);}}
    }catch(e){setApiStatus("err");setApiError("Network: "+e.message);}
  },[]);

  // ── computed ──────────────────────────────────────────────────────────────
  const totalMissing=useMemo(()=>shows.reduce((sum,sh)=>{
    let m=0;for(const s of sh.seasons){const od=sh.omdb?.seasonData?.[s.season];if(od?.Episodes)m+=od.Episodes.length-s.count;}
    return sum+m;
  },0),[shows]);

  const totalDups=useMemo(()=>shows.reduce((s,sh)=>s+(sh.duplicates?.length||0),0),[shows]);

  const filtered=useMemo(()=>{
    let list=shows;
    if(search){const q=search.toLowerCase();list=list.filter(s=>s.name.toLowerCase().includes(q)||(s.omdb?.Title||"").toLowerCase().includes(q));}
    if(filter==="missing")list=list.filter(s=>{let m=0;for(const ss of s.seasons){const od=s.omdb?.seasonData?.[ss.season];if(od?.Episodes)m+=od.Episodes.length-ss.count;}return m>0;});
    if(filter==="complete")list=list.filter(s=>{let m=0;for(const ss of s.seasons){const od=s.omdb?.seasonData?.[ss.season];if(od?.Episodes)m+=od.Episodes.length-ss.count;}return m===0&&s.omdb;});
    if(filter==="dupes")list=list.filter(s=>s.duplicates?.length>0);
    if(filter==="anime")list=list.filter(s=>s.isAnime||s.omdb?._source==="anilist");
    return[...list].sort((a,b)=>{
      if(sort==="name")return(a.omdb?.Title||a.name).localeCompare(b.omdb?.Title||b.name);
      if(sort==="size")return b.size-a.size;
      if(sort==="rating")return parseFloat(b.omdb?.imdbRating||0)-parseFloat(a.omdb?.imdbRating||0);
      if(sort==="episodes")return b.episodeCount-a.episodeCount;
      if(sort==="progress"){
        const pct=(sh)=>{const t=sh.omdb?.totalEpisodes||sh.omdb?.number_of_episodes||0;return t>0?sh.episodeCount/t:0;};
        return pct(b)-pct(a);
      }
      return 0;
    });
  },[shows,search,sort,filter]);

  const sortedMovies=useMemo(()=>{
    return[...movies].sort((a,b)=>{
      if(movieSort==="size")return(b.size??0)-(a.size??0);
      if(movieSort==="rating")return parseFloat(b.omdb?.imdbRating||0)-parseFloat(a.omdb?.imdbRating||0);
      if(movieSort==="decade"){
        const yr=(m)=>parseInt(m.omdb?.Year||m.path.match(/\((\d{4})\)/)?.[1]||"0");
        return yr(b)-yr(a);
      }
      if(movieSort==="runtime"){
        const rt=(m)=>parseInt(m.omdb?.Runtime)||0;
        return rt(b)-rt(a);
      }
      if(movieSort==="genre")return(a.omdb?.Genre||"zzz").localeCompare(b.omdb?.Genre||"zzz");
      return 0;
    });
  },[movies,movieSort]);

  const quotaPct=Math.min(100,Math.round(reqCount/10));

  // ── ShowTile ──────────────────────────────────────────────────────────────
  const ShowTile=({show})=>{
    const o=show.omdb;const status=show.omdbStatus;
    let miss=0;for(const s of show.seasons){const od=o?.seasonData?.[s.season];if(od?.Episodes)miss+=od.Episodes.length-s.count;}
    const totalEps=o?.totalEpisodes||0;
    const progressPct=totalEps>0?Math.min(100,Math.round(show.episodeCount/totalEps*100)):null;
    const hasOvr=!!overrides[show.name];
    const isDup=show.duplicates?.length>0;
    const isAnime=show.isAnime||o?._source==="anilist";
    const qualities=[...new Set((show.episodes||[]).map(e=>e.quality).filter(Boolean))];
    const hasSubs=(show.seasons||[]).some(s=>[...(s.have||[])].some(ep=>subMap[`${show.name}:S${s.season}E${ep}`]));

    return(
      <div className={`tile ${view==="wall"?"wall":""}`} onClick={()=>setSelected({item:show,type:"series"})}>
        <div className="tile-poster">
          {o?.Poster&&o.Poster!=="N/A"
            ?<img src={o.Poster} alt={o.Title||show.name} loading="lazy"/>
            :<div className="tile-poster-ph">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              <span>{show.name}</span>
            </div>}
          <div className="tile-badges">
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {status==="loading"&&<span className="tile-badge tb-loading"><div className="spin"/></span>}
              {status!=="loading"&&miss>0&&<span className="tile-badge tb-miss">−{miss}</span>}
              {status!=="loading"&&miss===0&&o&&<span className="tile-badge tb-ok">✓</span>}
              {status!=="loading"&&!o&&<span className="tile-badge tb-fetch" onClick={e=>{e.stopPropagation();enrichShow(show.name);}}>⬇</span>}
              {isDup&&<span className="tile-badge tb-dup">DUP</span>}
              {isAnime&&<span className="tile-badge tb-ani">ANI</span>}
            </div>
            <button className={`tile-id-btn ${hasOvr?"set":""}`} onClick={e=>{e.stopPropagation();setSelected({item:show,type:"series"});}}>{hasOvr?"⊛":"⊕"}</button>
          </div>
          {o?.imdbRating&&o.imdbRating!=="N/A"&&<div className="tile-rating">★ {o.imdbRating}</div>}
        </div>
        {progressPct!==null&&(
          <div className="tile-progress">
            <div className="tile-progress-fill" style={{width:`${progressPct}%`,background:progressPct===100?"var(--green)":progressPct>60?"var(--accent)":"var(--red)"}}/>
          </div>
        )}
        <div className="tile-info">
          <div className="tile-title">{o?.Title||show.name}</div>
          <div className="tile-meta">
            {o?.Year&&<span className="tile-yr">{o.Year}</span>}
            <span className="tile-yr">{show.seasons.length}S</span>
            {qualities[0]&&<QualityBadge q={qualities[0]}/>}
            {hasSubs&&<span className="qbadge qsub">SUB</span>}
            <span className="tile-size">{formatBytes(show.size)}</span>
          </div>
        </div>
      </div>
    );
  };

  // ── MovieTile ─────────────────────────────────────────────────────────────
  const MovieTile=({movie})=>{
    const o=movie.omdb;
    const fn=(movie.path||"").split("/").pop().replace(/\.[^.]+$/,"");
    const hasOvr=!!overrides[movie.path];
    const year=o?.Year||fn.match(/\((\d{4})\)/)?.[1];
    const decade=year?`${Math.floor(parseInt(year)/10)*10}s`:null;

    return(
      <div className={`tile ${view==="wall"?"wall":""}`} onClick={()=>setSelected({item:movie,type:"movie"})}>
        <div className="tile-poster">
          {o?.Poster&&o.Poster!=="N/A"
            ?<img src={o.Poster} alt={o.Title||fn} loading="lazy"/>
            :<div className="tile-poster-ph">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5"/></svg>
              <span>{fn}</span>
            </div>}
          <div className="tile-badges">
            <div>{!o&&<span className="tile-badge tb-fetch" onClick={e=>{e.stopPropagation();enrichMovie(movie);}}>⬇</span>}</div>
            <button className={`tile-id-btn ${hasOvr?"set":""}`} onClick={e=>{e.stopPropagation();setSelected({item:movie,type:"movie"});}}>{hasOvr?"⊛":"⊕"}</button>
          </div>
          {o?.imdbRating&&o.imdbRating!=="N/A"&&<div className="tile-rating">★ {o.imdbRating}</div>}
        </div>
        <div className="tile-info">
          <div className="tile-title">{o?.Title||fn}</div>
          <div className="tile-meta">
            {decade&&<span className="tile-yr">{decade}</span>}
            {o?.Runtime&&o.Runtime!=="N/A"&&<span className="tile-yr">{o.Runtime}</span>}
            {movie.quality&&<QualityBadge q={movie.quality}/>}
            {movie.audio&&<span className="qbadge qaudio">{movie.audio}</span>}
            <span className="tile-size">{formatBytes(movie.size)}</span>
          </div>
        </div>
      </div>
    );
  };

  return(
    <>
      <style>{css}</style>
      <div className="app">
        <div className="hdr">
          <h1><em>$</em> rclone<em>::</em>media-vault <span style={{fontSize:".6em",opacity:.4}}>v2</span></h1>
          <span className="hdr-sub">gdrive · omdb · anilist</span>
          <div className="hdr-right">
            {/* Theme switcher */}
            <div className="theme-btns">
              {Object.entries({dark:"#07090c",light:"#f0f4f8",amoled:"#000000",nord:"#2e3440"}).map(([t,c])=>(
                <button key={t} className={`theme-btn ${theme===t?"active":""}`}
                  style={{background:c}} title={t}
                  onClick={()=>setTheme(t)}/>
              ))}
            </div>
            <div className={`db-pill ${dbOnline?"ok":"err"}`}>
              <span className="db-dot"/>
              {dbOnline?`SQLite · ${dbStats.cache} cached`:"server offline"}
            </div>
            {reqCount>0&&<span style={{fontFamily:"IBM Plex Mono",fontSize:".65rem",color:quotaPct>80?"var(--red)":"var(--text3)"}}>{reqCount}/1000</span>}
          </div>
        </div>

        {/* API Key */}
        <div className="apibar">
          <span className="apibar-label"><span className="imdb-logo">OMDb</span>KEY</span>
          <input type="password" placeholder="OMDb API key…" value={apiKey}
            onChange={e=>{setApiKey(e.target.value);setApiStatus("idle");setApiError("");}}
            onBlur={()=>verifyKey(apiKey)}/>
          <span className={`apibar-st ${apiStatus==="ok"?"st-ok":apiStatus==="err"?"st-err":"st-idle"}`}>
            {apiStatus==="ok"?"● connected":apiStatus==="err"?"✗ invalid":"○ unverified"}
          </span>
          <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noreferrer" style={{fontFamily:"IBM Plex Mono",fontSize:".65rem",color:"var(--accent2)",textDecoration:"none"}}>get key →</a>
        </div>
        {apiError&&<div className="err-msg">{apiError}</div>}
        {!dbOnline&&<div className="err-msg">⚠ SQLite server offline — run: <code>node server.js</code></div>}

        {/* DB Inspector */}
        {dbOnline&&<DbInspector dbStats={dbStats} onRefresh={refreshDbStats}/>}

        {/* Input */}
        <div className="ipanel">
          <div className="ipanel-hdr"><span className="dot"/>rclone lsl output</div>
          <textarea value={text} onChange={e=>setText(e.target.value)}
            placeholder="   4831838976 2024-01-10 14:23:11.000000000 ShowName/Season 1/ShowName - S01E01.mkv"
            spellCheck={false}/>
          <div className="iactions">
            <button className="btn btn-g" onClick={parse}>▶ PARSE</button>
            <button className="btn btn-y" onClick={enrichAll} disabled={!apiKey||enriching||shows.length===0}>
              {enriching?<><div className="spin" style={{display:"inline-block",marginRight:6}}/>ENRICHING…</>:"⬇ ENRICH ALL"}
            </button>
            {enriching&&<button className="btn btn-d" onClick={()=>abortRef.current=true}>■ STOP</button>}
            {shows.some(s=>s.omdb)&&<button className="btn btn-b btn-sm" onClick={()=>exportMissingCSV(shows)}>⬇ Missing CSV</button>}
            <button className="btn btn-d" onClick={()=>{setText(SAMPLE);setShows([]);setMovies([]);setStats(null);}}>SAMPLE</button>
            <button className="btn btn-d" onClick={()=>{setText("");setShows([]);setMovies([]);setStats(null);}}>CLEAR</button>
            <span className="hint">rclone lsl · lsf · plain paths</span>
          </div>
        </div>

        {enriching&&<div className="prog"><div className="prog-fill" style={{width:`${progress}%`}}/></div>}

        {/* Stats */}
        {stats&&shows.length>0&&(
          <div className="stats">
            <div className="stat"><div className="stat-lbl">Vault Size</div><div className="stat-val g">{formatBytes(stats.totalSize)}</div></div>
            <div className="stat"><div className="stat-lbl">Shows</div><div className="stat-val">{shows.length}</div></div>
            <div className="stat"><div className="stat-lbl">Episodes</div><div className="stat-val">{shows.reduce((s,sh)=>s+sh.episodeCount,0)}</div></div>
            <div className="stat"><div className="stat-lbl">Missing</div><div className={`stat-val ${totalMissing>0?"r":"g"}`}>{totalMissing||"✓"}</div></div>
            <div className="stat"><div className="stat-lbl">Movies</div><div className="stat-val">{movies.length}</div></div>
            {totalDups>0&&<div className="stat"><div className="stat-lbl">Duplicates</div><div className="stat-val" style={{color:"#a855f7"}}>{totalDups}</div></div>}
            {shows.some(s=>s.omdb?.imdbRating&&s.omdb.imdbRating!=="N/A")&&(
              <div className="stat"><div className="stat-lbl">Avg IMDb</div>
              <div className="stat-val y">★{(shows.filter(s=>s.omdb?.imdbRating&&s.omdb.imdbRating!=="N/A").reduce((s,sh)=>s+parseFloat(sh.omdb.imdbRating),0)/shows.filter(s=>s.omdb?.imdbRating&&s.omdb.imdbRating!=="N/A").length).toFixed(1)}</div></div>
            )}
          </div>
        )}

        {/* Toolbar */}
        {shows.length>0&&(
          <div className="toolbar">
            <div className="sbox">
              <span style={{color:"var(--text3)",fontSize:".9rem"}}>⌕</span>
              <input placeholder="filter shows…" value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            <select className="sortsel" value={sort} onChange={e=>setSort(e.target.value)}>
              <option value="name">name</option>
              <option value="size">size</option>
              <option value="rating">rating</option>
              <option value="episodes">episodes</option>
              <option value="progress">progress</option>
            </select>
            <div className="fbtns">
              {["all","missing","complete","dupes","anime"].map(f=>(
                <button key={f} className={`fbtn ${filter===f?"on":""}`} onClick={()=>setFilter(f)}>{f}</button>
              ))}
            </div>
            <div className="vbtns">
              <button className={`vbtn ${view==="tile"?"on":""}`} onClick={()=>setView("tile")} title="Grid">⊞</button>
              <button className={`vbtn ${view==="wall"?"on":""}`} onClick={()=>setView("wall")} title="Wall">▦</button>
            </div>
          </div>
        )}

        {/* Shows */}
        {shows.length>0&&(
          <>
            <div className="sec-ttl">TV shows · {filtered.length}</div>
            <div className={`tile-grid ${view==="wall"?"wall":""}`}>
              {filtered.map(s=><ShowTile key={s.name} show={s}/>)}
            </div>
          </>
        )}

        {/* Movies */}
        {movies.length>0&&shows.length>0&&(
          <>
            <div className="sec-ttl" style={{display:"flex",alignItems:"center",gap:10}}>
              <span>movies · {movies.length}</span>
              <select className="sortsel" style={{fontSize:".62rem",padding:"3px 8px"}} value={movieSort} onChange={e=>setMovieSort(e.target.value)}>
                <option value="size">size</option>
                <option value="rating">rating</option>
                <option value="decade">decade</option>
                <option value="runtime">runtime</option>
                <option value="genre">genre</option>
              </select>
            </div>
            <div className={`tile-grid ${view==="wall"?"wall":""}`}>
              {sortedMovies.map((m,i)=><MovieTile key={i} movie={m}/>)}
            </div>
          </>
        )}

        {stats&&shows.length===0&&movies.length===0&&(
          <div className="empty">no media detected · paste <span>rclone lsl</span> output and hit <span>▶ PARSE</span></div>
        )}
      </div>

      {selected&&(
        <DetailPanel
          item={selected.item} type={selected.type}
          overrides={overrides} onClose={()=>setSelected(null)}
          onEnrich={selected.type==="series"?enrichShow:enrichMovie}
          onEnrichAnime={enrichAnime}
          onSaveOverride={saveOverride} onClearOverride={clearOverride}
          onFetchById={fetchById} apiKey={apiKey}
        />
      )}
    </>
  );
}
