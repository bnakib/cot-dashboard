import test from 'node:test';
import assert from 'node:assert/strict';
import {GROUPS, netPercent, chartValue, rangeRecords, csvForMarket, roundingNotice, cotIndexSeries} from '../site/app.mjs';
import {marketInfo, matchingMarkets} from '../site/markets.mjs';
function record(date,oi,net,change=null) {
  return {date,openInterest:oi,spreading:10,...Object.fromEntries(GROUPS.map(g=>[g.id,{long:40,short:20,net,change:change===null?null:{long:5,short:-2,net:change}}]))};
}
test('COT index places signed net positions at their historical low, high, and midpoint',()=>{
  const rows=[record('2023-01-03',100,-20),record('2023-01-10',100,20),record('2023-01-17',100,0),record('2023-01-24',100,-20)];
  const series=cotIndexSeries(rows,3);
  assert.equal(series.get(rows[1].date).large,100);
  assert.equal(series.get(rows[2].date).large,50);
  assert.equal(series.get(rows[3].date).large,0);
  assert.equal(series.get(rows[3].date).observations,3);
});
test('each trader group uses its own range and no future report affects earlier indices',()=>{
  const rows=[record('2023-01-03',100,10),record('2023-01-10',100,20),record('2023-01-17',100,15)];
  rows.forEach((r,i)=>{r.small.net=[30,10,5][i];r.commercial.net=[-40,-30,-20][i];});
  const prefix=cotIndexSeries(rows,3);
  assert.deepEqual(prefix.get('2023-01-17'),{observations:3,large:50,small:0,commercial:100});
  const full=cotIndexSeries([...rows,record('2023-01-24',100,1000)],3);
  for(const r of rows)assert.deepEqual(full.get(r.date),prefix.get(r.date));
});
test('flat and one-report windows are unavailable; partial windows report their actual size',()=>{
  const rows=[record('2023-01-03',100,20),record('2023-01-10',100,20)];
  const series=cotIndexSeries(rows);
  assert.equal(series.get(rows[0].date).large,null);
  assert.deepEqual(series.get(rows[1].date),{observations:2,large:null,small:null,commercial:null});
  assert.equal(chartValue(rows[1],rows[0],'large','index',true,series),null);
  for(const window of [1,0,-3,2.5])assert.throws(()=>cotIndexSeries(rows,window),RangeError);
});
test('weekly index changes use consecutive rolling indices, including when an old extreme rolls out',()=>{
  const rows=[record('2023-01-03',100,0),record('2023-01-10',100,10),record('2023-01-17',100,5),record('2023-01-24',100,5)];
  const series=cotIndexSeries(rows,3);
  assert.equal(chartValue(rows[2],rows[1],'large','index',false,series),50);
  assert.equal(chartValue(rows[2],rows[1],'large','index',true,series),-50);
  assert.equal(chartValue(rows[3],rows[2],'large','index',false,series),0);
  assert.equal(chartValue(rows[3],rows[2],'large','index',true,series),-50);
  assert.equal(chartValue(rows[0],null,'large','index',true,series),null);
});
test('changing the visible range does not renormalize the index',()=>{
  const rows=[record('2023-01-03',100,0),record('2023-01-10',100,10),record('2023-01-17',100,5)];
  const series=cotIndexSeries(rows,3);
  const visible=rangeRecords(rows,'1w','2023-01-17');
  assert.equal(visible.length,2);
  assert.equal(chartValue(visible[1],visible[0],'large','index',false,series),50);
  assert.equal(cotIndexSeries(visible,3).get('2023-01-17').large,0);
});
test('percent change is difference in share, not delta divided by current OI',()=>{
  const previous=record('2023-01-03',100,20), now=record('2023-01-10',200,30,10);
  assert.equal(netPercent(previous,'large'),20);
  assert.equal(chartValue(now,previous,'large','percent',true),-5);
  assert.equal(chartValue(now,previous,'large','contracts',true),10);
});
test('first observation has no fabricated weekly change',()=>{
  assert.equal(chartValue(record('2023-01-03',100,20),null,'large','contracts',true),null);
});
test('zero open interest is unavailable instead of infinity',()=>{
  assert.equal(netPercent(record('2023-01-03',0,0),'large'),null);
});
test('date filter excludes reports after the selected historical report',()=>{
  const rows=['2023-01-03','2023-06-06','2023-09-05','2023-10-03'].map(d=>record(d,100,20));
  assert.deepEqual(rangeRecords(rows,'3m','2023-09-05').map(r=>r.date),['2023-06-06','2023-09-05']);
  assert.equal(rangeRecords(rows,'all','2023-09-05').length,3);
});
test('week includes the prior weekly report and never invents missing observations',()=>{
  const rows=['2026-09-22','2026-09-29','2026-10-06','2026-10-13'].map(d=>record(d,100,20));
  assert.deepEqual(rangeRecords(rows,'1w','2026-10-06').map(r=>r.date),['2026-09-29','2026-10-06']);
  assert.deepEqual(rangeRecords([rows[0],rows[2]],'1w','2026-10-06').map(r=>r.date),['2026-10-06']);
});
test('month and year windows clamp at short months and leap years',()=>{
  const rows=['2023-02-27','2023-02-28','2023-03-01','2023-03-31','2023-04-01'].map(d=>record(d,100,20));
  assert.deepEqual(rangeRecords(rows,'1m','2023-03-31').map(r=>r.date),['2023-02-28','2023-03-01','2023-03-31']);
  assert.deepEqual(rangeRecords(rows,'1y','2024-02-29').map(r=>r.date),['2023-02-28','2023-03-01','2023-03-31','2023-04-01']);
});
test('ticker search identifies exact CFTC markets and corrects mapped sectors',()=>{
  const index={latestDate:'2026-10-06',markets:[
    {code:'067651',name:'WTI-PHYSICAL - NEW YORK MERCANTILE EXCHANGE',category:'Other',latestDate:'2026-10-06'},
    {code:'088691',name:'GOLD - COMMODITY EXCHANGE INC.',category:'Metals',latestDate:'2026-10-06'},
    {code:'023651',name:'NAT GAS NYME - NEW YORK MERCANTILE EXCHANGE',category:'Energy',latestDate:'2026-10-06'},
    {code:'058643',name:'RANDOM LENGTH LUMBER - CHICAGO MERCANTILE EXCHANGE',category:'Agriculture',latestDate:'2023-04-18'},
    {code:'13874+',name:'S&P 500 Consolidated - CHICAGO MERCANTILE EXCHANGE',category:'Financial',latestDate:'2026-10-06'}
  ]};
  assert.equal(marketInfo(index.markets[0]).label,'CL · WTI crude oil');
  assert.deepEqual(matchingMarkets(index,{query:' cl ',category:'Energy'}).map(m=>m.code),['067651']);
  assert.deepEqual(matchingMarkets(index,{query:'gold'}).map(m=>m.code),['088691']);
  assert.deepEqual(matchingMarkets(index,{query:'NG'}).map(m=>m.code),['023651']);
  assert.equal(matchingMarkets(index).length,3);
  assert.equal(matchingMarkets(index,{mainOnly:false}).length,4);
  assert.equal(matchingMarkets(index,{activeOnly:false}).length,4);
  assert.equal(marketInfo(index.markets[4]).ticker,null);
  assert.match(marketInfo(index.markets[4]).label,/Consolidated/);
  assert.deepEqual(matchingMarkets(index,{query:'13874+',mainOnly:false}).map(m=>m.code),['13874+']);
});
test('CSV includes raw long, short and net changes and leaves missing comparisons empty',()=>{
  const csv=csvForMarket({records:[record('2023-01-03',100,20),record('2023-01-10',100,27,7)]});
  const lines=csv.trimEnd().split('\n'), headers=lines[0].split(','), first=lines[1].split(','), second=lines[2].split(',');
  assert.equal(first.length,headers.length);
  assert.equal(second.length,headers.length);
  assert.equal(first[headers.indexOf('large_change_net')],'');
  assert.equal(second[headers.indexOf('large_change_short')],'-2');
  assert.equal(second[headers.indexOf('large_change_net')],'7');
});
test('rounding notice and CSV expose signed discrepancies without altering counts',()=>{
  const exact=record('2023-01-03',100,20), rounded=record('2023-01-10',100,20);
  rounded.roundingDifferences={long:1,short:-1,net:2};
  assert.equal(roundingNotice(exact),'');
  assert.match(roundingNotice(rounded),/long total minus open interest \+1/);
  assert.match(roundingNotice(rounded),/short total minus open interest -1/);
  assert.match(roundingNotice(rounded),/net balance \+2/);
  const lines=csvForMarket({records:[exact,rounded]}).trimEnd().split('\n').map(r=>r.split(','));
  const [headers,first,second]=lines;
  assert.equal(second[headers.indexOf('open_interest')],'100');
  assert.equal(second[headers.indexOf('large_net')],'20');
  assert.equal(second[headers.indexOf('rounding_flag')],'true');
  assert.equal(first[headers.indexOf('rounding_flag')],'false');
  assert.equal(second[headers.indexOf('long_total_minus_open_interest')],'1');
  assert.equal(second[headers.indexOf('short_total_minus_open_interest')],'-1');
  assert.equal(second[headers.indexOf('net_balance')],'2');
  assert.equal(first.length,headers.length);
  assert.equal(second.length,headers.length);
});
