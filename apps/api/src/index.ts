import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import mongoose from 'mongoose';
const envCandidates=[path.resolve(process.cwd(),'.env'),path.resolve(process.cwd(),'../../.env'),path.resolve(__dirname,'../../../.env')];
const envPath=envCandidates.find(f=>fs.existsSync(f));
if(!envPath) throw new Error('Root .env tidak ditemukan');
dotenv.config({path:envPath});
mongoose.set('autoIndex',false);
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import axios from 'axios';
import cron from 'node-cron';
import {z} from 'zod';

const app=express();
app.use(cors({origin:process.env.WEBSITE_URL||'http://localhost:5173',credentials:true}));
app.use(express.json({limit:'1mb'}));
app.use(session({secret:process.env.SESSION_SECRET||'dev-secret',resave:false,saveUninitialized:false,store:MongoStore.create({mongoUrl:process.env.MONGODB_URI}),cookie:{httpOnly:true,secure:process.env.COOKIE_SECURE==='true',sameSite:'lax'}}));

const Settings=mongoose.model('SystemSettings',new mongoose.Schema({
  key:{type:String,unique:true,default:'default'},
  appName:{type:String,default:'Satu Mimpi'},
  appSubtitle:{type:String,default:'Roleplay'},
  serverLogoUrl:{type:String,default:''},
  loginEyebrow:{type:String,default:'ADMIN CONTROL CENTER'},
  loginButtonText:{type:String,default:'Continue with Discord'},
  loginFooterText:{type:String,default:'Restricted to authorized administrators'},
  factionName:{type:String,default:'H2'},
  factionTags:{type:[String],default:['H2']},
  cfxServerId:{type:String,default:'6gk4e4'},
  cfxServerName:{type:String,default:'Satu Mimpi Roleplay'},
  cfxApiBase:{type:String,default:'https://frontend.cfx-services.net/api/servers/single'},
  pollIntervalSeconds:{type:Number,default:30},
  timezone:{type:String,default:'Asia/Jakarta'},
  minimumPlaytimeMinutes:{type:Number,default:120},
  shiftName:{type:String,default:'Wajib Shift'},
  shiftStartTime:{type:String,default:'21:00'},
  shiftEndTime:{type:String,default:'01:00'},
  discordGuildId:{type:String,default:''},
  discordAdminRoleId:{type:String,default:''},
  discordEventChannelId:{type:String,default:''},
  discordPlayerLogChannelId:{type:String,default:''},
  discordAttendanceChannelId:{type:String,default:''},
  settingsCustomized:{type:Boolean,default:false}
},{timestamps:true}));

const Member=mongoose.model('Member',new mongoose.Schema({nickIC:{type:String,default:''},nickFiveM:{type:String,default:''},discordId:{type:String,default:''},steamHex:{type:String,default:''},cfxId:{type:String,default:''},active:{type:Boolean,default:true},faction:{type:String,default:'H2'}},{timestamps:true}));
Member.schema.index({cfxId:1},{unique:true,partialFilterExpression:{cfxId:{$gt:''}}});
Member.schema.index({discordId:1},{unique:true,partialFilterExpression:{discordId:{$gt:''}}});
Member.schema.index({steamHex:1},{unique:true,partialFilterExpression:{steamHex:{$gt:''}}});
Member.schema.index({nickFiveM:1},{unique:true,partialFilterExpression:{nickFiveM:{$gt:''}}});
const Session=mongoose.model('PlayerSession',new mongoose.Schema({memberId:mongoose.Schema.Types.ObjectId,nickIC:String,nickFiveM:String,discordId:String,steamHex:String,cfxId:String,serverId:String,serverName:String,serverPlayerId:String,connectedAt:Date,disconnectedAt:Date,durationSeconds:Number,status:{type:String,default:'active'}},{timestamps:true}));
const Shift=mongoose.model('Shift',new mongoose.Schema({name:String,startTime:String,endTime:String,minimumPlaytimeMinutes:{type:Number,default:120},timezone:{type:String,default:'Asia/Jakarta'},enabled:{type:Boolean,default:true},lastRecapKey:String},{timestamps:true}));
const Attendance=mongoose.model('Attendance',new mongoose.Schema({date:String,shiftId:mongoose.Schema.Types.ObjectId,shiftName:String,memberId:mongoose.Schema.Types.ObjectId,nickIC:String,nickFiveM:String,discordId:String,steamHex:String,cfxId:String,totalSeconds:Number,minimumSeconds:Number,status:String,sessions:Array},{timestamps:true}));
Attendance.schema.index({date:1,shiftId:1,memberId:1},{unique:true});
const EventSchema=new mongoose.Schema({type:String,eventKey:{type:String,index:true,sparse:true},payload:Object,delivered:{type:Boolean,default:false,index:true}},{timestamps:true});
EventSchema.index({eventKey:1},{unique:true,sparse:true});
const Event=mongoose.model('SystemEvent',EventSchema);
const Audit=mongoose.model('AuditLog',new mongoose.Schema({actorDiscordId:String,action:String,target:String,metadata:Object},{timestamps:true}));
const active=new Map<string,any>();

