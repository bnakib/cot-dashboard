export const GROUPS = [
  {id:'large', label:'Large speculators', official:'Non-commercial', color:'#64d6c4'},
  {id:'small', label:'Small speculators', official:'Non-reportable', color:'#b6a0ff'},
  {id:'commercial', label:'Commercials', official:'Commercial', color:'#f1b66b'}
];
export function netPercent(record, group) { return record.openInterest ? record[group].net / record.openInterest * 100 : null; }
export function chartValue(record, previous, group, unit, changes=false) {
  if (!changes) return unit === 'percent' ? netPercent(record, group) : record[group].net;
  if (!record[group].change || !previous) return null;
  if (unit === 'percent') {
    const now = netPercent(record, group), before = netPercent(previous, group);
    return now === null || before === null ? null : now - before;
  }
  return record[group].change.net;
}
export function rangeRecords(records, range, endDate) {
  const end = new Date(endDate + 'T00:00:00Z');
  const months = {'3m':3,'6m':6,'1y':12}[range];
  const start = new Date(end);
  if (months) start.setUTCMonth(start.getUTCMonth() - months);
  return records.filter(r => r.date <= endDate && (!months || new Date(r.date + 'T00:00:00Z') >= start));
}
export function csvForMarket(market) {
  const columns = ['date','open_interest','noncommercial_spreading', ...GROUPS.flatMap(g => ['long','short','net','change_long','change_short','change_net'].map(k => g.id+'_'+k))];
  const rows = market.records.map(r => [r.date,r.openInterest,r.spreading,...GROUPS.flatMap(g => [r[g.id].long,r[g.id].short,r[g.id].net,r[g.id].change?.long ?? '',r[g.id].change?.short ?? '',r[g.id].change?.net ?? ''])]);
  return columns.join(',')+'\n'+rows.map(r => r.join(',')).join('\n')+'\n';
}

