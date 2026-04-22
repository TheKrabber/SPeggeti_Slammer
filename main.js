let scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

let camera = new THREE.PerspectiveCamera(75,innerWidth/innerHeight,0.1,2000);
let renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
document.body.appendChild(renderer.domElement);

let controls = new THREE.PointerLockControls(camera,document.body);

document.getElementById("startBtn").onclick = ()=>{
controls.lock();
};

controls.addEventListener("lock",()=>{
document.getElementById("menu").style.display="none";
document.getElementById("crosshair").style.display="block";
});

controls.addEventListener("unlock",()=>{
document.getElementById("menu").style.display="block";
document.getElementById("crosshair").style.display="none";
});

scene.add(controls.getObject());

camera.position.set(0,4,0);

let light = new THREE.DirectionalLight(0xffffff,1.3);
light.position.set(50,100,50);
scene.add(light);

scene.add(new THREE.AmbientLight(0xffffff,0.6));

/* Ground */
let ground = new THREE.Mesh(
new THREE.PlaneGeometry(2000,2000),
new THREE.MeshLambertMaterial({color:0x666666})
);
ground.rotation.x = -Math.PI/2;
scene.add(ground);

/* Roads */
for(let i=-800;i<=800;i+=200){
let road = new THREE.Mesh(
new THREE.BoxGeometry(2000,0.1,40),
new THREE.MeshLambertMaterial({color:0x222222})
);
road.position.z=i;
scene.add(road);

let road2 = road.clone();
road2.rotation.y=Math.PI/2;
road2.position.set(i,0.05,0);
scene.add(road2);
}

/* Buildings */
for(let i=0;i<300;i++){
let b = new THREE.Mesh(
new THREE.BoxGeometry(
20+Math.random()*30,
30+Math.random()*100,
20+Math.random()*30
),
new THREE.MeshLambertMaterial({color:Math.random()*0xffffff})
);

b.position.set(
(Math.random()-0.5)*1800,
b.geometry.parameters.height/2,
(Math.random()-0.5)*1800
);

scene.add(b);
}

/* Hammer */
let hammer = new THREE.Group();

let handle = new THREE.Mesh(
new THREE.BoxGeometry(0.2,2.2,0.2),
new THREE.MeshLambertMaterial({color:0x8b4513})
);

handle.position.y=-1;
hammer.add(handle);

let head = new THREE.Mesh(
new THREE.BoxGeometry(1.2,0.5,0.6),
new THREE.MeshLambertMaterial({color:0x777777})
);

head.position.y=0.2;
hammer.add(head);

camera.add(hammer);
hammer.position.set(1,-1.2,-2);
hammer.rotation.z=0.3;

/* NPCs */
let npcs=[];

function spawnNPC(){
let npc = new THREE.Mesh(
new THREE.BoxGeometry(1,3,1),
new THREE.MeshLambertMaterial({color:0xffaa00})
);
npc.position.set(
(Math.random()-0.5)*1000,
1.5,
(Math.random()-0.5)*1000
);
npc.userData.dir=Math.random()*Math.PI*2;
scene.add(npc);
npcs.push(npc);
}

for(let i=0;i<40;i++) spawnNPC();

/* Cars */
let cars=[];

function spawnCar(){
let car = new THREE.Mesh(
new THREE.BoxGeometry(5,2,3),
new THREE.MeshLambertMaterial({color:0xff0000})
);

if(Math.random()>0.5){
car.position.set(-900,1,Math.floor(Math.random()*8-4)*200);
car.userData.vx=1.5;
car.userData.vz=0;
}else{
car.position.set(Math.floor(Math.random()*8-4)*200,1,-900);
car.userData.vx=0;
car.userData.vz=1.5;
}
scene.add(car);
cars.push(car);
}

for(let i=0;i<15;i++) spawnCar();

/* Movement */
let keys={};
document.addEventListener("keydown",e=>keys[e.code]=true);
document.addEventListener("keyup",e=>keys[e.code]=false);

let speed=0.2;

/* Swing */
let canSwing=true;
let swingSide=1;
let swingTimer=0;

document.addEventListener("mousedown",()=>{
if(!canSwing || !controls.isLocked) return;

canSwing=false;
swingTimer=20;
swingSide*=-1;

checkHits();

setTimeout(()=>canSwing=true,3500);
});

function checkHits(){
let pos = camera.getWorldPosition(new THREE.Vector3());
let dir = camera.getWorldDirection(new THREE.Vector3());

npcs.forEach((npc,i)=>{
let d = npc.position.clone().sub(pos);
if(d.length()<6 && d.normalize().dot(dir)>0.6){
spaghetti(npc.position);
scene.remove(npc);
npcs.splice(i,1);
setTimeout(spawnNPC,3000);
}
});

cars.forEach((car,i)=>{
let d = car.position.clone().sub(pos);
if(d.length()<8 && d.normalize().dot(dir)>0.5){
spaghetti(car.position);
scene.remove(car);
cars.splice(i,1);
setTimeout(spawnCar,4000);
}
});
}

function spaghetti(p){
for(let i=0;i<20;i++){
let s = new THREE.Mesh(
new THREE.CylinderGeometry(0.05,0.05,2,6),
new THREE.MeshLambertMaterial({color:0xffdd55})
);
s.position.copy(p);
s.rotation.z=Math.random()*6;
s.rotation.x=Math.random()*6;
scene.add(s);

setTimeout(()=>scene.remove(s),3000);
}
}

/* Animate */
function animate(){
requestAnimationFrame(animate);

/* Movement */
if(controls.isLocked){
let run = keys["ShiftLeft"] ? 0.4 : 0.2;

if(keys["KeyW"] && !keys["KeyS"]) controls.moveForward(run);
if(keys["KeyS"] && !keys["KeyW"]) controls.moveForward(-run);
if(keys["KeyA"] && !keys["KeyD"]) controls.moveRight(-run);
if(keys["KeyD"] && !keys["KeyA"]) controls.moveRight(run);
}

/* Hammer anim */
if(swingTimer>0){
hammer.rotation.z += 0.25*swingSide;
swingTimer--;
}else{
hammer.rotation.z *=0.8;
}

/* NPC walk */
npcs.forEach(n=>{
n.position.x += Math.sin(n.userData.dir)*0.08;
n.position.z += Math.cos(n.userData.dir)*0.08;

if(Math.random()<0.01) n.userData.dir += (Math.random()-0.5);
});

/* Cars move */
cars.forEach(c=>{
c.position.x += c.userData.vx;
c.position.z += c.userData.vz;

if(c.position.x>950) c.position.x=-950;
if(c.position.z>950) c.position.z=-950;
});

/* Respawn NPC count */
while(npcs.length<40) spawnNPC();
while(cars.length<15) spawnCar();

renderer.render(scene,camera);
}

animate();

addEventListener("resize",()=>{
camera.aspect=innerWidth/innerHeight;
camera.updateProjectionMatrix();
renderer.setSize(innerWidth,innerHeight);
});
