const levels = [
  { title:'打开地铁入口', brief:'把入口前的两辆单车停进划线区。', initial:['entry','walk'], bays:2, reserve:false, users:['metro'] },
  { title:'让两条路都畅通', brief:'整理四辆单车。临时腾出入口时，别把盲道堵住。', initial:['entry','walk','tactileA','queue'], bays:4, reserve:false, users:['metro','cane'] },
  { title:'晚高峰：少一个车位', brief:'五辆单车只有四个近处车位。选中一辆单车后，向下滑动地图，在南侧找备用停车区。', initial:['entry','walk','tactileA','tactileB','queue'], bays:4, reserve:true, users:['metro','cane'] }
];

const places = {
  entry:[17,35,'地铁入口'], walk:[32,53,'广场西侧'],
  tactileA:[43,68,'盲道中段'], tactileB:[67,68,'盲道东段'],
  queue:[49,55,'广场空地'],
  bay0:[58,32,'停车位 1'], bay1:[68,32,'停车位 2'], bay2:[79,32,'停车位 3'], bay3:[90,32,'停车位 4'],
  reserve:[74,132,'南侧备用停车位']
};
const routes = {
  metro:{ label:'地铁乘客', short:'地铁入口被堵', checkpoints:[[17,62],[17,35,'entry'],[17,30]] },
  cane:{ label:'使用白手杖的行人', short:'盲道被堵', checkpoints:[[25,68],[43,68,'tactileA'],[67,68,'tactileB'],[89,68]] }
};
const get = id => document.getElementById(id);
let levelIndex = 0;
let positions = [];
let history = [];
let selected = null;
let reviewing = false;
let running = false;
let opening = false;

function parkingSpots(level) {
  const bays = Array.from({length:level.bays}, (_, index) => 'bay' + index);
  return level.reserve ? [...bays,'reserve'] : bays;
}

function planWalk(route, layout) {
  const path = [route.checkpoints[0]];
  for (const point of route.checkpoints.slice(1)) {
    const [x,y,spot] = point;
    if (spot && layout.includes(spot)) {
      const [lastX,lastY] = path[path.length-1];
      path.push([x-Math.sign(x-lastX)*7,y-Math.sign(y-lastY)*7]);
      return {path, blocked:places[spot][2]};
    }
    path.push(point);
  }
  return {path, blocked:null};
}

function clearReview() {
  get('result').hidden = true;
  get('routes').replaceChildren();
  get('people').replaceChildren();
}

function render() {
  const level = levels[levelIndex];
  const parking = parkingSpots(level);
  const spots = [...Object.keys(places).filter(id => !id.startsWith('bay') && id !== 'reserve'),...parking];
  get('mission').textContent = level.title;
  get('instruction').textContent = level.brief;
  get('moves').textContent = history.length + ' 次移动';
  get('hint').textContent = running ? (opening ? '先观察行人在哪儿停下。' : '正在测试，请观察行人。') : reviewing ? '查看通行结果。' :
    selected === null ? '点击一辆单车，再点击要移去的位置。' : '已选中单车。点击空位移动。';
  get('undo').disabled = running || !history.length;
  get('reset').disabled = running;
  get('test').disabled = running;
  for (const id of ['extended','map-tail','scroll-note']) get(id).hidden = !level.reserve;
  document.querySelectorAll('[data-level]').forEach(button => {
    button.disabled = running;
    button.setAttribute('aria-current',String(Number(button.dataset.level) === levelIndex));
  });

  const focused = document.activeElement?.dataset.spot;
  get('tiles').replaceChildren(...spots.map(id => {
    const [x,y,label] = places[id];
    const bike = positions.indexOf(id);
    const button = document.createElement('button');
    button.className = 'spot';
    button.dataset.spot = id;
    button.style.left = x+'%';
    button.style.top = y+'%';
    button.dataset.type = id;
    button.disabled = running || (bike < 0 && selected === null);
    button.setAttribute('aria-label',label+(bike >= 0 ? '，单车 '+(bike+1) : '，空位'));
    if (parking.includes(id)) button.classList.add('parking-slot');
    if (bike < 0 && selected !== null) button.classList.add('available');
    if (bike >= 0) {
      const active = selected === bike;
      button.classList.toggle('selected',active);
      button.setAttribute('aria-pressed',String(active));
      const image = document.createElement('img');
      const color = bike % 2 ? 'orange' : 'mint';
      const orientation = parking.includes(id) ? 'parked' : 'side';
      image.src = 'images/bike-'+color+'-'+orientation+'.png';
      image.alt = '';
      button.append(image);
    }
    button.onclick = () => selectOrMove(id,bike);
    return button;
  }));
  if (focused && !running) {
    const button = get('tiles').querySelector('[data-spot="'+focused+'"]');
    if (button && !button.disabled) button.focus({preventScroll:true});
  }
}

