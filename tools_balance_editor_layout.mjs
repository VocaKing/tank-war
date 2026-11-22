import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--base','/'],{stdio:'ignore'});
let browser;
try {
 let ready=false;
 for(let i=0;i<80;i++){
  try{const r=await fetch('http://127.0.0.1:5173/');if(r.ok){ready=true;break;}}catch{}
  await delay(250);
 }
 assert.ok(ready,'Vite server did not start');
 browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/balance.html');
 await page.waitForSelector('#form .field-group');
 const desktop=await page.evaluate(async()=>{
  const {TANKS}=await import('/src/game/tankData.js');
  const {fields}=await import('/src/game/balanceConfig.js');
  const buttons=[...document.querySelectorAll('#list .tank')],report=[];
  for(let i=0;i<TANKS.length;i++){
   buttons[i].click();
   const expected=new Map();
   for(const f of fields(TANKS[i])){
    if(!expected.has(f.group))expected.set(f.group,[]);
    expected.get(f.group).push(f.label+' · '+f.unit);
   }
   const sections=[...document.querySelectorAll('#form .field-group')];
   const actual=sections.map(section=>({
    title:section.querySelector('h3').textContent,
    labels:[...section.querySelectorAll('.field-label')].map(x=>x.textContent)
   }));
   if(actual.length!==expected.size)throw new Error(TANKS[i].id+': group count mismatch');
   for(const item of actual){
    const labels=expected.get(item.title);
    if(!labels||JSON.stringify(labels)!==JSON.stringify(item.labels))throw new Error(TANKS[i].id+': field order/content mismatch in '+item.title);
   }
   for(const face of ['正面装甲','侧面装甲','后面装甲','顶部装甲','底部装甲']){
    const item=actual.find(x=>x.title===face);
    if(item&&item.labels.length>4)throw new Error(TANKS[i].id+': '+face+' has more than four inputs');
   }
   report.push({id:TANKS[i].id,groups:actual.length,front:actual.find(x=>x.title==='正面装甲')?.labels.length||0,side:actual.find(x=>x.title==='侧面装甲')?.labels.length||0});
  }
  const front=document.querySelector('#form .field-group h3');
  const section=[...document.querySelectorAll('#form .field-group')].find(x=>x.querySelector('h3')?.textContent==='正面装甲');
  const cells=[...section.querySelectorAll('.field')];
  return {report,desktopColumns:getComputedStyle(section.querySelector('.fields')).gridTemplateColumns.split(' ').length,frontCellRows:new Set(cells.map(x=>Math.round(x.getBoundingClientRect().top))).size};
 });
 assert.equal(desktop.report.length,15);
 assert.equal(desktop.desktopColumns,4,'Desktop armor row should have four columns');
 assert.ok(desktop.frontCellRows<=1,'Front armor fields should fit on one desktop row');
 await page.setViewportSize({width:390,height:844});
 const mobile=await page.evaluate(()=>{
  const section=[...document.querySelectorAll('#form .field-group')].find(x=>x.querySelector('h3')?.textContent==='正面装甲');
  const cells=[...section.querySelectorAll('.field')];
  return {columns:getComputedStyle(section.querySelector('.fields')).gridTemplateColumns.split(' ').length,rows:new Set(cells.map(x=>Math.round(x.getBoundingClientRect().top))).size};
 });
 assert.equal(mobile.columns,2,'Mobile editor should use two columns');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({desktop,mobile},null,2));
} finally {
 if(browser)await browser.close();
 server.kill('SIGTERM');
}