const envDefaults=()=>({
  key:'default',appName:process.env.APP_NAME||'Satu Mimpi',appSubtitle:process.env.APP_SUBTITLE||'Roleplay',serverLogoUrl:process.env.SERVER_LOGO_URL||'',loginEyebrow:process.env.LOGIN_EYEBROW||'ADMIN CONTROL CENTER',loginButtonText:process.env.LOGIN_BUTTON_TEXT||'Continue with Discord',loginFooterText:process.env.LOGIN_FOOTER_TEXT||'Restricted to authorized administrators',
  factionName:process.env.FACTION_NAME||'H2',factionTags:(process.env.FACTION_TAGS||process.env.FACTION_NAME||'H2').split(',').map(x=>x.trim()).filter(Boolean),
  cfxServerId:process.env.CFX_SERVER_ID||'',cfxServerName:process.env.CFX_SERVER_NAME||'Satu Mimpi Roleplay',
  cfxApiBase:process.env.CFX_API_BASE||'https://frontend.cfx-services.net/api/servers/single',
  pollIntervalSeconds:Math.max(10,Number(process.env.POLL_INTERVAL_SECONDS||30)),timezone:process.env.TIMEZONE||'Asia/Jakarta',
  minimumPlaytimeMinutes:Math.max(1,Number(process.env.MIN_PLAYTIME_MINUTES||120)),
  shiftName:process.env.SHIFT_NAME||'Wajib Shift',shiftStartTime:process.env.SHIFT_START_TIME||'21:00',shiftEndTime:process.env.SHIFT_END_TIME||'01:00',
  discordGuildId:process.env.DISCORD_GUILD_ID||'',discordAdminRoleId:process.env.DISCORD_ADMIN_ROLE_ID||'',
  discordEventChannelId:process.env.DISCORD_EVENT_CHANNEL_ID||process.env.DISCORD_PLAYER_LOG_CHANNEL_ID||'',
  discordPlayerLogChannelId:process.env.DISCORD_PLAYER_LOG_CHANNEL_ID||process.env.DISCORD_EVENT_CHANNEL_ID||'',discordAttendanceChannelId:process.env.DISCORD_ATTENDANCE_CHANNEL_ID||'',settingsCustomized:false
});
let settingsCache:any=null;
async function getSettings(){
  if(settingsCache) return settingsCache;
  let s=await Settings.findOne({key:'default'}).lean();
  if(!s){const created=await Settings.create(envDefaults());s=created.toObject();}
  else {
    // Legacy records created before website Settings existed may still contain
    // the old hard-coded Satu Mimpi values. Treat them as defaults until an
    // administrator explicitly saves Settings from the website.
    if(s.settingsCustomized!==true){
      const defaults=envDefaults();
      await Settings.updateOne({key:'default'},{$set:defaults});
      s=await Settings.findOne({key:'default'}).lean();
    } else {
      const defaults=envDefaults();
      const missing:any={};
      for(const key of ['loginEyebrow','loginButtonText','loginFooterText','shiftName','shiftStartTime','shiftEndTime']) if(s[key]===undefined||s[key]===null||s[key]==='') missing[key]=defaults[key];
      if(!s.discordPlayerLogChannelId) missing.discordPlayerLogChannelId=s.discordEventChannelId||defaults.discordPlayerLogChannelId; if(!s.discordAttendanceChannelId) missing.discordAttendanceChannelId=defaults.discordAttendanceChannelId;
      if(Object.keys(missing).length){await Settings.updateOne({key:'default'},{$set:missing});s={...s,...missing};}
    }
  }
  settingsCache=s; return s;
}
async function refreshSettings(){settingsCache=null;return getSettings();}
function tags(){const s=settingsCache; const list=(s?.factionTags?.length?s.factionTags:[s?.factionName||'H2']).map((x:string)=>String(x).trim().toLowerCase()).filter(Boolean); return list.length?list:['h2'];}
function factionLabel(){return settingsCache?.factionName||tags()[0]?.toUpperCase()||'H2';}
function isFactionName(name:string){const n=String(name||'').toLowerCase();return tags().some(t=>n.includes(t));}
async function admin(req:any,res:any,next:any){if(req.headers['x-internal-secret']===(process.env.SESSION_SECRET||'dev-secret'))return next();const s=await getSettings();const role=s.discordAdminRoleId||process.env.DISCORD_ADMIN_ROLE_ID||'';if(!req.session.discord||!role||!req.session.discord.roles.includes(role))return res.status(403).json({error:'ADMIN_ONLY'});next();}
async function cfx(){const s=await getSettings();if(!s.cfxServerId)throw new Error('CFX Server ID belum diatur');return (await axios.get(`${String(s.cfxApiBase).replace(/\/$/,'')}/${encodeURIComponent(s.cfxServerId)}`,{timeout:10000})).data;}
function normalizeSteamHex(value:any){const v=String(value??'').trim().toLowerCase();if(!v)return '';return v.startsWith('steam:')?v:(v.startsWith('110000')?`steam:${v}`:v);}
function normalizeName(value:any){return String(value??'').trim().replace(/\s+/g,' ').toLowerCase();}
function ids(p:any){const raw=Array.isArray(p?.identifiers)?p.identifiers:[];const a=raw.map((x:any)=>String(x||'').trim().toLowerCase()).filter(Boolean);const find=(prefix:string)=>a.find(x=>x.startsWith(prefix))||'';const steamRaw=find('steam:')||String(p?.steamHex||p?.steam||'').trim();const cfxRaw=find('fivem:')||String(p?.cfxId||p?.fivemId||'').trim();const discordRaw=find('discord:')||String(p?.discordId||'').trim();return {cfx:cfxRaw.startsWith('fivem:')?cfxRaw.slice(6):cfxRaw,discord:discordRaw.startsWith('discord:')?discordRaw.slice(8):discordRaw,steam:normalizeSteamHex(steamRaw),raw:a};}
async function findMemberBySteam(steamHex:string){if(!steamHex)return null;return Member.findOne({steamHex:normalizeSteamHex(steamHex),active:true});}
async function findMemberByName(name:string){const n=normalizeName(name);if(!n)return null;return Member.findOne({active:true,nickFiveM:new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'i')});}
let syncRunning=false;
async function dedupeMembers(){const members=await Member.find().sort({createdAt:1}).lean();const groups=new Map<string,any>();const duplicateIds:string[]=[];for(const m of members){const keys=[m.cfxId&&`cfx:${m.cfxId}`,m.discordId&&`discord:${m.discordId}`,m.steamHex&&`steam:${m.steamHex}`,m.nickFiveM&&`name:${String(m.nickFiveM).trim().toLowerCase()}`].filter(Boolean) as string[];let keeper:any=null;for(const k of keys){if(groups.has(k)){keeper=groups.get(k);break;}}if(!keeper){keeper=m;for(const k of keys)groups.set(k,keeper);continue;}const merged:any={};for(const field of ['nickIC','nickFiveM','discordId','steamHex','cfxId','faction'])if((!keeper[field]||keeper[field]==='')&&m[field])merged[field]=m[field];if(Object.keys(merged).length)await Member.findByIdAndUpdate(keeper._id,{$set:merged});await Session.updateMany({memberId:m._id},{$set:{memberId:keeper._id}});await Attendance.updateMany({memberId:m._id},{$set:{memberId:keeper._id}});duplicateIds.push(String(m._id));for(const k of keys)groups.set(k,keeper);}if(duplicateIds.length)await Member.deleteMany({_id:{$in:duplicateIds}});console.log(`[DEDUP] ${duplicateIds.length?`Removed ${duplicateIds.length} duplicate member(s)`:'No duplicate members found'}`);}