function selectOrMove(id,bike) {
  if (running) return;
  reviewing = false;
  get('result').hidden = true;
  if (bike >= 0) selected = selected === bike ? null : bike;
  else if (selected !== null) {
    history.push([...positions]);
    positions[selected] = id;
    selected = null;
  }
  render();
}

function loadLevel(index) {
  if (running) return;
  levelIndex = index;
  positions = [...levels[index].initial];
  history = [];
  selected = null;
  reviewing = false;
  clearReview();
  get('map-scroll').scrollTop = 0;
  opening = true;
  running = true;
  render();
  const level = levels[index];
  Promise.all(level.users.map(user => animateWalk(user,planWalk(routes[user],positions)))).finally(() => {
    opening = false;
    running = false;
    render();
    get('hint').textContent = '行人被挡住了。选中单车，把它停到空位。';
  });
}

function animateWalk(user, plan) {
  const line = document.createElementNS('http://www.w3.org/2000/svg','polyline');
  line.setAttribute('points',plan.path.map(([x,y]) => x+','+y).join(' '));
  line.setAttribute('class',plan.blocked ? 'blocked' : 'clear');
  if (!opening) get('routes').append(line);
  const sprite = document.createElement('img');
  sprite.className = 'walker walker-'+user;
  sprite.alt = '';
  sprite.src = 'images/'+user+'-0.png';
  get('people').append(sprite);
  const segments = plan.path.slice(1).map(([x,y],index) => {
    const [fromX,fromY] = plan.path[index];
    return {x,y,fromX,fromY,length:Math.hypot(x-fromX,y-fromY)};
  });
  const distance = segments.reduce((total,segment) => total+segment.length,0);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const started = performance.now();
  return new Promise(resolve => {
    function tick(now) {
      const elapsed = Math.max(0,now-started);
      let remaining = reduced ? distance : Math.min(distance,elapsed*.026);
      const finished = remaining >= distance;
      const segment = segments.find(part => {
        if (remaining <= part.length) return true;
        remaining -= part.length;
        return false;
      }) ?? segments.at(-1);
      const fraction = finished ? 1 : remaining/segment.length;
      sprite.style.left = (segment.fromX+(segment.x-segment.fromX)*fraction)+'%';
      sprite.style.top = (segment.fromY+(segment.y-segment.fromY)*fraction)+'%';
      const frame = finished ? 0 : Math.floor(elapsed/105)%4;
      const asset = 'images/'+user+'-'+frame+'.png';
      if (sprite.getAttribute('src') !== asset) sprite.src = asset;
      if (!finished) {
        requestAnimationFrame(tick);
        return;
      }
      if (plan.blocked) {
        const x = parseFloat(sprite.style.left);
        const y = parseFloat(sprite.style.top);

        const sweat = document.createElement('img');
        sweat.className = 'walker-sweat';
        sweat.src = 'images/sweat-drop.png';
        sweat.alt = '';
        sweat.style.left = `${x + (user === 'cane' ? 7 : 5)}%`;
        sweat.style.top = `${y - 13}%`;

        const marker = document.createElement('span');
        marker.className = 'block-note';
        marker.style.left = `${x + (user === 'cane' ? 12 : 9)}%`;
        marker.style.top = `${y - 6}%`;
        marker.textContent = routes[user].short;

        get('people').append(sweat, marker);
      }

      resolve();
    }
    requestAnimationFrame(tick);
  });
}

async function testPassage() {
  if (running) return;
  const level = levels[levelIndex];
  selected = null;
  running = true;
  get('map-scroll').scrollTop = 0;
  clearReview();
  render();
  const tests = level.users.map(user => ({user,...planWalk(routes[user],positions)}));
  await Promise.all(tests.map(test => animateWalk(test.user,test)));
  const parked = positions.filter(spot => parkingSpots(level).includes(spot)).length;
  const success = tests.every(test => !test.blocked) && parked === positions.length;
  get('result-title').textContent = success ? '任务完成！' : '还可以再调整';
  const messages = tests.map(({user,blocked}) => routes[user].label+'：'+(blocked ? '在'+blocked+'前停下' : '顺利通过'));
  messages.push('规范停放：'+parked+' / '+positions.length+' 辆');
  get('checks').replaceChildren(...messages.map(message => {
    const item = document.createElement('li');
    item.textContent = message;
    return item;
  }));
  
  const isLastLevel = levelIndex === levels.length - 1;

  get('advance').textContent = success
  ? (isLastLevel ? '查看停车小结 →' : '下一关 →')
  : '继续整理';

  get('advance').onclick = () => {
  if (!success) {
    reviewing = false;
    clearReview();
    render();
    get('test').focus({ preventScroll: true });
    return;
  }

  if (!isLastLevel) {
    loadLevel(levelIndex + 1);
    return;
  }

  const ending = get('ending');
  get('game').hidden = true;
  ending.hidden = false;
  window.scrollTo(0, 0);
  ending.focus({ preventScroll: true });
};
  running = false;
  reviewing = true;
  render();
  get('result').hidden = false;
  get('result').scrollIntoView({block:'nearest',behavior:'auto'});
}

