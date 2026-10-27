// Regenerates docs/lineup.svg: node docs/gen-lineup.js
// The costumes below are copied from COSTUMES in plugins/savvy-progress/hooks/register.tsx;
// update both when a hero changes. The CSS is read from the mod itself.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const CLAY='#D97757',INK='#1F1E1D';
const C={
fable:(f,t,st,body)=>{f(26,4,1,21,'#7A4A26');f(26,23,1,2,'#5A3519');body(-4);
 st(4,0,['.......pppp','.....ppp.hpp','....pp...hppp','........hhpppd','.......hhppspdd','.......hhpsssdd','......hhpppsppdd','.....aaaaaaaaaaaa','.....hhppppppppdd','dppppppppppppppppppppd'],{p:'#4A2C86',h:'#6A48B0',d:'#2F1A5C',s:'#F5C542',a:t});
 f(25,1,3,3,t,'orb');f(25,1,1,1,'#fff','orb');st(27,5,['.s.','sss','.s.'],{s:'#F5C542'},'spk')},
heavy:(f,t,st,body)=>{body(0);
 st(5,0,['....b.b......b.b....','....bbb......bbb....','.g...b........b...g.','.gg..b........b..gg.','.gng.B........B.gng.','ggnngBggggggggBgnngg','gglgggglggggglggglgg','gGgggGggggGgggggGggg','GefeefeefaafeefeefeG','gGGGGGGGGGGGGGGGGGGg','gG................Gg','gG................Gg','.g................g.','.g................g.'],{g:'#7D6B58',G:'#5A4B3C',l:'#9E8B74',n:'#3F3128',b:'#EADFC4',B:'#C9B48A',e:'#3E8A3A',f:'#78C04E',a:t});
 st(24,1,['.f.f.','fefef','.eWe.','f.W.f','..W..'],{e:'#3E8A3A',f:'#78C04E',W:'#7A4A26'},'it');
 f(26,6,1,5,'#7A4A26','it');f(27,10,1,4,'#7A4A26','it');f(26,13,1,9,'#7A4A26','it');f(25,21,1,4,'#7A4A26','it');
 f(26,8,1,1,'#5A3519','it');f(27,11,1,1,'#5A3519','it');f(26,18,1,1,'#5A3519','it')},
careful:(f,t,st,body)=>{body(-4);
 st(8,0,['.....aaaa','...aaaaaaa','.aaaa.aaa','aa....gg'],{a:t,g:'#E0B23A'});
 st(6,4,['....MLWWLLLLLM....','..MLWLLLLLLLLLMD..','.MLWLLLLLLLLLLLMD.','.MLWLLLLMMLLLLLMD.','.MLWLLLLMMLLLLLMD.','.MLWLLLLMMLLLLLMD.','.MLWLLLLMMLLLLLMD.','.MLWLLLLMMLLLLLMD.','.MKKKKKKMMKKKKKKD.','.MKKKKKKMMKKKKKKD.','DMMMMMMMMMMMMMMMMD'],{W:'#F4F6F9',L:'#C8CDD6',M:'#8C939F',D:'#5B626E',K:'#16181C'});
 st(0,10,['MMMMMMM','MwwawwM','MwwawwM','MaaaaaM','MwwawwM','MwwawwM','.MwawM.','.MwawM.','..MaM..','..MMM..','...M...'],{M:'#8C939F',w:'#FAFAF7',a:t});
 st(23,0,['..e...','..es..','..es..','..es..','..es..','..es..','..es..','gggggg','..hh..','..hh..'],{e:'#F4F6F9',s:'#A3ABB7',g:'#E0B23A',h:'#5A3519'},'it')},
medium:(f,t,st,body)=>{body(-4);
 st(6,4,['.....Iiiaaiik.....','...IIiiiaaiiiik...','..IIiiiiaaiiiiik..','..IIiiiiaaiiiiik..','..IIiiiiaaiiiiik..','.krkkkkrkkrkkkkrk.','uUuuUuuuUuuUuuuUuu','U.u..U...u..U..u.U'],{i:'#4A4E55',I:'#6F757E',k:'#2E3136',r:'#9AA0A8',a:t,u:'#7A5230',U:'#5C3C22'});
 const h={v:'#EFE6CF',V:'#CDBF9E'};st(3,5,['v....','vV...','.vvV.','..vvV'],h);st(22,5,['....v','...Vv','.Vvv.','Vvv..'],h);
 f(27,0,1,15,'#7A4A26','axe');st(25,0,['E.h.E','EsdsE','EsdsE','E.h.E'],{E:'#E6EAF0',s:'#A9B0BA',d:'#6E7680',h:'#7A4A26'},'axe')},
light:(f,t,st,body)=>{body(-4);
 st(6,3,['.......PPPP','.....RPPPPPPQ','...RRPPPPPPPPPQ','..RPPPPPPPPPPPPQ','.RPPPPPPPPPPPPPPQ','RPPPPPPPPPPPPPPPQ','RPPPPPPPPPPPPPPPQ','QPPPPPPPPPPPPPPPQ','QQQQQQQQQQQQQQQQQ','Q','Q','QCCCCCCCCCCCCCCCC','QCCCCCCCCCCCCCCCC'],{P:'#4A2B52',R:'#64407A',Q:'#2E1A35',C:'#3B3346'});
 f(6,10,1,2,t);st(0,9,['..aaaa','aaaaaa','aa.aa.','a.....'],{a:t},'flag');
 f(23,9,5,1,'#6E7680');f(23,6,1,3,'#DDE2E8');f(25,3,1,6,'#DDE2E8');f(27,6,1,3,'#DDE2E8')},
swarm:(f,t,st,body)=>{body(-4);
 st(7,4,['.....ttttt.....','...tttTTtttt...','..tTTttttTTtt..','.ttttTTttttTTt.','.TTttttaaatttTT','ttttttttttttttt'],{t:'#E3D3AE',T:'#BFA97A',a:t});
 st(7,14,['rrrrrrrrrrrrrrrr','RRRRRRRRRRRRRRRR'],{r:'#2F7F86',R:'#1F5A60'});
 st(26,0,['.e.','eEe','eEe','.E.'],{e:'#E6EAF0',E:'#A9B0BA'},'it');f(27,4,1,21,'#7A4A26','it');f(26,6,3,1,t,'it')},
tester:(f,t,st,body)=>{body(-4);
 st(7,5,['.....sssss.....','...sssssssss...','..gsssssssssg..','.ggssssssssssg.','gggrrrrrrrrrggg'],{s:'#E8C9A0',g:'#C9C6BF',r:'#8E2433'});
 st(7,10,['rr............rr','rr............rr','rr............rr','Rr............rR','RrwwwwwwwwwwwwrR','R..wwWwwwwWww..R','R...wwwwwwww...R','.....wwWWww.....','......wwww......','.......ww.......'],{r:'#8E2433',R:'#5E1620',w:'#F2EFE8',W:'#C9C6BF'});
 st(0,11,['pppp','paap','pppp','paap','pppp'],{p:'#E9DCB5',a:t},'id');
 st(25,3,['WWW','W.W','..W'],{W:'#7A4A26'},'it');f(27,6,1,19,'#7A4A26','it');f(27,12,1,1,'#5A3519','it');f(27,19,1,1,'#5A3519','it')},
explore:(f,t,st,body)=>{body(0);
 st(6,5,['....hyyyyyyyyY....','..hhyyyyyyyyyyyY..','.hyyyyyyyyyyyyyyY.','.GGGGGGGaaGGGGGGG.','.yyyyyyyyyyyyyyyy.','.yYy.y......y.yYy.','.Y..............Y.'],{y:'#EBC45C',Y:'#C99B34',h:'#F6DC8C',G:'#3C8C40',a:t});
 st(1,7,['...yyG','..yyy.','.yyY..','.yY...','yY....','y.....'],{y:'#EBC45C',Y:'#C99B34',G:'#3C8C40'},'pony');
 st(24,4,['.b...','b....','sb...','sb...','s.b..','s.b..','s.b..','s..b.','s..b.','s..b.','s..BB','s..BB','s..BB','s..b.','s..b.','s..b.','s.b..','s.b..','s.b..','sb...','sb...','b....','.b...'],{b:'#8A5A2B',B:'#5E3A1A',s:'#CFC6B2'},'it')},
other:(f,t,st,body)=>{body(-4);
 st(6,4,['.....CccccccC','...CccccwwccccC','..CwccwcwwcwccwC','.CcwccwcwwcwccwcC','.wwwwwwwaawwwwwww','CcccccccccccccccC','Ccc............cC','Cc','C'],{c:'#1F2B23',C:'#3E5A47',w:'#E9E4D6',a:t});
 f(26,5,1,7,'#5A4636');st(25,2,['www','kwk','.w.'],{w:'#E9E4D6',k:'#1F2B23'});f(26,1,1,1,'#39E36B','gl')}
};
function crab(costume,t,x,y,s){
 const g={bd:[],la:[],lb:[]},order=[];
 const f=(X,Y,w,h,c,cls='bd')=>{if(!g[cls]){g[cls]=[];order.push(cls)}g[cls].push(`<rect x="${X}" y="${Y}" width="${w}" height="${h}" fill="${c}"/>`)};
 const st=(X,Y,rows,m,cls)=>rows.forEach((r,dy)=>[...r].forEach((ch,dx)=>m[ch]&&f(X+dx,Y+dy,1,1,m[ch],cls)));
 const body=a=>{f(7,10,16,12,CLAY);f(3,14,4,4,CLAY);f(23,14+a,4,4,CLAY);f(9,12,2,2,INK);f(19,12,2,2,INK);f(7,22,2,4,CLAY,'la');f(17,22,2,4,CLAY,'la');f(11,22,2,4,CLAY,'lb');f(21,22,2,4,CLAY,'lb')};
 C[costume](f,t,st,body);
 const props=order.filter(k=>!['la','lb'].includes(k)).map(k=>`<g class="${k}">${g[k].join('')}</g>`).join('');
 return `<g transform="translate(${x},${y}) scale(${s})"><g class="c-${costume} run"><g class="bd">${g.bd.join('')}${props}</g><g class="la">${g.la.join('')}</g><g class="lb">${g.lb.join('')}</g></g></g>`;
}
const L=[['fable','#7F77DD','savvy-fable','Sorceress','Fable · high'],['heavy','#D85A30','savvy-heavy','Druid','Opus · xhigh'],['careful','#BA7517','savvy-careful','Paladin','Opus · high'],['medium','#378ADD','savvy-medium','Barbarian','Opus · medium'],['light','#1D9E75','savvy-light','Assassin','Opus · low'],['swarm','#C8A24A','savvy-swarm','Desert Mercenary','Sonnet · medium'],['tester','#A8323E','savvy-tester','Deckard Cain','Sonnet · medium'],['explore','#C2477A','Explore','Amazon','any model'],['other','#2AA5B5','other agents','Necromancer','any model']];
const src=fs.readFileSync(path.join(root,'plugins/savvy-progress/hooks/register.tsx'),'utf8');
const css=/const CRAB_CSS = `<style>([\s\S]*?)<\/style>`/.exec(src)[1];
const W=150,cols=L.length,H=210;
let out=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W*cols} ${H}" width="${W*cols}" height="${H}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif"><style>${css} text{fill:#8B949E;font-size:13px;text-anchor:middle} .n{font-weight:600;font-size:14px} rect{shape-rendering:crispEdges}</style>`;
L.forEach(([c,t,n,cls,m],i)=>{const cx=i*W+W/2;out+=crab(c,t,cx-60,20,4)+`<text class="n" x="${cx}" y="152" style="fill:${t}">${n}</text><text x="${cx}" y="172">${cls}</text><text x="${cx}" y="190">${m}</text>`});
out+='</svg>\n';
fs.writeFileSync(path.join(__dirname,'lineup.svg'),out);
