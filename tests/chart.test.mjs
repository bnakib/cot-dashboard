import test from 'node:test';
import assert from 'node:assert/strict';
import {GROUPS, netPercent, chartValue, rangeRecords, csvForMarket} from '../site/app.mjs';
function record(date,oi,net,change=null) {
  return {date,openInterest:oi,spreading:10,...Object.fromEntries(GROUPS.map(g=>[g.id,{long:40,short:20,net,change:change===null?null:{long:5,short:-2,net:change}}]))};
}
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
test('CSV includes raw long, short and net changes and leaves missing comparisons empty',()=>{
  const csv=csvForMarket({records:[record('2023-01-03',100,20),record('2023-01-10',100,27,7)]});
  const lines=csv.trimEnd().split('\n'), headers=lines[0].split(','), first=lines[1].split(','), second=lines[2].split(',');
  assert.equal(first.length,headers.length);
  assert.equal(second.length,headers.length);
  assert.equal(first[headers.indexOf('large_change_net')],'');
  assert.equal(second[headers.indexOf('large_change_short')],'-2');
  assert.equal(second[headers.indexOf('large_change_net')],'7');
});