document.querySelectorAll('[data-level]').forEach(button => button.onclick = () => loadLevel(Number(button.dataset.level)));
get('test').onclick = testPassage;
get('reset').onclick = () => loadLevel(levelIndex);
get('undo').onclick = () => {
  if (!history.length || running) return;
  positions = history.pop();
  selected = null;
  reviewing = false;
  clearReview();
  render();
};

get('start-game').onclick = (event) => { 
  const button = event.currentTarget;
  button.classList.add('is-pressed');
  button.disabled = true;

  const bgm = get('game-bgm');
  bgm.volume = 0.25;
  bgm.play().catch(error => console.warn('BGM 播放失败:', error));
  
  setTimeout(() => {
    get('opening').hidden = true;
    get('game').hidden = false;

    window.scrollTo(0, 0);
    get('game-title').focus({ preventScroll: true });
    loadLevel(0);
  }, 140);
  };

  get('back-to-opening').onclick = () => {
  const startButton = get('start-game');

  get('game').hidden = true;
  get('opening').hidden = false;

  startButton.classList.remove('is-pressed');
  startButton.disabled = running;

  window.scrollTo(0, 0);

  function enableStartWhenReady() {
    if (running) {
      requestAnimationFrame(enableStartWhenReady);
      return;
    }

    startButton.disabled = false;
    startButton.focus({ preventScroll: true });
  }

  enableStartWhenReady();
};

get('ending-home').onclick = () => {
  const startButton = get('start-game');

  get('ending').hidden = true;
  get('opening').hidden = false;

  startButton.disabled = false;
  startButton.classList.remove('is-pressed');

  window.scrollTo(0, 0);
  startButton.focus({ preventScroll: true });
};

{
  const map = get('map-scroll');
  const edge = 48;
  let drag = null;
  let suppressClick = false;

  map.addEventListener('pointerdown', event => {
    suppressClick = false;

    const spot = event.target.closest('.spot');
    const image = spot?.querySelector('img');
    if (running || drag || !event.isPrimary || event.button !== 0 || !image) return;

    drag = {
      pointerId: event.pointerId,
      source: spot.dataset.spot,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      preview: null,
      target: null,
      frame: 0
    };
  });

  function updateDropTarget() {
    drag.target?.classList.remove('drop-hover');

    const spot = document.elementFromPoint(drag.x, drag.y)
      ?.closest('.spot.available');

    drag.target = spot && map.contains(spot) && !spot.disabled ? spot : null;
    drag.target?.classList.add('drop-hover');
  }

  function scrollWhileDragging() {
    if (!drag?.preview) return;

    const bounds = map.getBoundingClientRect();
    if (drag.x >= bounds.left && drag.x <= bounds.right) {
      const nearTop = drag.y < bounds.top + edge && drag.y >= bounds.top - edge;
      const nearBottom = drag.y > bounds.bottom - edge && drag.y <= bounds.bottom + edge;

      if (nearTop) map.scrollTop -= 7;
      if (nearBottom) map.scrollTop += 7;
    }

    updateDropTarget();
    drag.frame = requestAnimationFrame(scrollWhileDragging);
  }

  document.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;

    drag.x = event.clientX;
    drag.y = event.clientY;

    if (!drag.preview) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 7) return;

      const bike = positions.indexOf(drag.source);
      if (running || bike === -1) {
        drag = null;
        return;
      }

      const source = map.querySelector(`[data-spot="${drag.source}"] img`);
      const preview = source.cloneNode();
      preview.className = 'bike-drag-preview';
      preview.draggable = false;
      document.body.append(preview);
      drag.preview = preview;

      if (selected !== bike) selectOrMove(drag.source, bike);
      map.querySelector(`[data-spot="${drag.source}"]`)?.classList.add('drag-origin');

      map.setPointerCapture(event.pointerId);
      drag.frame = requestAnimationFrame(scrollWhileDragging);
    }

    drag.preview.style.left = `${drag.x}px`;
    drag.preview.style.top = `${drag.y}px`;
    updateDropTarget();
  });

  function finishDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;

    if (drag.preview) {
      const released = event.type === 'pointerup';

      if (released) {
        drag.x = event.clientX;
        drag.y = event.clientY;
        updateDropTarget();
        suppressClick = true;
      }

      const destination = released ? drag.target?.dataset.spot : null;

      cancelAnimationFrame(drag.frame);
      drag.target?.classList.remove('drop-hover');
      map.querySelector('.drag-origin')?.classList.remove('drag-origin');
      drag.preview.remove();

      if (destination && !running && selected === positions.indexOf(drag.source)) {
        selectOrMove(destination, -1);
      }
    }

    drag = null;
  }

  document.addEventListener('pointerup', finishDrag);
  document.addEventListener('pointercancel', finishDrag);

  map.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}