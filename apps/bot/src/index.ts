import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(__dirname, '../../../.env')
];

const envPath = envCandidates.find(f => fs.existsSync(f));

if (envPath) {
  dotenv.config({ path: envPath });
}
import {Client,GatewayIntentBits,REST,Routes,SlashCommandBuilder,EmbedBuilder,type ChatInputCommandInteraction} from 'discord.js';
import axios from 'axios';
const token=process.env.DISCORD_TOKEN;
const apiBase=process.env.API_PUBLIC_URL||'http://localhost:3000';
const internalSecret=process.env.SESSION_SECRET||'dev-secret';
if(!token)throw new Error('DISCORD_TOKEN belum diatur di root .env');
const client=new Client({intents:[GatewayIntentBits.Guilds]});
const commands=[
 new SlashCommandBuilder().setName('help').setDescription('Daftar command attendance'),
 new SlashCommandBuilder().setName('players').setDescription('Lihat player faction yang sedang online'),
 new SlashCommandBuilder().setName('check').setDescription('Cari member berdasarkan Nick/Discord/Steam').addStringOption(o=>o.setName('query').setDescription('Nama, Discord ID, CFX ID, atau Steam Hex').setRequired(true)),
 new SlashCommandBuilder().setName('attendance').setDescription('Lihat attendance').addStringOption(o=>o.setName('date').setDescription('YYYY-MM-DD').setRequired(false)),
 new SlashCommandBuilder().setName('settings').setDescription('Lihat konfigurasi sistem yang aktif'),
].map(x=>x.toJSON());
let config:any={};
let registeredGuildId='';
let pollRunning=false;
async function registerCommands(){const guildId=config.discordGuildId||process.env.DISCORD_GUILD_ID||'';if(!guildId||registeredGuildId===guildId||!client.user)return;if(!token)return;const rest=new REST({version:'10'}).setToken(token);await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID||client.user.id,guildId),{body:commands});registeredGuildId=guildId;console.log(`[BOT] Slash commands registered for guild ${guildId}`);}
async function apiGet<T=any>(route:string):Promise<T>{const r=await axios.get<T>(`${apiBase}${route}`,{timeout:15000,headers:{'x-internal-secret':internalSecret}});return r.data;}
async function apiPost(route:string,body:any={}){return axios.post(`${apiBase}${route}`,body,{timeout:15000,headers:{'x-internal-secret':internalSecret}});}
async function loadConfig(){config=await apiGet('/internal/settings');try{await registerCommands();}catch(error:any){console.error('[BOT] Command registration:',error?.message||error);}return config;}
async function isAllowed(interaction:ChatInputCommandInteraction){const c=await loadConfig();const role=c.discordAdminRoleId||process.env.DISCORD_ADMIN_ROLE_ID||'';if(!role)return false;const member=interaction.member;if(!member||typeof member==='string'||!('roles' in member))return false;return member.roles.cache.has(role);}
function duration(seconds:number){const total=Math.max(0,Number(seconds)||0);return `${Math.floor(total/3600)}h ${Math.floor((total%3600)/60)}m`;}
function formatDiscordDate(value:any){const d=new Date(value||Date.now());return new Intl.DateTimeFormat('id-ID',{timeZone:config.timezone||'Asia/Jakarta',day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d).replace('.',':');}
function playerMention(id:any){return id ? `<@${id}>` : '';}
function playerLogChannelId(c:any){return c.discordPlayerLogChannelId||process.env.DISCORD_PLAYER_LOG_CHANNEL_ID||c.discordEventChannelId||process.env.DISCORD_EVENT_CHANNEL_ID||'';}
function attendanceChannelId(c:any){return c.discordAttendanceChannelId||process.env.DISCORD_ATTENDANCE_CHANNEL_ID||'';}
function serverLogo(c:any){const url=String(c.serverLogoUrl||'').trim();return /^https?:\/\//i.test(url)?url:'';}
function baseEmbed(c:any,color:number){const e=new EmbedBuilder().setColor(color).setFooter({text:`${c.appName||'Faction Attendance'} • ${c.factionName||'Faction'}`}).setTimestamp();const logo=serverLogo(c);if(logo)e.setThumbnail(logo);return e;}
function displayName(p:any){return p.nickIC||p.nickFiveM||'Player';}
function memberLine(x:any,index:number){return `${String(index).padStart(2,'0')}. **${x.nickIC||x.nickFiveM||'-'}** — **${duration(x.totalSeconds)}**`;}
function attendanceLines(items:any[]){return items.length?items.slice(0,50).map((x:any,i:number)=>`${i+1}. **${x.nickIC||x.nickFiveM||'-'}** (${playerMention(x.discordId)||'No Discord'}) - ${duration(x.totalSeconds).replace(/ /g,'')}`).join('\n'):'_Tidak ada data_';}
async function pollEvents(){if(pollRunning)return;pollRunning=true;try{const c=await loadConfig();const events=await apiGet<any[]>('/internal/events');for(const event of events){try{const payload=event.payload||{};const channelId=event.type==='recap'?(payload.attendanceChannelId||attendanceChannelId(c)):(payload.playerLogChannelId||playerLogChannelId(c));if(!channelId)throw new Error(event.type==='recap'?'Attendance Channel ID belum diatur di Settings':'Player Log Channel ID belum diatur di Settings');const channel=await client.channels.fetch(channelId);if(!channel||!channel.isTextBased())throw new Error(`Channel ${channelId} bukan text channel atau tidak ditemukan`);
if(event.type==='online'){
 const mention=playerMention(payload.discordId);const name=displayName(payload);
 const embed=new EmbedBuilder()
   .setColor(0x22c55e)
   .setAuthor({name:`${name}${mention?` (${mention})`:''}`})
   .setDescription(`\`[${payload.serverPlayerId??'-'}]\` **${payload.nickFiveM||name}** is connected.`)
   .setFooter({text:`${formatDiscordDate(payload.connectedAt)} • Source: ${payload.serverName||c.cfxServerName||'CFX Server'}`})
   .setTimestamp(new Date(payload.connectedAt||Date.now()));
 await channel.send({embeds:[embed]});
}
if(event.type==='offline'){
 const mention=playerMention(payload.discordId);const name=displayName(payload);
 const embed=new EmbedBuilder()
   .setColor(0xef4444)
   .setAuthor({name:`${name}${mention?` (${mention})`:''}`})
   .setDescription(`\`[${payload.serverPlayerId??'-'}]\` **${payload.nickFiveM||name}** is disconnected.\n\n⏱️ Online: **${duration(payload.durationSeconds)}**`)
   .setFooter({text:`${formatDiscordDate(payload.disconnectedAt||Date.now())} • Source: ${payload.serverName||c.cfxServerName||'CFX Server'}`})
   .setTimestamp(new Date(payload.disconnectedAt||Date.now()));
 await channel.send({embeds:[embed]});
}
if(event.type==='recap'){
 const summary=payload.summary||{};const attended=summary.attended||[];const notAttending=summary.notAttending||[];const total=attended.length+notAttending.length;const min=`${payload.minimumPlaytimeMinutes||0} menit`;
 const attendedText=attendanceLines(attended);
 const notAttendingText=attendanceLines(notAttending);
 const check='https://canary.discord.com/assets/43b7ead1fb91b731.svg';
 const cross='https://canary.discord.com/assets/4f584fe7b12fcf02.svg';
 const description=`[**✅**](${check}) **Attended**\n\n${attendedText}\n\n[**❌**](${cross}) **Not Attending**\n\n${notAttendingText}`;
 const embed=baseEmbed(c,0xc9a227)
  .setAuthor({name:`${payload.appName||c.appName||'Attendance'} • Attendance`,iconURL:serverLogo(c)||undefined})
  .setTitle(`📋  ATTENDANCE REPORT`)
  .setDescription(`**${payload.factionName||c.factionName||'Faction'}**  •  **${payload.shiftName||'-'}**\n\`${payload.dateKey||'-'}\`  •  Minimum **${min}**\n\n${description}`);
 await channel.send({embeds:[embed]});
}
await apiPost(`/internal/events/${event._id}/ack`);}catch(error:any){console.error('[EVENT ITEM]',error?.message||error);}}}catch(error:any){console.error('[EVENT POLL]',error?.message||error);}finally{pollRunning=false;}}
client.once('clientReady',async()=>{console.log(`[BOT] ${client.user?.tag}`);console.log(`[ENV] API: ${apiBase}`);try{await loadConfig();console.log(`[CONFIG] ${config.appName} | ${config.factionName} | ${config.cfxServerName}`);}catch(error:any){console.error('[BOT] Config/command registration failed:',error?.message||error);}setInterval(()=>void pollEvents(),5000);void pollEvents();});
client.on('interactionCreate',async interaction=>{if(!interaction.isChatInputCommand())return;try{if(!(await isAllowed(interaction))){await interaction.reply({content:'❌ Kamu tidak memiliki akses ke sistem absensi.',flags:64});return;}await interaction.deferReply({flags:64});const c=config||await loadConfig();
if(interaction.commandName==='help'){
 const embed=baseEmbed(c,0xc9a227).setTitle(`🤖  ${c.appName||'Faction Attendance'}`).setDescription(`**${c.factionName||'Faction'} Management Bot**\nGunakan command berikut untuk memantau server dan attendance.`).addFields(
  {name:'🎮 Server',value:'`/players` — Player faction yang sedang online\n`/check <query>` — Cari member',inline:false},
  {name:'📋 Attendance',value:'`/attendance [date]` — Lihat attendance',inline:false},
  {name:'⚙️ System',value:'`/settings` — Lihat konfigurasi aktif',inline:false}
 ).setFooter({text:`${c.appName||'Faction Attendance'} • Admin Only`});
 await interaction.editReply({embeds:[embed]});return;}
if(interaction.commandName==='settings'){
 const embed=baseEmbed(c,0xc9a227).setTitle(`⚙️  ${c.appName||'System'} Settings`).setDescription(`Konfigurasi aktif untuk **${c.factionName||'-'}**`).addFields(
  {name:'🏷️ Faction',value:`**${c.factionName||'-'}**\nTags: ${c.factionTags?.length?(c.factionTags.map((x:any)=>`\`${x}\``).join(' ')):'-'}`,inline:true},
  {name:'🌐 CFX Server',value:`**${c.cfxServerName||'-'}**\nID: \`${c.cfxServerId||'-'}\``,inline:true},
  {name:'⏱️ Polling',value:`**${c.pollIntervalSeconds||0}s**`,inline:true},
  {name:'📋 Attendance',value:`Minimum: **${c.minimumPlaytimeMinutes||0}m**`,inline:true},
  {name:'🕘 Shift',value:`**${c.shiftName||'-'}**\n${c.shiftStartTime||'-'} → ${c.shiftEndTime||'-'}`,inline:true},
  {name:'🌏 Timezone',value:`\`${c.timezone||'-'}\``,inline:true}
 );await interaction.editReply({embeds:[embed]});return;}
if(interaction.commandName==='players'){
 const rows=await apiGet<any[]>('/api/live');
 const text=rows.length?rows.slice(0,20).map((row:any,i:number)=>`**${i+1}.** **${row.member?.nickIC||row.nickIC||'-'}**\n> \`${row.name||row.nickFiveM||'-'}\`  •  \`${row.ping||0}ms\``).join('\n'):`*Tidak ada member ${c.factionName||'faction'} online.*`;
 const embed=baseEmbed(c,0x22c55e).setTitle(`🟢  LIVE PLAYERS`).setDescription(`**${rows.length}** member sedang online di **${c.cfxServerName||'CFX Server'}**.\n\n${text}`);await interaction.editReply({embeds:[embed]});return;}
if(interaction.commandName==='check'){
 const query=interaction.options.getString('query',true).toLowerCase();const members=await apiGet<any[]>('/api/members');const found=members.filter((m:any)=>JSON.stringify(m).toLowerCase().includes(query)).slice(0,10);
 if(!found.length){await interaction.editReply({embeds:[baseEmbed(c,0xef4444).setTitle('🔎  MEMBER NOT FOUND').setDescription(`Tidak menemukan member dengan query \`${query}\`.`)]});return;}
 const embeds=found.slice(0,5).map((m:any)=>baseEmbed(c,m.active===false?0x64748b:0xc9a227).setTitle(`👤  ${m.nickIC||m.nickFiveM||'Member'}`).setDescription(`**FiveM:** \`${m.nickFiveM||'-'}\``).addFields({name:'💬 Discord',value:m.discordId?`<@${m.discordId}>`:'`-`',inline:true},{name:'🎮 CFX',value:`\`${m.cfxId||'-'}\``,inline:true},{name:'🔑 Steam',value:`\`${m.steamHex||'-'}\``,inline:true},{name:'Status',value:m.active===false?'🔴 Inactive':'🟢 Active',inline:true}));
 await interaction.editReply({embeds});return;}
if(interaction.commandName==='attendance'){
 const date=interaction.options.getString('date');const rows=await apiGet<any[]>(date?`/api/attendance?date=${encodeURIComponent(date)}`:'/api/attendance');const attended=rows.filter((r:any)=>r.status==='attended');const missing=rows.filter((r:any)=>r.status!=='attended');const embed=baseEmbed(c,0xc9a227).setTitle(`📋  ATTENDANCE`).setDescription(`**${c.factionName||'Faction'}** • ${date||'Terbaru'}\nHadir **${attended.length}** • Belum memenuhi **${missing.length}**`).setDescription(`[**✅**](https://canary.discord.com/assets/43b7ead1fb91b731.svg) **Attended**\n\n${attendanceLines(attended)}\n\n[**❌**](https://canary.discord.com/assets/4f584fe7b12fcf02.svg) **Not Attending**\n\n${attendanceLines(missing)}`);await interaction.editReply({embeds:[embed]});return;}}
catch(error:any){const message=error?.response?.data?.error||error?.response?.data?.message||error?.message||'Unknown error';console.error('[COMMAND]',message);if(interaction.deferred||interaction.replied)await interaction.editReply(`❌ Error: ${message}`);else await interaction.reply({content:`❌ Error: ${message}`,flags:64});}});
client.login(token).catch(error=>{console.error('[BOT] Login failed:',error?.message||error);process.exit(1);});