async function sync(){if(syncRunning){console.log('[CFX] Previous sync still running, skip this cycle');return;}syncRunning=true;try{const s=await getSettings();const data=await cfx();const players=data?.Data?.players||data?.players||[];const now=new Date();const seen=new Set<string>();for(const p of players){const name=String(p?.name||'Unknown').trim();if(!isFactionName(name))continue;const i=ids(p);let member:any=null;let matchedBy='';if(i.steam){member=await findMemberBySteam(i.steam);if(member)matchedBy='steam';}if(!member){member=await findMemberByName(name);if(member)matchedBy='nickFiveM';}if(!member){console.log(`[CFX] ${name} skipped: no registered Steam Hex/name match (steam=${i.steam||'missing'}, identifiers=${i.raw.length})`);continue;}const key=String(member._id);seen.add(key);const oldName=member.nickFiveM;const oldSteam=member.steamHex;const oldCfx=member.cfxId;const oldDiscord=member.discordId;member.nickFiveM=name;member.nickIC=name;if(i.steam)member.steamHex=i.steam;if(i.cfx)member.cfxId=i.cfx;if(i.discord)member.discordId=i.discord;member.faction=factionLabel();if(oldName!==name||oldSteam!==member.steamHex||oldCfx!==member.cfxId||oldDiscord!==member.discordId)await member.save();console.log(`[CFX] ${name} matched by ${matchedBy}${i.steam?' | steam='+i.steam:''}`);if(!active.has(key)){const ss=await Session.create({memberId:member._id,nickIC:member.nickIC,nickFiveM:name,discordId:member.discordId,steamHex:member.steamHex,cfxId:member.cfxId,serverId:s.cfxServerId,serverName:s.cfxServerName,serverPlayerId:String(p?.id??''),connectedAt:now,status:'active'});active.set(key,{...p,name,memberId:member._id,sessionId:ss._id,connectedAt:now,steamHex:member.steamHex,matchedBy});await Event.create({type:'online',eventKey:`online:${String(ss._id)}`,payload:{nickIC:member.nickIC,nickFiveM:name,discordId:member.discordId,steamHex:member.steamHex,cfxId:member.cfxId,serverPlayerId:String(p?.id??''),serverName:s.cfxServerName,appName:s.appName,factionName:s.factionName,connectedAt:now.toISOString(),matchedBy}});}else{const a=active.get(key);a.name=name;a.ping=p?.ping;a.nickIC=member.nickIC;a.memberId=member._id;a.steamHex=member.steamHex;a.matchedBy=matchedBy;a.id=p?.id??a.id;active.set(key,a);}}
for(const [key,a] of [...active])if(!seen.has(key)){const now2=new Date();const sec=Math.max(0,Math.floor((now2.getTime()-new Date(a.connectedAt).getTime())/1000));await Session.findByIdAndUpdate(a.sessionId,{disconnectedAt:now2,durationSeconds:sec,status:'completed'});const m=await Member.findById(a.memberId);await Event.create({type:'offline',eventKey:`offline:${String(a.sessionId)}`,payload:{nickIC:m?.nickIC||a.nickIC,nickFiveM:a.name,discordId:m?.discordId,steamHex:m?.steamHex,cfxId:m?.cfxId,serverPlayerId:String(a.id??''),durationSeconds:sec,serverName:s.cfxServerName,appName:s.appName,factionName:s.factionName,disconnectedAt:now2.toISOString()}});active.delete(key);}}
finally{syncRunning=false;}}

