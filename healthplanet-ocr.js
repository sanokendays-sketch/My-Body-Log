(() => {
  'use strict';
  const KEYS=['weight','bodyFat','muscleMass','bmi','visceralFat','basalMetabolism','bodyAge','boneMass','muscleQuality','bodyWater','pulse'];
  const LABELS={weight:'体重',bodyFat:'体脂肪率',muscleMass:'筋肉量',bmi:'BMI',visceralFat:'内臓脂肪レベル',basalMetabolism:'基礎代謝量',bodyAge:'体内年齢',boneMass:'推定骨量',muscleQuality:'筋質点数',bodyWater:'体水分率',pulse:'脈拍'};
  const UNITS={weight:'kg',bodyFat:'%',muscleMass:'kg',bmi:'',visceralFat:'',basalMetabolism:'kcal',bodyAge:'歳',boneMass:'kg',muscleQuality:'点',bodyWater:'%',pulse:'拍/分'};
  const RANGES={weight:[20,250],bodyFat:[2,70],muscleMass:[10,150],bmi:[10,60],visceralFat:[1,60],basalMetabolism:[500,4000],bodyAge:[10,100],boneMass:[.5,10],muscleQuality:[0,100],bodyWater:[20,80],pulse:[30,220]};
  const PRECISION={weight:2,bodyFat:2,muscleMass:2,bmi:1,visceralFat:1,basalMetabolism:0,bodyAge:0,boneMass:2,muscleQuality:0,bodyWater:1,pulse:0};
  const MAX_IMAGE_BYTES=25*1024*1024,MAX_IMAGE_PIXELS=36_000_000;
  const $=s=>document.querySelector(s),fileInput=$('#healthPlanetImage'),status=$('#healthPlanetOcrStatus'),resultBox=$('#healthPlanetOcrResults'),debugToggle=$('#healthPlanetDebugToggle'),debugCheck=$('#healthPlanetDebug'),debugBox=$('#healthPlanetOcrDebug');
  let pendingImage=null,pendingUrl=null;
  const debugEnabled=new URLSearchParams(location.search).has('ocrdebug');
  if(debugEnabled)debugToggle.classList.remove('hidden');

  function setStatus(s,type=''){status.textContent=s;status.className=`ocr-status ${type}`.trim()}
  function clearImage(){if(pendingUrl)URL.revokeObjectURL(pendingUrl);pendingUrl=null;pendingImage=null;fileInput.value=''}
  function loadImage(file){return new Promise((resolve,reject)=>{const img=new Image();pendingUrl=URL.createObjectURL(file);img.onload=()=>img.naturalWidth*img.naturalHeight>MAX_IMAGE_PIXELS?reject(Error('画像の解像度が大きすぎます。')):resolve(img);img.onerror=()=>reject(Error('画像を開けません。HealthPlanetのスクリーンショットを選び直してください。'));img.src=pendingUrl})}
  function normalize(text){return String(text||'').replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/[．。]/g,'.').replace(/\s/g,'')}
  function parse(text){const m=normalize(text).match(/\d+(?:\.\d+)?/);return m?Number(m[0]):null}

  // Find the five long, evenly spaced horizontal rules that bound the four-row
  // composition table. This makes the table itself the anchor, independent of
  // banners, scrolling offsets, and screenshot height.
  function findTable(img){
    const w=img.naturalWidth,h=img.naturalHeight,scale=Math.min(1,1200/w,1800/h),dw=Math.max(1,Math.round(w*scale)),dh=Math.max(1,Math.round(h*scale));
    const c=document.createElement('canvas');c.width=dw;c.height=dh;const xctx=c.getContext('2d',{willReadFrequently:true});xctx.drawImage(img,0,0,dw,dh);const {data}=xctx.getImageData(0,0,dw,dh);
    const rowScore=new Float32Array(dh),x0=Math.floor(dw*.035),x1=Math.ceil(dw*.965),span=x1-x0;
    for(let y=0;y<dh;y++){let n=0;for(let x=x0;x<x1;x++){const i=(y*dw+x)*4,r=data[i],g=data[i+1],b=data[i+2];if(Math.max(r,g,b)-Math.min(r,g,b)<13&&r>=215&&r<=250)n++}rowScore[y]=n/span}
    const bands=[];for(let y=0;y<dh;){if(rowScore[y]<.80){y++;continue}let start=y,sum=0,count=0;while(y<dh&&rowScore[y]>=.80){sum+=y;count++;y++}if(count>=1&&count<=8)bands.push({y:sum/count,score:Math.max(...rowScore.slice(start,y))})}
    let best=null;
    for(let a=0;a<bands.length-4;a++)for(let step=1;step<=4;step++){
      const ix=[a,a+step,a+2*step,a+3*step,a+4*step];if(ix[4]>=bands.length)continue;
      const ys=ix.map(i=>bands[i].y),gaps=ys.slice(1).map((v,i)=>v-ys[i]);
      if(gaps.some(g=>g<dw*.12||g>dw*.24))continue;
      const mean=gaps.reduce((s,v)=>s+v,0)/4,spread=Math.max(...gaps)-Math.min(...gaps);
      if(ys[4]-ys[0]<dw*.52||ys[4]-ys[0]>dw*.90||spread>dw*.055)continue;
      // Prefer a genuinely regular five-line group, and use line strength as a tie-breaker.
      const score=spread/dw+Math.abs(mean/dw-.18)*.35-ix.reduce((s,i)=>s+bands[i].score,0)*.0005;
      if(!best||score<best.score)best={score,ys};
    }
    if(!best)throw Error('体組成表の枠を特定できませんでした。表全体が写ったHealthPlanet画像を選んでください。');
    const top=best.ys[0]/scale,bottom=best.ys[4]/scale,rowH=(bottom-top)/4;
    const left=findVerticalEdge(data,dw,dh,best.ys[0],best.ys[4],.01,.20)/scale,right=findVerticalEdge(data,dw,dh,best.ys[0],best.ys[4],.80,.99)/scale;
    if(right-left<w*.55)throw Error('体組成表の左右の枠を特定できませんでした。');
    return {left,right,top,bottom,rowH,width:right-left,height:bottom-top};
  }
  function findVerticalEdge(data,w,h,top,bottom,lo,hi){
    let bestX=-1,best=-1;const y0=Math.ceil(top+3),y1=Math.floor(bottom-3),stride=Math.max(1,Math.floor((y1-y0)/700));
    for(let x=Math.floor(w*lo);x<=Math.ceil(w*hi);x++){let n=0,total=0;for(let y=y0;y<=y1;y+=stride){total++;const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];if(Math.max(r,g,b)-Math.min(r,g,b)<13&&r>=205&&r<=250)n++}const score=n/total;if(score>best){best=score;bestX=x}}
    if(best<.62)throw Error('体組成表の外枠が見つかりませんでした。');return bestX;
  }
  function makeRegions(t){
    const col=t.width/3;
    // The weight is in the large panel directly above the table; its vertical
    // position follows the detected table edge rather than the screen canvas.
    const out={weight:{x:t.left,y:t.top-t.width*.235,w:t.width*.285,h:t.width*.12}};
    // Each value gets its own crop in the detected grid. The widths stop near
    // the printed number so status badges, units, and labels do not lead OCR.
    const rows=[['bodyFat','muscleMass','bmi'],['visceralFat','basalMetabolism','bodyAge'],['boneMass','muscleQuality','bodyWater'],['pulse']];
    const widths={bodyFat:.55,muscleMass:.55,bmi:.62,visceralFat:.40,basalMetabolism:.50,bodyAge:.50,boneMass:.36,muscleQuality:.42,bodyWater:.62,pulse:.30};
    rows.forEach((keys,row)=>keys.forEach((k,i)=>out[k]={x:t.left+col*i+col*.055,y:t.top+t.rowH*(row+.105),w:col*widths[k],h:t.rowH*.43}));
    for(const k of KEYS){const r=out[k];r.x=Math.max(0,r.x);r.y=Math.max(0,r.y);r.w=Math.min(t.width*.95,r.w);r.h=Math.min(t.height*.4,r.h)}
    return out;
  }
  function crop(img,r){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(r.w));c.height=Math.max(1,Math.round(r.h));c.getContext('2d').drawImage(img,r.x,r.y,r.w,r.h,0,0,c.width,c.height);return c}
  function preprocess(src){const out=document.createElement('canvas'),scale=Math.max(2,Math.min(4,Math.ceil(900/src.width)));out.width=Math.max(1,Math.round(src.width*scale));out.height=Math.max(1,Math.round(src.height*scale));const c=out.getContext('2d',{willReadFrequently:true});c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(src,0,0,out.width,out.height);const p=c.getImageData(0,0,out.width,out.height);for(let i=0;i<p.data.length;i+=4){const g=.299*p.data[i]+.587*p.data[i+1]+.114*p.data[i+2],v=(g-128)*1.65+128,b=v>168?255:0;p.data[i]=p.data[i+1]=p.data[i+2]=b}c.putImageData(p,0,0);return out}
  function renderDebug(regions){if(!debugEnabled||!debugCheck.checked)return;debugBox.classList.remove('hidden');debugBox.innerHTML=KEYS.map(k=>{const c=crop(pendingImage,regions[k]),u=c.toDataURL('image/png');return `<figure><figcaption>${LABELS[k]} ROI</figcaption><img alt="${LABELS[k]}のOCR切り出し領域" src="${u}"></figure>`}).join('')}
  function previous(k){return records.find(r=>r.id!==currentId&&r[k]!=null)}
  function assess(k,v,confidence){if(v==null)return{review:true,note:'読み取れませんでした。値を入力欄で確認してください。'};const [min,max]=RANGES[k];if(v<min||v>max)return{review:true,note:`範囲外（${min}〜${max}${UNITS[k]}）。値と範囲を確認してください。`};const p=previous(k),threshold={weight:5,bodyFat:8,muscleMass:4,bmi:6,visceralFat:8,basalMetabolism:500,bodyAge:15,boneMass:2,muscleQuality:30,bodyWater:15,pulse:50}[k];if(p&&Math.abs(v-p[k])>threshold){const d=v-p[k],unit=k==='bodyFat'||k==='bodyWater'?'pt':UNITS[k];return{review:true,note:`前回から ${d>0?'+':''}${d.toFixed(PRECISION[k])}${unit}です。確認してください。`}}if(confidence<70)return{review:true,note:`認識信頼度 ${Math.round(confidence)}%。値を確認してください。`};if(confidence<86)return{review:true,note:`認識信頼度 ${Math.round(confidence)}%。念のため確認してください。`};return{review:false,note:`認識信頼度 ${Math.round(confidence)}%`}}
  function renderResults(rs){resultBox.innerHTML=rs.map(r=>{const v=r.value==null?'—':`${r.value.toFixed(PRECISION[r.key])} ${UNITS[r.key]}`.trim();return `<div class="ocr-result-row ${r.value==null?'unread':r.review?'needs-review':''}"><span>${LABELS[r.key]}</span><span><strong>${v}</strong><span class="ocr-result-note">${r.note}</span></span></div>`}).join('')+KEYS.slice(rs.length).map(k=>`<div class="ocr-result-row unread"><span>${LABELS[k]}</span><span><strong>—</strong><span class="ocr-result-note">読み取り中</span></span></div>`).join('')}
  async function processImage(img){let worker;try{
    setStatus('画像を読み取っています…体組成表の位置を検出中');const table=findTable(img),regions=makeRegions(table);renderDebug(regions);resultBox.classList.remove('hidden');resultBox.innerHTML='';const collected=[];
    const base=p=>new URL(p,document.baseURI).href;worker=await Tesseract.createWorker('eng',1,{workerPath:base('./vendor/tesseract/worker.min.js'),langPath:base('./vendor/tesseract/lang'),corePath:base('./vendor/tesseract/core/tesseract-core.wasm.js'),gzip:true,cacheMethod:'write',logger:m=>{if(m.status)setStatus(`画像を読み取っています… ${m.status}${Number.isFinite(m.progress)?` ${Math.round(m.progress*100)}%`:''}`)}});
    for(let i=0;i<KEYS.length;i++){const k=KEYS[i];setStatus(`画像を読み取っています… ${LABELS[k]}（${i+1}/${KEYS.length}）`);let r;try{await worker.setParameters({tessedit_char_whitelist:'0123456789.',tessedit_pageseg_mode:Tesseract.PSM.SINGLE_LINE});const {data}=await worker.recognize(preprocess(crop(img,regions[k])));const value=parse(data.text),check=assess(k,value,Number(data.confidence)||0);r={key:k,value,confidence:Number(data.confidence)||0,...check};$('#entryForm').elements[k].value=value==null?'':value}catch{r={key:k,value:null,confidence:0,review:true,note:'読み取りに失敗しました。入力欄へ手入力してください。'};$('#entryForm').elements[k].value=''}collected.push(r);renderResults(collected)}
    if(collected.some(r=>r.value!=null))entrySource='healthplanet-image';if(collected.some(r=>['visceralFat','basalMetabolism','bodyAge','boneMass','muscleQuality','bodyWater','pulse'].includes(r.key)&&r.value!=null))$('#otherFields').closest('details').open=true;setStatus('読み取り完了。各項目と日付・時刻を確認してから保存してください。日付・時刻は読み取りません。',collected.some(r=>r.review)?'warning':'');
  }catch(e){setStatus(`OCRを開始できませんでした: ${e?.message||'初期化エラー'}。入力欄へ手入力できます。`,'error')}finally{if(worker)await worker.terminate().catch(()=>{});clearImage()}}
  $('#chooseHealthPlanetImage').addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',async()=>{const file=fileInput.files?.[0];if(!file)return;clearImage();resultBox.classList.add('hidden');debugBox.classList.add('hidden');debugBox.replaceChildren();if(!file.type.startsWith('image/')||file.size>MAX_IMAGE_BYTES){setStatus(file.size>MAX_IMAGE_BYTES?'画像サイズが25MBを超えています。':'画像ファイルを選んでください。','error');return}try{setStatus('画像を開いています…');const img=await loadImage(file);pendingImage=img;await processImage(img)}catch(e){setStatus(e.message||'画像を読み込めませんでした。','error');clearImage()}});
  window.healthPlanetOcr={resetForEntry(){clearImage();resultBox.classList.add('hidden');resultBox.replaceChildren();debugBox.classList.add('hidden');debugBox.replaceChildren();setStatus('')}};
})();
