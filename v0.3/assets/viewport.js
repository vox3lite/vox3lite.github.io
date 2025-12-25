/* =========================================================
   ENGINE CORE (EMBED SAFE)
========================================================= */
(() => {

/* ================= CANVAS ================= */
const canvas = document.getElementById("viewportRENDER");
if (!canvas) throw "viewportRENDER canvas not found";
const ctx = canvas.getContext("2d");

function resize(){
  const dpr = devicePixelRatio || 1;
  canvas.width  = canvas.clientWidth  * dpr;
  canvas.height = canvas.clientHeight * dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
addEventListener("resize", resize);
resize();

/* ================= CLASSES ================= */
const Classes = {
  Game:      { Creatable:false, Deletable:false, Movable:false },
  Workspace: { Creatable:false, Deletable:false, Movable:false },
  Part:      { Creatable:true,  Deletable:true,  Movable:true  }
};

/* ================= INSTANCES ================= */
const Instances = {
  Game: {
    Class: "Game",
    Children: {
      Workspace: {
        Class: "Workspace",
        Parent: null,
        Children: []
      }
    }
  }
};

/* ================= INSTANCE API ================= */
const Instance = {};

Instance.new = function(className, props={}, parent){
  if (!Classes[className]?.Creatable)
    throw `Class ${className} is not creatable`;

  const inst = {
    Class: className,
    Parent: null,
    Children: [],
    Properties: {}
  };

  if (className === "Part") {
    inst.Properties = {
      Anchored: props.Anchored ?? true,
      CanCollide: props.CanCollide ?? true,
      Color: props.Color ?? "#ffffff",
      Transparency: props.Transparency ?? 0,
      Size: props.Size ?? {x:4,y:2,z:4},
      Position: props.Position ?? {x:0,y:0,z:0},
      Rotation: props.Rotation ?? {x:0,y:0,z:0},
      Velocity: {x:0,y:0,z:0}
    };
  }

  if (parent) {
    if (!Classes[parent.Class]?.Movable)
      throw `Cannot parent to ${parent.Class}`;
    inst.Parent = parent;
    parent.Children.push(inst);
  }

  return inst;
};

/* ================= CAMERA / PLAYER ================= */
const cam = {
  x:0, y:6, z:14,
  rx:0, ry:0,
  vy:0
};

const GRAVITY = -0.045;
const FLOOR_Y = 0;
const MOVE_SPEED = 0.15;
const JUMP_POWER = 0.85;
const FOV = 38;

/* ================= INPUT ================= */
const keys = {};
addEventListener("keydown", e => keys[e.code] = true);
addEventListener("keyup",   e => keys[e.code] = false);

/* mouse look */
let mouseDown=false, lastX=0, lastY=0;
canvas.addEventListener("mousedown", e=>{
  mouseDown=true;
  lastX=e.clientX; lastY=e.clientY;
});
addEventListener("mouseup", ()=>mouseDown=false);
addEventListener("mousemove", e=>{
  if(!mouseDown) return;
  cam.ry -= (e.clientX-lastX)*0.25;
  cam.rx += (e.clientY-lastY)*0.25;
  cam.rx = Math.max(-89, Math.min(89, cam.rx));
  lastX=e.clientX; lastY=e.clientY;
});

/* ================= GAMEPAD ================= */
function gamepadMove(){
  const g = navigator.getGamepads?.()[0];
  if(!g) return {mx:0,mz:0,lookX:0,lookY:0,jump:false};

  return {
    mx: g.axes[0],
    mz: g.axes[1],
    lookX: g.axes[2],
    lookY: g.axes[3],
    jump: g.buttons[0]?.pressed
  };
}

/* ================= MATH ================= */
const deg = d => d * Math.PI / 180;

function rotate(v, rx, ry){
  let {x,y,z} = v;
  let cx=Math.cos(rx), sx=Math.sin(rx);
  let cy=Math.cos(ry), sy=Math.sin(ry);

  let y1 = y*cx - z*sx;
  let z1 = y*sx + z*cx;

  let x2 = x*cy - z1*sy;
  let z2 = x*sy + z1*cy;

  return {x:x2,y:y1,z:z2};
}

function worldToCam(p){
  return rotate({
    x:p.x - cam.x,
    y:p.y - cam.y,
    z:p.z - cam.z
  }, deg(cam.rx), deg(cam.ry));
}

/* ================= RENDER ================= */
const FACES = [
  [0,1,3,2],[4,5,7,6],
  [0,1,5,4],[2,3,7,6],
  [0,2,6,4],[1,3,7,5]
];

function loop(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  /* movement */
  let mx=0, mz=0;
  if(keys.KeyW) mz--;
  if(keys.KeyS) mz++;
  if(keys.KeyA) mx--;
  if(keys.KeyD) mx++;

  const gp = gamepadMove();
  mx += gp.mx;
  mz += gp.mz;
  cam.ry -= gp.lookX * 2;
  cam.rx += gp.lookY * 2;
  cam.rx = Math.max(-89, Math.min(89, cam.rx));

  if((keys.Space || gp.jump) && cam.y <= FLOOR_Y+0.01)
    cam.vy = JUMP_POWER;

  cam.vy += GRAVITY;
  cam.y += cam.vy;
  if(cam.y < FLOOR_Y){ cam.y = FLOOR_Y; cam.vy = 0; }

  const yaw = deg(cam.ry);
  cam.x += (Math.sin(yaw)*mz + Math.cos(yaw)*mx) * MOVE_SPEED;
  cam.z += (Math.cos(yaw)*mz - Math.sin(yaw)*mx) * MOVE_SPEED;

  const cx = canvas.clientWidth/2;
  const cy = canvas.clientHeight/2;
  const scale = cy / Math.tan(deg(FOV)/2);

  const draw = [];

  for(const part of Instances.Game.Children.Workspace.Children){
    if(part.Class !== "Part") continue;
    const p = part.Properties;
    const h = {x:p.Size.x/2,y:p.Size.y/2,z:p.Size.z/2};

    const verts = [
      {-h.x,-h.y,-h.z},{-h.x,-h.y,h.z},{-h.x,h.y,-h.z},{-h.x,h.y,h.z},
      { h.x,-h.y,-h.z},{ h.x,-h.y,h.z},{ h.x,h.y,-h.z},{ h.x,h.y,h.z}
    ].map(v=>{
      const r = rotate({x:v[0],y:v[1],z:v[2]},
        deg(p.Rotation.x), deg(p.Rotation.y));
      return {
        x:r.x+p.Position.x,
        y:r.y+p.Position.y,
        z:r.z+p.Position.z
      };
    });

    const proj = verts.map(v=>{
      const c = worldToCam(v);
      if(c.z>=0) return null;
      return {
        x: cx + (c.x/-c.z)*scale,
        y: cy - (c.y/-c.z)*scale,
        z: c.z
      };
    });

    for(const f of FACES){
      let ok=true,z=0,vs=[];
      for(const i of f){
        if(!proj[i]){ok=false;break;}
        vs.push(proj[i]); z+=proj[i].z;
      }
      if(ok) draw.push({
        vs,
        depth:z/4,
        color:p.Color,
        alpha:1-p.Transparency
      });
    }
  }

  draw.sort((a,b)=>a.depth-b.depth);
  for(const d of draw){
    ctx.globalAlpha=d.alpha;
    ctx.beginPath();
    ctx.moveTo(d.vs[0].x,d.vs[0].y);
    for(let i=1;i<4;i++) ctx.lineTo(d.vs[i].x,d.vs[i].y);
    ctx.closePath();
    ctx.fillStyle=d.color;
    ctx.fill();
  }
  ctx.globalAlpha=1;

  requestAnimationFrame(loop);
}
loop();

/* ================= EXPOSE API ================= */
window.EngineAPI = {
  Classes,
  Instances,
  Instance
};

})();