function dateKey(){const s=settingsCache||{};const tz=s.timezone||'Asia/Jakarta';return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function zonedParts(d=new Date(),timeZone='Asia/Jakarta'){const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(d);const get=(t)=>Number(parts.find(x=>x.type===t)?.value||0);return {year:get('year'),month:get('month'),day:get('day'),hour:get('hour')%24,minute:get('minute'),second:get('second')};}
function dateOnlyKey(y,m,d){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function addDays(y,m,d,days){const x=new Date(Date.UTC(y,m-1,d+days));return {year:x.getUTCFullYear(),month:x.getUTCMonth()+1,day:x.getUTCDate()};}
function timeToMinutes(value:string){const m=/^(\d{2}):(\d{2})$/.exec(String(value||''));if(!m)return null;const h=Number(m[1]),min=Number(m[2]);if(h>23||min>59)return null;return h*60+min;}
function timeZoneOffsetMs(date:Date,timeZone:string){const p=zonedParts(date,timeZone);const asUtc=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);return asUtc-date.getTime();}
function zonedDateTimeToUtc(y:number,m:number,d:number,hh:number,mm:number,timeZone:string){let guess=new Date(Date.UTC(y,m-1,d,hh,mm,0));for(let i=0;i<3;i++)guess=new Date(Date.UTC(y,m-1,d,hh,mm,0)-timeZoneOffsetMs(guess,timeZone));return guess;}
function shiftWindow(now=new Date()){const s=settingsCache||{};const tz=s.timezone||'Asia/Jakarta';const startMin=timeToMinutes(s.shiftStartTime||'21:00');const endMin=timeToMinutes(s.shiftEndTime||'01:00');if(startMin===null||endMin===null||startMin===endMin)return {active:false,date:dateKey(),start:now,end:now};const p=zonedParts(now,tz);const currentMin=p.hour*60+p.minute;const overnight=endMin<startMin;let active=false,base={year:p.year,month:p.month,day:p.day};if(!overnight){active=currentMin>=startMin&&currentMin<endMin;}else{active=currentMin>=startMin||currentMin<endMin;if(currentMin<endMin)base=addDays(p.year,p.month,p.day,-1);}const start=zonedDateTimeToUtc(base.year,base.month,base.day,Math.floor(startMin/60),startMin%60,tz);const endBase=overnight?addDays(base.year,base.month,base.day,1):base;const end=zonedDateTimeToUtc(endBase.year,endBase.month,endBase.day,Math.floor(endMin/60),endMin%60,tz);return {active,date:dateOnlyKey(base.year,base.month,base.day),start,end};}
async function ensureDefaultShift(){const s=await getSettings();let sh=await Shift.findOne({enabled:true}).sort({createdAt:1});const data={name:s.shiftName||`${s.factionName} Shift`,startTime:s.shiftStartTime||'21:00',endTime:s.shiftEndTime||'01:00',minimumPlaytimeMinutes:s.minimumPlaytimeMinutes,timezone:s.timezone||'Asia/Jakarta',enabled:true};if(!sh)sh=await Shift.create(data);else{sh.set(data);await sh.save();}await Shift.updateMany({_id:{$ne:sh._id}},{$set:{enabled:false}});return sh;}
function overlapSeconds(session:any,start:Date,end:Date,now:Date){const a=new Date(session.connectedAt);const b=new Date(session.disconnectedAt||now);const from=Math.max(a.getTime(),start.getTime());const to=Math.min(b.getTime(),end.getTime());return Math.max(0,Math.floor((to-from)/1000));}
async function recap(){
  const s=await getSettings();
  const sh=await ensureDefaultShift();
  const now=new Date();
  const current=shiftWindow(now);
  const p=zonedParts(now,s.timezone||'Asia/Jakarta');
  const startMin=timeToMinutes(sh.startTime)||0;
  const endMin=timeToMinutes(sh.endTime)||0;
  const overnight=endMin<startMin;

  // Keep attendance records updated while the configured shift is running.
  if(current.active){
    const rows=await Member.find({active:true});
    for(const m of rows){
      const sessions=await Session.find({memberId:m._id,connectedAt:{$lt:current.end},$or:[{disconnectedAt:{$exists:false}},{disconnectedAt:{$gt:current.start}}]}).lean();
      const total=sessions.reduce((sum,x)=>sum+overlapSeconds(x,current.start,current.end,now),0);
      await Attendance.findOneAndUpdate({date:current.date,shiftId:sh._id,memberId:m._id},{date:current.date,shiftId:sh._id,shiftName:sh.name,memberId:m._id,nickIC:m.nickIC,nickFiveM:m.nickFiveM,discordId:m.discordId,steamHex:m.steamHex,cfxId:m.cfxId,totalSeconds:total,minimumSeconds:sh.minimumPlaytimeMinutes*60,status:total>=sh.minimumPlaytimeMinutes*60?'attended':'not_attending',sessions},{upsert:true,new:true});
    }
    return;
  }

  // After the shift ends, build the final recap for the shift that just ended.
  const endBoundaryReached = (!overnight && p.hour*60+p.minute>=endMin) || (overnight && p.hour*60+p.minute>=endMin && p.hour*60+p.minute<startMin);
  if(!endBoundaryReached)return;

  const previousDate=new Date(now.getTime()-86400000);
  const prevParts=zonedParts(previousDate,s.timezone||'Asia/Jakarta');
  let recapDate: string;
  if(overnight){
    recapDate=prevParts.year+'-'+String(prevParts.month).padStart(2,'0')+'-'+String(prevParts.day).padStart(2,'0');
  }else{
    recapDate=p.year+'-'+String(p.month).padStart(2,'0')+'-'+String(p.day).padStart(2,'0');
  }
  const recapKey=`${recapDate}_${sh._id}`;
  const claimed=await Shift.findOneAndUpdate(
    {_id:sh._id,lastRecapKey:{$ne:recapKey}},
    {$set:{lastRecapKey:recapKey}},
    {new:true}
  );
  if(!claimed)return;

  const startDateParts=overnight?prevParts:p;
  const start=zonedDateTimeToUtc(startDateParts.year,startDateParts.month,startDateParts.day,Math.floor(startMin/60),startMin%60,s.timezone||'Asia/Jakarta');
  const endBase=overnight?addDays(startDateParts.year,startDateParts.month,startDateParts.day,1):startDateParts;
  const end=zonedDateTimeToUtc(endBase.year,endBase.month,endBase.day,Math.floor(endMin/60),endMin%60,s.timezone||'Asia/Jakarta');

  const rows=await Member.find({active:true});
  for(const m of rows){
    const sessions=await Session.find({memberId:m._id,connectedAt:{$lt:end},$or:[{disconnectedAt:{$exists:false}},{disconnectedAt:{$gt:start}}]}).lean();
    const total=sessions.reduce((sum,x)=>sum+overlapSeconds(x,start,end,end),0);
    await Attendance.findOneAndUpdate({date:recapDate,shiftId:sh._id,memberId:m._id},{date:recapDate,shiftId:sh._id,shiftName:sh.name,memberId:m._id,nickIC:m.nickIC,nickFiveM:m.nickFiveM,discordId:m.discordId,steamHex:m.steamHex,cfxId:m.cfxId,totalSeconds:total,minimumSeconds:sh.minimumPlaytimeMinutes*60,status:total>=sh.minimumPlaytimeMinutes*60?'attended':'not_attending',sessions},{upsert:true,new:true});
  }

  const all=await Attendance.find({date:recapDate,shiftId:sh._id}).lean();
  await Event.create({type:'recap',eventKey:`recap:${recapKey}`,payload:{dateKey:recapDate,shiftName:sh.name,minimumPlaytimeMinutes:sh.minimumPlaytimeMinutes,summary:{attended:all.filter(x=>x.status==='attended'),notAttending:all.filter(x=>x.status!=='attended')},appName:s.appName,factionName:s.factionName,attendanceChannelId:s.discordAttendanceChannelId||''}});
}

app.get('/health',async(_q,res)=>{const s=await getSettings();res.json({ok:true,online:active.size,factionTags:tags(),appName:s.appName,cfxServerId:s.cfxServerId});});
app.get('/auth/discord',(req,res)=>{void (async()=>{const s=await getSettings();const u=new URL('https://discord.com/oauth2/authorize');u.searchParams.set('client_id',process.env.DISCORD_CLIENT_ID||'');u.searchParams.set('response_type','code');u.searchParams.set('redirect_uri',process.env.DISCORD_REDIRECT_URI||'');u.searchParams.set('scope','identify guilds.members.read');res.redirect(u.toString());})()});
app.get('/auth/discord/callback',async(req,res)=>{try{const s=await getSettings();const code=String(req.query.code||'');const t=await axios.post('https://discord.com/api/v10/oauth2/token',new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID||'',client_secret:process.env.DISCORD_CLIENT_SECRET||'',grant_type:'authorization_code',code,redirect_uri:process.env.DISCORD_REDIRECT_URI||''}),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});const access=t.data.access_token;const me=await axios.get('https://discord.com/api/v10/users/@me',{headers:{Authorization:`Bearer ${access}`}});if(!s.discordGuildId)throw new Error('Discord Guild ID belum diatur di Settings');const gm=await axios.get(`https://discord.com/api/v10/users/@me/guilds/${s.discordGuildId}/member`,{headers:{Authorization:`Bearer ${access}`}});const roles=gm.data.roles||[];if(!s.discordAdminRoleId||!roles.includes(s.discordAdminRoleId))return res.status(403).send('Admin role required');const avatarUrl=me.data.avatar ? `https://cdn.discordapp.com/avatars/${me.data.id}/${me.data.avatar}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/${(Number(BigInt(me.data.id)) >> 22n) % 6n}.png`;req.session.discord={id:me.data.id,username:me.data.username,globalName:me.data.global_name||'',displayName:me.data.global_name||me.data.username,avatar:me.data.avatar||'',avatarUrl,roles};await Audit.create({actorDiscordId:me.data.id,action:'login',target:'website'});res.redirect(process.env.WEBSITE_URL||'http://localhost:5173');}catch(e:any){res.status(500).send(e?.response?.data?.message||e.message)}});
let discordGuildLogoCache:{url:string,expiresAt:number}|null=null;
async function getDiscordGuildLogoUrl(guildId:string, override:string=''){
  if(override) return override;
  if(!guildId || !process.env.DISCORD_TOKEN) return '';
  if(discordGuildLogoCache && discordGuildLogoCache.expiresAt>Date.now()) return discordGuildLogoCache.url;
  try{
    const r=await axios.get(`https://discord.com/api/v10/guilds/${guildId}`,{headers:{Authorization:`Bot ${process.env.DISCORD_TOKEN}`},timeout:8000});
    const hash=String(r.data?.icon||'');
    const url=hash?`https://cdn.discordapp.com/icons/${guildId}/${hash}.${hash.startsWith('a_')?'gif':'png'}?size=128`:'';
    discordGuildLogoCache={url,expiresAt:Date.now()+300000};
    return url;
  }catch{return '';}
}

