import { TANKS, STOCK_TANKS, PUBLISHED_TANKS, BALANCE_STATUS } from '../game/tankData.js';
import { STORAGE_KEY, EMPTY, clone, fields, read, effective, diff, validate, saveLocal } from '../game/balanceConfig.js';
import './balanceEditor.css';
let draft=clone(TANKS),selected=TANKS[0].id,dirty=false,compare=false;
const root=document.getElementById('ui');document.getElementById('gl').hidden=true;root.className='balance-root';
document.documentElement.lang='zh-CN';document.title='Steel Front · 游戏平衡编辑器';
root.innerHTML='<header><div><small>STEEL FRONT / DESIGNER TOOLS</small><h1>游戏平衡编辑器</h1><p>调整坦克、装甲、弹药和特殊技能。保存后车库装甲预览会同步更新。</p></div><a class="play" href="./">返回车库 / 游戏</a></header><div class="notice" id="status" role="status"></div><div class="toolbar"><button id="save" class="primary">保存并应用</button><button id="save-return">保存并返回车库</button><button id="export">导出配置 JSON</button><button id="import">导入配置</button><input id="file" type="file" accept=".json,application/json" hidden><button id="restore">恢复发布版</button><button id="compare">全车对比</button></div><div class="layout"><aside><h2>坦克列表</h2><input id="search" placeholder="搜索坦克 / 型号" aria-label="搜索坦克"><div id="list"></div></aside><main id="form"></main></div><footer>本地配置仅影响同一浏览器、同一网站的游戏。若要修改全玩家的默认数值，请导出 balanceDefaults.json，替换 GitHub 仓库里的 src/game/balanceDefaults.json 后重新部署。<br>保存后的数值将在下一场战斗使用。</footer>';
const $=id=>document.getElementById(id), make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
function status(msg,kind=''){const e=$('status');e.textContent=msg;e.className='notice '+kind;}
function changed(){dirty=true;$('save').textContent='保存并应用 · 未保存';}
function set(t,path,value){const keys=path.split('.'),last=keys.pop();keys.reduce((v,k)=>v[k],t)[last]=value;}
function renderList(){
 const list=$('list');list.replaceChildren();const q=$('search').value.trim().toLowerCase();
 for(const t of draft){if(![t.name,t.short,t.id,t.nation].join(' ').toLowerCase().includes(q))continue;
 const b=make('button','tank'+(t.id===selected&&!compare?' active':''));b.append(make('small','tier','T'+t.tier),make('span','',t.short),make('small','nation',t.nation));b.onclick=()=>{selected=t.id;compare=false;render()};list.append(b);}
}
function renderComparison(main){
 main.append(make('h2','','全车数值对比'));
 const wrap=make('div','table-wrap'),table=make('table'),head=make('tr');for(const label of ['坦克','HP','速度 km/h','功重比 hp/t','装填 s','百米散布半径（最小–最大）','标准弹穿深 mm','标准弹伤害','标准弹 DPM','车体正面 mm','炮塔正面 mm'])head.append(make('th','',label));table.append(head);
 for(const t of draft){const tr=make('tr');for(const x of [t.short,t.hp,t.maxSpeed,(t.power/t.mass).toFixed(1),t.reload,`${t.dispersion}–${t.maxDispersion} m`,t.shells[0].pen,t.shells[0].damage,Math.round(t.shells[0].damage*60/t.reload),t.armor.hull.front[0],t.armor.turret.front[0]])tr.append(make('td','',String(x)));tr.onclick=()=>{selected=t.id;compare=false;render()};table.append(tr);}
 wrap.append(table);main.append(wrap,make('p','muted','DPM 为标准弹伤害 × 60 / 装填时间，不计弹夹、技能、未命中和未击穿。点击行编辑。'));
}
function render(){
 renderList();const main=$('form');main.replaceChildren();if(compare){renderComparison(main);return;}
 const t=draft.find(x=>x.id===selected),stock=STOCK_TANKS.find(x=>x.id===selected),published=PUBLISHED_TANKS.find(x=>x.id===selected);
 const title=make('div','section-title');title.append(make('h2','',t.name));const reset=make('button','','恢复本车发布值');reset.onclick=()=>{if(!confirm('恢复 '+t.short+' 的发布版数值？'))return;draft[draft.indexOf(t)]=clone(published);changed();render()};title.append(reset);main.append(title);
 const summary=make('div','balance-metrics');const metrics=()=>{summary.replaceChildren();for(const [name,value] of [['功重比',(t.power/t.mass).toFixed(1)+' hp/t'],['标准弹 DPM',Math.round(t.shells[0].damage*60/t.reload)],['总弹药',t.shells.reduce((a,s)=>a+s.count,0)+' 发']]){const card=make('div','balance-metric');card.append(make('small','',name),make('strong','',String(value)));summary.append(card);}};metrics();main.append(summary);
 main.append(make('p','muted','装甲倾角由模型表面决定。每次命中的入射角、等效装甲和跳弹结果按弹道与命中面计算。本页可编辑标称厚度和附加防护。'));
 let group='',section,grid;
 for(const f of fields(stock)){
  if(group!==f.group){
   group=f.group;section=make('section','field-group');
   section.append(make('h3','',group));grid=make('div','fields');section.append(grid);main.append(section);
  }
  const cell=make('label','field'),caption=make('span','field-label',f.label+' · '+f.unit),input=make('input','number');input.type='number';input.min=f.min;input.max=f.max;input.step=f.step;input.value=read(t,f.path);input.setAttribute('aria-label',f.label+' '+f.unit);
  const base=read(published,f.path),note=make('small','muted','发布值 '+base);const flag=()=>{cell.classList.toggle('modified',Number(input.value)!==base);};flag();
  input.addEventListener('input',()=>{const v=input.value.trim()===''?NaN:Number(input.value);set(t,f.path,v);changed();flag();metrics();});
  cell.append(caption,input,note);grid.append(cell);
 }
}
$('search').oninput=renderList;
$('compare').onclick=()=>{compare=!compare;render()};
function saveDraft(){try{const cfg=diff(STOCK_TANKS,draft);saveLocal(cfg,STOCK_TANKS);dirty=false;$('save').textContent='保存并应用';status('已保存 '+Object.keys(cfg.tanks).length+' 辆坦克的自定义配置。返回车库即可加载。','ok');return true;}catch(e){status(e.message,'error');return false;}}
$('save').onclick=saveDraft;
$('save-return').onclick=()=>{if(saveDraft())location.assign(new URL('./',location.href).href);};
$('export').onclick=()=>{try{const cfg=diff(STOCK_TANKS,draft);const url=URL.createObjectURL(new Blob([JSON.stringify(cfg,null,2)+'\n'],{type:'application/json'}));const a=make('a');a.href=url;a.download='balanceDefaults.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('已导出配置。可备份、分享或替换仓库默认文件。','ok');}catch(e){status(e.message,'error');}};
$('import').onclick=()=>$('file').click();
$('file').onchange=async()=>{try{const f=$('file').files[0];if(!f)return;if(f.size>1000000)throw Error('配置文件过大');const config=validate(JSON.parse(await f.text()),STOCK_TANKS);draft=effective(STOCK_TANKS,config);changed();render();status('配置已导入预览，点击保存并应用后才会影响游戏。','ok');}catch(e){status(e.message,'error')}finally{$('file').value=''}};
$('restore').onclick=()=>{if(!confirm('移除本地自定义配置并恢复发布版数值？'))return;try{localStorage.removeItem(STORAGE_KEY);draft=clone(PUBLISHED_TANKS);dirty=false;$('save').textContent='保存并应用';render();status('已恢复发布版，车库会同步更新。','ok');}catch(e){status(e.message,'error');}};
addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
addEventListener('storage',e=>{if(e.key===STORAGE_KEY)status('另一标签页改变了配置。如需其最新值，请先备份未保存修改再刷新本页。');});
status(BALANCE_STATUS.error?'部分配置读取失败，已回退至有效数值：'+BALANCE_STATUS.error:BALANCE_STATUS.source==='local'?'已加载本地自定义配置。':'当前使用发布版默认数值。',BALANCE_STATUS.error?'error':'');render();
