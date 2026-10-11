// Exchange product roots, keyed by CFTC market identity. Never combine reports
// just because their product names are similar, or invent roots for aggregates.
// Product references: cmegroup.com/markets and ice.com/products.
export const FUTURES = {
  '067651':['CL','WTI crude oil','NYMEX','Energy'],
  '06765T':['BZ','Brent crude oil','NYMEX','Energy'],
  '023651':['NG','Natural gas','NYMEX','Energy'],
  '111659':['RB','RBOB gasoline','NYMEX','Energy'],
  '022651':['HO','Heating oil / ULSD','NYMEX','Energy'],
  '088691':['GC','Gold','COMEX','Metals'],
  '084691':['SI','Silver','COMEX','Metals'],
  '085692':['HG','Copper','COMEX','Metals'],
  '076651':['PL','Platinum','NYMEX','Metals'],
  '075651':['PA','Palladium','NYMEX','Metals'],
  '088695':['MGC','Micro gold','COMEX','Metals'],
  '002602':['ZC','Corn','CBOT','Agriculture'],
  '001602':['ZW','Chicago wheat','CBOT','Agriculture'],
  '001612':['KE','Kansas City wheat','CBOT','Agriculture'],
  '005602':['ZS','Soybeans','CBOT','Agriculture'],
  '026603':['ZM','Soybean meal','CBOT','Agriculture'],
  '007601':['ZL','Soybean oil','CBOT','Agriculture'],
  '004603':['ZO','Oats','CBOT','Agriculture'],
  '039601':['ZR','Rough rice','CBOT','Agriculture'],
  '033661':['CT','Cotton','ICE US','Agriculture'],
  '083731':['KC','Coffee','ICE US','Agriculture'],
  '080732':['SB','Sugar','ICE US','Agriculture'],
  '073732':['CC','Cocoa','ICE US','Agriculture'],
  '040701':['OJ','Orange juice','ICE US','Agriculture'],
  '057642':['LE','Live cattle','CME','Agriculture'],
  '054642':['HE','Lean hogs','CME','Agriculture'],
  '061641':['GF','Feeder cattle','CME','Agriculture'],
  '058644':['LBR','Lumber','CME','Agriculture'],
  '058643':['LBS','Lumber (retired)','CME','Agriculture'],
  '13874A':['ES','S&P 500','CME','Financial'],
  '209742':['NQ','Nasdaq 100','CME','Financial'],
  '239742':['RTY','Russell 2000','CME','Financial'],
  '13874U':['MES','Micro S&P 500','CME','Financial'],
  '209747':['MNQ','Micro Nasdaq 100','CME','Financial'],
  '239747':['M2K','Micro Russell 2000','CME','Financial'],
  '099741':['6E','Euro','CME','Financial'],
  '096742':['6B','British pound','CME','Financial'],
  '097741':['6J','Japanese yen','CME','Financial'],
  '090741':['6C','Canadian dollar','CME','Financial'],
  '232741':['6A','Australian dollar','CME','Financial'],
  '092741':['6S','Swiss franc','CME','Financial'],
  '112741':['6N','New Zealand dollar','CME','Financial'],
  '098662':['DX','US dollar index','ICE US','Financial'],
  '043602':['ZN','10-year Treasury note','CBOT','Financial'],
  '042601':['ZT','2-year Treasury note','CBOT','Financial'],
  '044601':['ZF','5-year Treasury note','CBOT','Financial'],
  '020601':['ZB','Treasury bond','CBOT','Financial'],
  '134741':['SR3','3-month SOFR','CME','Financial'],
  '133741':['BTC','Bitcoin','CME','Financial'],
  '146021':['ETH','Ether','CME','Financial'],
  '133742':['MBT','Micro bitcoin','CME','Financial'],
  '146022':['MET','Micro ether','CME','Financial'],
  '1170E1':['VX','VIX','CFE','Financial']
};
export const QUICK_MARKETS = ['067651','023651','088691','084691','085692','002602','001602','005602','083731','13874A','209742'];
export function marketInfo(market) {
  const mapped=FUTURES[market.code];
  if(mapped) {
    const [ticker,name,exchange,category]=mapped;
    return {ticker,name,exchange,category,label:`${ticker} · ${name}`};
  }
  const name=market.name.split(' - ')[0];
  return {ticker:null,name,exchange:null,category:market.category,label:`${name} · CFTC ${market.code}`};
}
export function matchingMarkets(index,{query='',category='all',mainOnly=true,activeOnly=true}={}) {
  const needle=query.trim().toLowerCase();
  const matches=index.markets.filter(m=>{
    const info=marketInfo(m);
    return (!mainOnly||info.ticker)&&(category==='all'||info.category===category)&&
      (!activeOnly||m.latestDate===index.latestDate)&&
      (!needle||`${info.ticker||''} ${info.name} ${info.exchange||''} ${m.name} ${m.code}`.toLowerCase().includes(needle));
  });
  const exact=matches.filter(m=>marketInfo(m).ticker?.toLowerCase()===needle);
  return (exact.length?exact:matches).sort((a,b)=>{
    const x=marketInfo(a),y=marketInfo(b);
    const exactX=x.ticker?.toLowerCase()===needle,exactY=y.ticker?.toLowerCase()===needle;
    return Number(exactY)-Number(exactX)||Number(Boolean(y.ticker))-Number(Boolean(x.ticker))||x.label.localeCompare(y.label);
  });
}
