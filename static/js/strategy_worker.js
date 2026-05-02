// BroadCycle worker: parse + align + downsample off the main thread
self.onmessage = async (ev) => {
  const { indexCsvText, indexCsvTexts, moneyGrowText, maxPoints } = ev.data;

  function parseCsv(text){
    const lines = (text||"").trim().split(/\r?\n/);
    if(lines.length < 2) return [];
    const header = lines[0].split(',').map(s=>s.trim().toLowerCase());
    const out=[];
    for(let i=1;i<lines.length;i++){
      const parts = lines[i].split(',');
      if(parts.length < 2) continue;
      let date="", close=NaN;
      for(let j=0;j<header.length && j<parts.length;j++){
        const key = header[j];
        const val = (parts[j]||"").trim();
        if(key==="date" || key==="trade_date") date = val.slice(0,10);
        if(key==="close" || key==="c") close = Number(val);
      }
      if(date && Number.isFinite(close)) out.push({date, close});
    }
    return out;
  }

  function parseMoneyGrow(text){
    const lines = (text||"").trim().split(/\r?\n/);
    const out=[];
    for(const line of lines){
      const s=(line||"").trim();
      if(!s || s.startsWith("#")) continue;
      const parts=s.split("|");
      if(parts.length < 2) continue;
      const ds=parts[0].trim();
      const date = ds.length===8 ? `${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}` : ds.slice(0,10);
      const total = Number(parts[1]);
      const rsi  = parts.length>5 ? Number(parts[5]) : NaN;
      const med  = parts.length>6 ? Number(parts[6]) : NaN;
      const deri = parts.length>7 ? Number(parts[7]) : NaN;
      const accu = parts.length>8 ? Number(parts[8]) : NaN;
      const st   = parts.length>9 ? Number(parts[9]) : NaN;
      function parseFlag(v){
      const s = String(v||"").trim();
      if(!s) return 0;
      if(s === "1" || s.toLowerCase()==="true") return 1;
      if(s === "0" || s.toLowerCase()==="false") return 0;
      const n = Number(s);
      if(Number.isFinite(n)) return n ? 1 : 0;
      return 0;
    }
      let passArc = 0;
      let arcTop  = 0;
      // Flags are usually the last two fields (just_pass_big_arc, big_arc_top).
      // Some historical files may have an extra numeric column earlier; using fixed indices can break.
      const f1 = parts.length>=2 ? parts[parts.length-2] : "";
      const f2 = parts.length>=1 ? parts[parts.length-1] : "";
      const cleanFlag = (v)=>{
        const s = String(v||"").trim().toLowerCase();
        return (s==="0"||s==="1"||s==="true"||s==="false");
      };
      if(parts.length >= 12 && cleanFlag(f1) && cleanFlag(f2)){
        passArc = parseFlag(f1);
        arcTop  = parseFlag(f2);
      }else{
        // legacy layout
        passArc = parts.length>10 ? parseFlag(parts[10]) : 0;
        arcTop  = parts.length>11 ? parseFlag(parts[11]) : 0;
        // fallback: if tail looks like flags, prefer tail
        if(cleanFlag(f1) && cleanFlag(f2)){
          passArc = parseFlag(f1);
          arcTop  = parseFlag(f2);
        }
      }
      if(date && Number.isFinite(total)){
        out.push({date, total, rsi, med, deri, accu, st, passArc, arcTop});
      }
    }
    out.sort((a,b)=>a.date.localeCompare(b.date));
    return out;
  }



function sma(arr, period){
  const out=new Array(arr.length).fill(NaN);
  let sum=0, cnt=0;
  for(let i=0;i<arr.length;i++){
    const v=arr[i];
    if(Number.isFinite(v)){
      sum += v; cnt += 1;
    }
    if(i>=period){
      const prev=arr[i-period];
      if(Number.isFinite(prev)){
        sum -= prev; cnt -= 1;
      }
    }
    if(i>=period-1 && cnt===period){
      out[i]=sum/period;
    }
  }
  return out;
}

function computeRSI(close, period){
  const rsi=new Array(close.length).fill(NaN);
  let avgGain=0, avgLoss=0;
  let gains=0, losses=0, n=0;
  for(let i=1;i<close.length && n<period;i++){
    const a=close[i-1], b=close[i];
    if(!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const ch=b-a;
    if(ch>=0) gains+=ch; else losses+=-ch;
    n++;
    if(n===period){
      avgGain=gains/period;
      avgLoss=losses/period;
      const rs=avgLoss===0 ? Infinity : (avgGain/avgLoss);
      rsi[i]=100 - (100/(1+rs));
    }
  }
  for(let i=period+1;i<close.length;i++){
    const a=close[i-1], b=close[i];
    if(!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const ch=b-a;
    const gain = ch>0 ? ch : 0;
    const loss = ch<0 ? -ch : 0;
    avgGain = (avgGain*(period-1) + gain)/period;
    avgLoss = (avgLoss*(period-1) + loss)/period;
    const rs = avgLoss===0 ? Infinity : (avgGain/avgLoss);
    rsi[i]=100 - (100/(1+rs));
  }
  return rsi;
}

function computeDerivedIndicators(close){
  const ma20=sma(close, 20);
  const ma5=sma(close, 5);
  const med=new Array(close.length).fill(NaN);
  const deri=new Array(close.length).fill(NaN);
  const accu=new Array(close.length).fill(NaN);
  const st=new Array(close.length).fill(NaN);
  let acc=0;
  for(let i=0;i<close.length;i++){
    if(Number.isFinite(close[i]) && Number.isFinite(ma20[i]) && ma20[i]!==0){
      med[i]=close[i]/ma20[i];
    }
    if(i>0 && Number.isFinite(med[i]) && Number.isFinite(med[i-1])){
      deri[i]=med[i]-med[i-1];
    }
    if(Number.isFinite(deri[i])){
      acc += deri[i];
      accu[i]=acc;
    }
    if(Number.isFinite(ma5[i]) && Number.isFinite(ma20[i])){
      st[i]=ma5[i]-ma20[i];
    }
  }
  return {med, deri, accu, st};
}

  function alignSingle(idxRows, mgRows){
    const m = new Map(mgRows.map(x=>[x.date,x]));
    const dates=[], idx=[], eq=[], rsi=[], med=[], deri=[], accu=[], st=[], passArc=[], arcTop=[];
    for(const r of idxRows){
      const mm=m.get(r.date);
      if(!mm) continue;
      dates.push(r.date);
      idx.push(r.close);
      eq.push(mm.total);
      rsi.push(Number.isFinite(mm.rsi)?mm.rsi:null);
      med.push(Number.isFinite(mm.med)?mm.med:null);
      deri.push(Number.isFinite(mm.deri)?mm.deri:null);
      accu.push(Number.isFinite(mm.accu)?mm.accu:null);
      st.push(Number.isFinite(mm.st)?mm.st:null);
      passArc.push(!!mm.passArc);
      arcTop.push(!!mm.arcTop);
    }
        const idxRaw = idx.slice();
    // Scale index to equity range so both are visually comparable
    const eq0 = eq.find(v=>v!=null && Number.isFinite(v));
    const idx0 = idx.find(v=>v!=null && Number.isFinite(v));
    if(Number.isFinite(eq0) && Number.isFinite(idx0) && idx0 !== 0){
      for(let i=0;i<idx.length;i++){
        const v=idx[i];
        idx[i]= (v!=null && Number.isFinite(v)) ? (v * (eq0/idx0)) : null;
      }
    }
// If MoneyGrow does not provide indicator columns (all missing), compute from index close as a fallback.
function hasAnyFinite(arr){ return Array.isArray(arr) && arr.some(v => v!=null && Number.isFinite(v)); }
if(!(hasAnyFinite(rsi) || hasAnyFinite(med) || hasAnyFinite(deri) || hasAnyFinite(accu) || hasAnyFinite(st))){
  const rsiCalc = computeRSI(idxRaw, 14);
  const derived = computeDerivedIndicators(idxRaw);
  for(let i=0;i<idx.length;i++){
    rsi[i]=rsiCalc[i];
    med[i]=derived.med[i];
    deri[i]=derived.deri[i];
    accu[i]=derived.accu[i];
    st[i]=derived.st[i];
  }
}

    return {dates, idx, idxRaw, eq, rsi, med, deri, accu, st, passArc, arcTop};
  }

  function alignMulti(idxRowsList, mgRows){
    // Base on moneyGrow dates; each index may have missing dates.
    const idxMaps = idxRowsList.map(rows=>new Map(rows.map(r=>[r.date,r.close])));
    const dates=[], eq=[];
    const idxs = idxRowsList.map(()=>[]);
    for(const mm of mgRows){
      dates.push(mm.date);
      eq.push(mm.total);
      for(let k=0;k<idxMaps.length;k++){
        const v = idxMaps[k].get(mm.date);
        idxs[k].push(Number.isFinite(v)?v:null);
      }
    }

    // Keep raw copies for indicators / tooltips
    const idxsRaw = idxs.map(arr => arr.slice());

    // For display in the main chart, normalize each index to equity start so shapes are comparable on one axis.
    const eq0 = eq.find(v=>v!=null && Number.isFinite(v));
    for(let k=0;k<idxs.length;k++){
      const idx0 = idxs[k].find(v=>v!=null && Number.isFinite(v));
      if(Number.isFinite(eq0) && Number.isFinite(idx0) && idx0 !== 0){
        for(let i=0;i<idxs[k].length;i++){
          const v=idxs[k][i];
          idxs[k][i] = (v!=null && Number.isFinite(v)) ? (v * (eq0/idx0)) : null;
        }
      }
    }

    // Compute indicator panel series from the equity curve (portfolio), since multiple indices are present.
    const rsiCalc = computeRSI(eq, 14);
    const derived = computeDerivedIndicators(eq);

    const rsi = rsiCalc.map(v => Number.isFinite(v)?v:null);
    const med = derived.med.map(v => Number.isFinite(v)?v:null);
    const deri = derived.deri.map(v => Number.isFinite(v)?v:null);
    const accu = derived.accu.map(v => Number.isFinite(v)?v:null);
    const st   = derived.st.map(v => Number.isFinite(v)?v:null);

    const passArc = mgRows.map(mm => !!mm.passArc);
    const arcTop  = mgRows.map(mm => !!mm.arcTop);

    return {dates, idxs, idxsRaw, eq, rsi, med, deri, accu, st, passArc, arcTop};
  }

  function downsample(data, maxPts){
    const n = data.dates.length;
    if(n <= maxPts) return data;

    // Build the exact sample index list once so every array stays aligned.
    const step = Math.ceil(n / maxPts);
    const sampleIdx = [];
    for(let i=0;i<n;i+=step) sampleIdx.push(i);
    if(sampleIdx[sampleIdx.length-1] !== n-1) sampleIdx.push(n-1);

    const takeByIdx = (arr)=>{
      if(!arr) return null;
      const o=[];
      for(const i of sampleIdx) o.push(arr[i]);
      return o;
    };

    // For sparse boolean/event flags (like big-arc marks), plain sampling can miss rare True points.
    // Instead, OR within each chunk [sampleIdx[k], sampleIdx[k+1]) so events are preserved.
    const takeFlagChunkAny = (arr)=>{
      if(!arr) return null;
      const o=[];
      for(let k=0;k<sampleIdx.length;k++){
        const a = sampleIdx[k];
        const b = (k+1<sampleIdx.length) ? sampleIdx[k+1] : (a+1);
        let any = false;
        for(let j=a;j<Math.min(b, n);j++){
          if(arr[j]) { any = true; break; }
        }
        // Ensure last point reflects the last record exactly
        if(k === sampleIdx.length-1) any = !!arr[n-1];
        o.push(any);
      }
      return o;
    };

    return {
      dates: takeByIdx(data.dates),
      idx: data.idx ? takeByIdx(data.idx) : null,
      idxRaw: data.idxRaw ? takeByIdx(data.idxRaw) : null,
      idxs: data.idxs ? data.idxs.map(takeByIdx) : null,
      idxsRaw: data.idxsRaw ? data.idxsRaw.map(takeByIdx) : null,
      eq: takeByIdx(data.eq),
      rsi: takeByIdx(data.rsi),
      med: takeByIdx(data.med),
      deri: takeByIdx(data.deri),
      accu: takeByIdx(data.accu),
      st: takeByIdx(data.st),
      passArc: data.passArc ? takeFlagChunkAny(data.passArc) : null,
      arcTop: data.arcTop ? takeFlagChunkAny(data.arcTop) : null,
    };
  }

  try{
    const mgRows = parseMoneyGrow(moneyGrowText);
    const idxTextList = Array.isArray(indexCsvTexts) ? indexCsvTexts : (indexCsvText ? [indexCsvText] : []);
    const idxRowsList = idxTextList.map(parseCsv);

    const aligned = (idxRowsList.length <= 1)
      ? alignSingle(idxRowsList[0] || [], mgRows)
      : alignMulti(idxRowsList, mgRows);

    const data = downsample(aligned, maxPoints || 1200);
    self.postMessage({
      ok:true,
      data,
      meta:{
        idxSeries: (data.idxs ? data.idxs.length : 1),
        aligned: data.dates.length
      }
    });
  }catch(e){
    self.postMessage({ ok:false, error: String(e && e.message ? e.message : e) });
  }
};