app.get('/api/me',async(req,res)=>{res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.set('Pragma','no-cache');const s=await getSettings();const sessionUser=(req.session as any).discord||null;const serverLogoUrl=await getDiscordGuildLogoUrl(s.discordGuildId,s.serverLogoUrl||'');let user=null;if(sessionUser){const avatarUrl=sessionUser.avatar?`https://cdn.discordapp.com/avatars/${sessionUser.id}/${sessionUser.avatar}.${String(sessionUser.avatar).startsWith('a_')?'gif':'png'}?size=128`:`https://cdn.discordapp.com/embed/avatars/${(Number(BigInt(sessionUser.id))>>22)%6}.png`;user={...sessionUser,displayName:sessionUser.displayName||sessionUser.globalName||sessionUser.username,avatarUrl};}res.json({authenticated:!!sessionUser,user,settings:{appName:s.appName,appSubtitle:s.appSubtitle,serverLogoUrl,loginEyebrow:s.loginEyebrow,loginButtonText:s.loginButtonText,loginFooterText:s.loginFooterText,factionName:s.factionName,cfxServerName:s.cfxServerName,shiftName:s.shiftName,shiftStartTime:s.shiftStartTime,shiftEndTime:s.shiftEndTime,timezone:s.timezone}});});
app.post('/auth/logout',admin,(req:any,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/settings',admin,async(_q,res)=>res.json(await getSettings()));
app.patch('/api/settings',admin,async(req:any,res)=>{try{const schema=z.object({appName:z.string().trim().min(1).max(80),appSubtitle:z.string().trim().max(120).default('Roleplay'),serverLogoUrl:z.string().trim().max(500).default(''),loginEyebrow:z.string().trim().max(80).default('ADMIN CONTROL CENTER'),loginButtonText:z.string().trim().max(80).default('Continue with Discord'),loginFooterText:z.string().trim().max(160).default('Restricted to authorized administrators'),factionName:z.string().trim().min(1).max(50),factionTags:z.array(z.string().trim().min(1)).min(1).max(10),cfxServerId:z.string().trim().min(1).max(40),cfxServerName:z.string().trim().min(1).max(120),cfxApiBase:z.string().url(),pollIntervalSeconds:z.number().int().min(10).max(3600),timezone:z.string().trim().min(1).max(80),minimumPlaytimeMinutes:z.number().int().min(1).max(1440),shiftName:z.string().trim().min(1).max(80),shiftStartTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),shiftEndTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),discordGuildId:z.string().trim().max(30),discordAdminRoleId:z.string().trim().max(30),discordPlayerLogChannelId:z.string().trim().max(30),discordAttendanceChannelId:z.string().trim().max(30)});const d=schema.parse(req.body);const before=await getSettings();const updated=await Settings.findOneAndUpdate({key:'default'},{$set:{...d,settingsCustomized:true}},{new:true,upsert:true}).lean();settingsCache=updated;await Member.updateMany({active:true},{$set:{faction:d.factionName}});await Shift.updateMany({enabled:true},{$set:{name:d.shiftName,startTime:d.shiftStartTime,endTime:d.shiftEndTime,minimumPlaytimeMinutes:d.minimumPlaytimeMinutes,timezone:d.timezone}});await Audit.create({actorDiscordId:req.session.discord?.id||'internal',action:'update_settings',target:'system',metadata:{before,after:updated}});res.json(updated);}catch(e:any){res.status(400).json({error:e?.issues?.[0]?.message||e.message||'INVALID_SETTINGS'});}});
app.post('/api/settings/test-cfx',admin,async(_q,res)=>{try{const d=await cfx();const s=await getSettings();const players=d?.Data?.players||d?.players||[];res.json({ok:true,serverId:s.cfxServerId,serverName:d?.Data?.hostname||d?.hostname||s.cfxServerName,clients:d?.Data?.clients??d?.clients??players.length,max:d?.Data?.sv_maxclients??d?.sv_maxclients,playerCount:players.length,players:players.slice(0,20).map((p:any)=>({id:p?.id,name:p?.name,ping:p?.ping,identifiers:ids(p).raw,steamHex:ids(p).steam}))});}catch(e:any){res.status(400).json({ok:false,error:e.message||'CFX_TEST_FAILED'});}});
app.get('/api/cfx-debug',admin,async(_q,res)=>{const d=await cfx();const players=d?.Data?.players||d?.players||[];res.json({serverId:(await getSettings()).cfxServerId,playerCount:players.length,players:players.map((p:any)=>{const i=ids(p);return {id:p?.id,name:p?.name,ping:p?.ping,identifiers:i.raw,steamHex:i.steam,cfxId:i.cfx,discordId:i.discord,matchedBySteam:!!i.steam,matchedByName:!!p?.name};})});});
app.get('/api/server',admin,async(_q,res)=>{const d=await cfx();const s=await getSettings();res.json({hostname:d?.Data?.hostname||d?.hostname||s.cfxServerName,clients:d?.Data?.clients??d?.clients,max:d?.Data?.sv_maxclients??d?.sv_maxclients,online:active.size,players:(d?.Data?.players||d?.players||[]).filter((p:any)=>isFactionName(p.name))});});
app.get('/api/detected',admin,async(_q,res)=>{try{const d=await cfx();const s=await getSettings();const players=(d?.Data?.players||d?.players||[]).filter((p:any)=>isFactionName(p?.name));const out=[];for(const p of players){const i=ids(p);let member:any=null;let matchedBy='';if(i.steam){member=await findMemberBySteam(i.steam);if(member)matchedBy='steam';}if(!member){member=await findMemberByName(String(p?.name||''));if(member)matchedBy='nickFiveM';}out.push({id:p?.id,name:String(p?.name||'Unknown'),ping:p?.ping,identifiers:i.raw,steamHex:i.steam,cfxId:i.cfx,discordId:i.discord,matchedBy,member:member?{_id:member._id,nickIC:member.nickIC,nickFiveM:member.nickFiveM,steamHex:member.steamHex,discordId:member.discordId,cfxId:member.cfxId}:null,serverName:s.cfxServerName});}res.json({serverId:s.cfxServerId,serverName:s.cfxServerName,tags:tags(),players:out});}catch(e:any){res.status(400).json({error:e.message||'DETECTED_PLAYERS_FAILED'});}});
app.get('/api/members',admin,async(_q,res)=>res.json(await Member.find({active:true}).sort({nickIC:1}))); 
app.post('/api/members',admin,async(req:any,res)=>{try{const d=z.object({steamHex:z.string().trim().optional().default(''),nickFiveM:z.string().trim().optional().default(''),nickIC:z.string().trim().optional().default(''),discordId:z.string().trim().optional().default(''),cfxId:z.string().trim().optional().default('')}).refine(x=>!!(x.steamHex||x.nickFiveM||x.nickIC),{message:'Nick FiveM/Nick IC atau Steam Hex wajib diisi'}).parse(req.body);const steamHex=normalizeSteamHex(d.steamHex);const duplicate=await Member.findOne({$or:[...(steamHex?[{steamHex}]:[]),...(d.nickFiveM?[{nickFiveM:d.nickFiveM}]:[]),...(d.discordId?[{discordId:d.discordId}]:[]),...(d.cfxId?[{cfxId:d.cfxId}]:[])]});if(duplicate)return res.status(409).json({error:duplicate.steamHex===steamHex?'STEAM_HEX_ALREADY_REGISTERED':'NICK_FIVEM_ALREADY_REGISTERED',member:duplicate});const m=await Member.create({steamHex,nickFiveM:d.nickFiveM,nickIC:d.nickIC||d.nickFiveM,discordId:d.discordId,cfxId:d.cfxId,faction:factionLabel(),active:true});await Audit.create({actorDiscordId:req.session.discord?.id||'internal',action:'create_member',target:String(m._id),metadata:m.toObject()});res.status(201).json(m);}catch(e:any){res.status(400).json({error:e?.issues?.[0]?.message||e.message||'INVALID_MEMBER'});}});
app.patch('/api/members/:id',admin,async(req:any,res)=>{try{const d=z.object({steamHex:z.string().min(5).optional(),nickFiveM:z.string().trim().optional(),nickIC:z.string().trim().optional(),discordId:z.string().trim().optional(),cfxId:z.string().trim().optional(),active:z.boolean().optional()}).parse(req.body);const update:any={...d};if(update.steamHex)update.steamHex=normalizeSteamHex(update.steamHex);const current=await Member.findById(req.params.id);if(!current)return res.status(404).json({error:'MEMBER_NOT_FOUND'});for(const field of ['steamHex','nickFiveM','discordId','cfxId'])if(update[field]){const q:any={};q[field]=update[field];const dup=await Member.findOne({_id:{$ne:current._id},[field]:field==='steamHex'?normalizeSteamHex(update[field]):update[field]});if(dup)return res.status(409).json({error:`${field.toUpperCase()}_ALREADY_REGISTERED`,member:dup});}const m=await Member.findByIdAndUpdate(req.params.id,update,{new:true,runValidators:true});await Audit.create({actorDiscordId:req.session.discord?.id||'internal',action:'update_member',target:req.params.id,metadata:update});res.json(m);}catch(e:any){res.status(400).json({error:e?.issues?.[0]?.message||e.message||'INVALID_MEMBER'});}});
app.delete('/api/members/:id',admin,async(req:any,res)=>{const id=String(req.params.id);const a=active.get(id);if(a){const now=new Date();const sec=Math.max(0,Math.floor((now.getTime()-new Date(a.connectedAt).getTime())/1000));await Session.findByIdAndUpdate(a.sessionId,{disconnectedAt:now,durationSeconds:sec,status:'completed'});active.delete(id);}const m=await Member.findById(id);if(!m)return res.status(404).json({error:'MEMBER_NOT_FOUND'});await Audit.create({actorDiscordId:req.session.discord?.id||'internal',action:'delete_member',target:id,metadata:{nickIC:m.nickIC,steamHex:m.steamHex}});await Member.findByIdAndDelete(id);res.json({ok:true});});
app.get('/api/shifts',admin,async(_q,res)=>res.json(await Shift.find().sort({startTime:1})));app.post('/api/shifts',admin,async(req,res)=>{const d=z.object({name:z.string(),startTime:z.string(),endTime:z.string(),minimumPlaytimeMinutes:z.number().int().positive().default((settingsCache?.minimumPlaytimeMinutes)||120),timezone:z.string().default((settingsCache?.timezone)||'Asia/Jakarta'),enabled:z.boolean().default(true)}).parse(req.body);res.status(201).json(await Shift.create(d))});app.patch('/api/shifts/:id',admin,async(req,res)=>res.json(await Shift.findByIdAndUpdate(req.params.id,req.body,{new:true})));app.delete('/api/shifts/:id',admin,async(req,res)=>{await Shift.findByIdAndDelete(req.params.id);res.json({ok:true})});
app.get('/api/live',admin,async(_q,res)=>{const out=[];for(const [id,p] of active)out.push({id,...p,member:await Member.findById(p.memberId).lean()});res.json(out);});app.get('/api/attendance',admin,async(req,res)=>{const win=shiftWindow(new Date());const requested=String(req.query.date||'');const date=requested||win.date||dateKey();res.json(await Attendance.find({date}).sort({status:1,nickIC:1}));});
app.get('/internal/settings',async(req,res)=>{if(req.headers['x-internal-secret']!==(process.env.SESSION_SECRET||'dev-secret'))return res.status(401).end();res.json(await getSettings());});
app.get('/internal/events',async(req,res)=>{if(req.headers['x-internal-secret']!==(process.env.SESSION_SECRET||'dev-secret'))return res.status(401).end();res.json(await Event.find({delivered:false}).sort({createdAt:1}).limit(25).lean());});
app.post('/internal/events/:id/ack',async(req,res)=>{if(req.headers['x-internal-secret']!==(process.env.SESSION_SECRET||'dev-secret'))return res.status(401).end();await Event.findByIdAndUpdate(req.params.id,{delivered:true});res.json({ok:true});});

async function main(){if(!process.env.MONGODB_URI)throw new Error('MONGODB_URI belum diatur');await mongoose.connect(process.env.MONGODB_URI);console.log('[API] MongoDB connected');await getSettings();await dedupeMembers();await Member.syncIndexes();await ensureDefaultShift();console.log('[DB] Member unique indexes ready');await sync().catch(e=>console.error('[CFX initial]',e.message));const loop=async()=>{await sync().catch(e=>console.error('[CFX]',e.message));const s=await refreshSettings();setTimeout(loop,Math.max(10,Number(s.pollIntervalSeconds||30))*1000);};setTimeout(loop,Math.max(10,Number(settingsCache?.pollIntervalSeconds||30))*1000);cron.schedule('* * * * *',()=>recap().catch(e=>console.error('[RECAP]',e.message)));app.listen(Number(process.env.PORT||3000),()=>console.log(`[API] http://localhost:${process.env.PORT||3000}`));}
main().catch(e=>{console.error(e);process.exit(1)});