if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const state = {index:null, market:null, code:null, date:null, range:'all', unit:'contracts', visible:new Set(GROUPS.map(g=>g.id)), cache:new Map(), request:0};
  const fmt = new Intl.NumberFormat('en-US');
  const signed = n => n == null ? '—' : (n>0?'+':n<0?'−':'')+fmt.format(Math.abs(n));
  const pct = n => n == null ? '—' : (n>0?'+':n<0?'−':'')+Math.abs(n).toFixed(1)+'%';
  const cls = n => n>0?'up':n<0?'down':'neutral';
  const prettyDate = d => new Date(d+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storage = {get:k=>{try{return localStorage.getItem(k);}catch{return null;}},set:(k,v)=>{try{localStorage.setItem(k,v);}catch{}}};
  async function fetchJSON(path) {
    const response = await fetch(path, {cache:'no-cache'});
    if (!response.ok) throw new Error(`Data request failed (${response.status})`);
    return response.json();
  }
  function showError(message) {
    $('loading').hidden=false; $('dashboard').hidden=true;
    $('loading').innerHTML=`<h2>Data could not be loaded</h2><p>${escape(message)}</p><button class="button" id="retry">Try again</button>`;
    $('retry').onclick=()=>location.reload();
  }
  function filterMarkets() {
    if (!state.index?.markets?.length) return;
    const query=$('search').value.toLowerCase().trim();
    const category=$('category').value;
    const markets=state.index.markets.filter(m=>(category==='all'||m.category===category)&&(!query||(m.name+' '+m.code).toLowerCase().includes(query))&&(!$('activeOnly').checked||m.latestDate===state.index.latestDate));
    $('market').replaceChildren(...markets.map(m=>{const o=document.createElement('option');o.value=m.code;o.textContent=m.name;return o;}));
    $('market').disabled=!markets.length;
    if (!markets.length) {
      state.request++; $('dashboard').hidden=true; $('loading').hidden=false;
      $('loading').textContent='No matching markets. Try another search or include older markets.';
      return;
    }
    const wanted=markets.find(m=>m.code===state.code)||markets.find(m=>m.code===storage.get('cot-market'))||markets.find(m=>m.code==='067651')||markets[0];
    $('market').value=wanted.code;
    loadMarket(wanted.code);
  }
  async function loadMarket(code) {
    const request=++state.request;
    $('dashboard').hidden=true; $('loading').hidden=false; $('loading').textContent='Loading market history…';
    $('tooltip').hidden=true;
    try {
      const market=state.cache.get(code)||await fetchJSON(`./data/${encodeURIComponent(code)}.json`);
      if(request!==state.request)return;
      if(!market.records?.length)throw new Error('This market has no observations.');
      state.cache.set(code,market); state.market=market; state.code=code;
      state.date=market.records.at(-1).date;storage.set('cot-market',code);
      $('reportDate').replaceChildren(...market.records.toReversed().map(r=>{const o=document.createElement('option');o.value=r.date;o.textContent=prettyDate(r.date);return o;}));
      $('marketName').textContent=market.name;
      $('marketSector').textContent=market.category+' · LEGACY FUTURES ONLY';
      $('marketMeta').textContent=`CFTC market ${code} · ${market.records.length} observations · ${prettyDate(market.records[0].date)} onward`;
      $('loading').hidden=true; $('dashboard').hidden=false; render();
    }catch(error){if(request===state.request)showError(error.message);}
  }
  function render() {
    if(!state.market)return;
    const records=state.market.records, idx=records.findIndex(r=>r.date===state.date), r=records[idx], previous=records[idx-1];
    $('reportDate').value=r.date;
    $('comparison').textContent=previous?`Compared with ${prettyDate(previous.date)}${r.gapDays!==7?' · '+r.gapDays+'-day gap':''}`:'First available observation · No previous-report comparison';
    const old=state.market.records.at(-1).date!==state.index.latestDate;
    const history=r.date!==state.market.records.at(-1).date;
    $('notice').hidden=!old&&!history;
    $('notice').textContent=old?`This market’s latest observation is ${prettyDate(state.market.records.at(-1).date)}. The dataset contains newer reports for other markets.`:`Viewing a historical report from ${prettyDate(r.date)}. Select the most recent date to return to current positioning.`;
    $('openInterest').textContent=fmt.format(r.openInterest);
    $('oiChange').textContent=previous?signed(r.openInterest-previous.openInterest)+' vs previous report':'No prior observation';
    $('cards').innerHTML=GROUPS.map(g=>{
      const change=r[g.id].change?.net;
      return `<article class="card" style="--group:${g.color}"><div class="card-title">${g.label}<span class="badge">${r[g.id].net>0?'NET LONG':r[g.id].net<0?'NET SHORT':'BALANCED'}</span></div><strong>${signed(r[g.id].net)}</strong><p><span class="${cls(change)}">${signed(change)}</span> net change vs previous report</p><small>${pct(netPercent(r,g.id))} of open interest</small></article>`;
    }).join('');
    $('positionRows').innerHTML=GROUPS.map(g=>`<tr><td><span class="table-dot" style="--group:${g.color}"></span>${g.label}<small>${g.official}</small></td><td>${fmt.format(r[g.id].long)}</td><td class="${cls(r[g.id].change?.long)}">${signed(r[g.id].change?.long)}</td><td>${fmt.format(r[g.id].short)}</td><td class="${cls(r[g.id].change?.short)}">${signed(r[g.id].change?.short)}</td><td>${signed(r[g.id].net)}</td><td class="${cls(r[g.id].change?.net)}">${signed(r[g.id].change?.net)}</td></tr>`).join('');
    $('spreading').textContent=`Non-commercial spreading: ${fmt.format(r.spreading)} contracts. Spreading is balanced exposure excluded from directional net positions and included on each side when reconciling open interest. Green/red changes mean an increase/decrease, not a buy/sell recommendation.`;
    $('changeUnit').textContent=state.unit==='percent'?'Change in net share of open interest · percentage points':'Net contracts added or reduced';
    $('legend').innerHTML=GROUPS.map(g=>`<button data-group="${g.id}" class="${state.visible.has(g.id)?'':'off'}" aria-pressed="${state.visible.has(g.id)}"><span class="swatch" style="--group:${g.color}"></span>${g.label}</button>`).join('');
    $('legend').querySelectorAll('button').forEach(b=>b.onclick=()=>{
      if(state.visible.has(b.dataset.group)){if(state.visible.size===1)return;state.visible.delete(b.dataset.group);}else state.visible.add(b.dataset.group);
      render();
    });
    const visible=rangeRecords(records,state.range,state.date);
    drawChart('positionChart',visible,false); drawChart('changeChart',visible,true);
  }
  function drawChart(id, records, changes) {
    const target=$(id), width=Math.max(600,target.clientWidth), height=changes?225:310;
    const left=65,right=20,top=20,bottom=35,w=width-left-right,h=height-top-bottom;
    const dates=records.map(r=>Date.parse(r.date+'T00:00:00Z'));
    let minX=dates[0],maxX=dates.at(-1);if(minX===maxX){minX-=86400000*3;maxX+=86400000*3;}
    const x=d=>left+(Date.parse(d+'T00:00:00Z')-minX)/(maxX-minX)*w;
    const all=state.market.records, byDate=new Map(all.map((r,i)=>[r.date,all[i-1]]));
    const series=GROUPS.filter(g=>state.visible.has(g.id));
    const value=(r,g)=>chartValue(r,byDate.get(r.date),g.id,state.unit,changes);
    const values=records.flatMap(r=>series.map(g=>value(r,g))).filter(v=>v!==null);
    let low=Math.min(0,...values),high=Math.max(0,...values);
    if(low===high){low=-1;high=1;}const pad=(high-low)*.12;low-=pad;high+=pad;
    const y=v=>top+(high-v)/(high-low)*h;
    const tick=n=>state.unit==='percent'?n.toFixed(1)+(changes?' pp':'%'):Math.abs(n)>=1e6?(n/1e6).toFixed(1)+'M':Math.abs(n)>=1e3?(n/1e3).toFixed(0)+'k':n.toFixed(0);
    let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${changes?'Change in net positions':'Net positions'} from ${escape(records[0].date)} through ${escape(records.at(-1).date)}"><title>${changes?'Change in net positions':'Net positions'}; use the report selector for exact accessible values</title>`;
    for(let i=0;i<=4;i++){const v=low+(high-low)*i/4;svg+=`<line class="svg-grid" x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}"/><text class="svg-axis" text-anchor="end" x="${left-10}" y="${y(v)+4}">${tick(v)}</text>`;}
    svg+=`<line class="svg-zero" x1="${left}" x2="${width-right}" y1="${y(0)}" y2="${y(0)}"/>`;
    const tickCount=Math.min(6,records.length);
    for(let i=0;i<tickCount;i++){
      const r=records[Math.round(i*(records.length-1)/Math.max(1,tickCount-1))];
      const label=new Date(r.date+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',year:'2-digit',timeZone:'UTC'});
      svg+=`<text class="svg-axis" text-anchor="middle" x="${x(r.date)}" y="${height-10}">${label}</text>`;
    }
    if(changes){
      const band=Math.min(20,w*7*86400000/(maxX-minX)*.72),bw=band/series.length;
      records.forEach(r=>series.forEach((g,j)=>{const v=value(r,g);if(v===null)return;const xpos=x(r.date)-band/2+bw*j,yp=y(v);svg+=`<rect x="${xpos}" y="${Math.min(yp,y(0))}" width="${Math.max(.8,bw-.5)}" height="${Math.max(.7,Math.abs(yp-y(0)))}" fill="${g.color}" opacity=".85"/>`;}));
    }else{
      series.forEach(g=>{
        let drawing=false;let path='';
        records.forEach((r,i)=>{const v=value(r,g);if(v===null){drawing=false;return;}const gap=i>0&&(dates[i]-dates[i-1])>8*86400000;path+=(drawing&&!gap?' L':' M')+x(r.date)+','+y(v);drawing=true;});
        svg+=`<path d="${path}" fill="none" stroke="${g.color}" stroke-width="2" stroke-linejoin="round"/>`;
        if(records.length===1){const v=value(records[0],g);if(v!==null)svg+=`<circle cx="${x(records[0].date)}" cy="${y(v)}" r="4" fill="${g.color}"/>`;}
      });
    }
    svg+=`<line class="svg-selected" x1="${x(state.date)}" x2="${x(state.date)}" y1="${top}" y2="${height-bottom}"/><line class="svg-cursor" visibility="hidden" x1="0" x2="0" y1="${top}" y2="${height-bottom}"/><rect class="svg-overlay" x="${left}" y="${top}" width="${w}" height="${h}"/></svg>`;
    target.innerHTML=svg;
    const overlay=target.querySelector('.svg-overlay');
    function nearest(event){const rect=target.querySelector('svg').getBoundingClientRect();const pos=(event.clientX-rect.left)/rect.width*width;return records.reduce((best,r)=>Math.abs(x(r.date)-pos)<Math.abs(x(best.date)-pos)?r:best,records[0]);}
    overlay.onpointermove=event=>{
      const r=nearest(event);const tooltip=$('tooltip');
      const number=v=>v===null?'—':state.unit==='percent'?(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(2)+(changes?' pp':'%'):signed(v);
      tooltip.innerHTML=`<strong>${prettyDate(r.date)}</strong><small>${changes?'Change versus '+(r.previousDate?prettyDate(r.previousDate):'no prior report'):'Net positioning'}${changes&&r.gapDays!==7&&r.gapDays?' · '+r.gapDays+'-day gap':''}</small>`+series.map(g=>`<div class="tip-row"><span style="color:${g.color}">${g.label}</span><b>${number(value(r,g))}</b></div>`).join('');
      tooltip.hidden=false;
      tooltip.style.left=Math.max(8,Math.min(event.clientX+15,innerWidth-tooltip.offsetWidth-12))+'px';
      tooltip.style.top=Math.max(8,Math.min(event.clientY+15,innerHeight-tooltip.offsetHeight-12))+'px';
      for(const name of ['positionChart','changeChart']){const cursor=$(name).querySelector('.svg-cursor');if(cursor){cursor.setAttribute('x1',x(r.date));cursor.setAttribute('x2',x(r.date));cursor.setAttribute('visibility','visible');}}
    };
    overlay.onpointerleave=()=>{$('tooltip').hidden=true;document.querySelectorAll('.svg-cursor').forEach(c=>c.setAttribute('visibility','hidden'));};
    overlay.onclick=event=>{state.date=nearest(event).date;$('tooltip').hidden=true;render();};
  }
  $('search').oninput=filterMarkets;$('category').onchange=filterMarkets;$('activeOnly').onchange=filterMarkets;
  $('market').onchange=()=>loadMarket($('market').value);
  $('reportDate').onchange=()=>{state.date=$('reportDate').value;render();};
  $('unit').onchange=()=>{state.unit=$('unit').value;render();};
  document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{state.range=b.dataset.range;document.querySelectorAll('[data-range]').forEach(v=>{const selected=v===b;v.classList.toggle('selected',selected);v.setAttribute('aria-pressed',String(selected));});render();});
  $('download').onclick=()=>{
    const blob=new Blob([csvForMarket(state.market)],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`cot-${state.code}-2023-onward.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(!$('dashboard').hidden)render();},150);});
  (async()=>{
    try{
      state.index=await fetchJSON('./data/index.json');
      if(!state.index.markets?.length){
        $('statusText').textContent='Awaiting first CFTC download';$('loading').innerHTML='<h2>The dashboard is ready for its first data import.</h2><p>In the repository’s Actions tab, run <strong>Update COT data and deploy</strong>. It downloads official CFTC history from 2023 and publishes the charts. No sample positions are displayed.</p><a class="button" href="https://github.com/bnakib/cot-dashboard/actions">Open GitHub Actions ↗</a>';
        return;
      }
      const age=(Date.now()-Date.parse(state.index.latestDate+'T00:00:00Z'))/86400000;
      $('statusDot').classList.add(age>10?'stale':'fresh');
      $('statusText').textContent=`${age>10?'Older report · ':''}Positions as of ${prettyDate(state.index.latestDate)}`;
      $('refreshText').textContent=`${state.index.markets.length} markets · Data updated ${new Date(state.index.updatedAt).toLocaleString()}`;
      filterMarkets();
    }catch(error){$('statusText').textContent='Data unavailable';showError(error.message);}
  })();
}
