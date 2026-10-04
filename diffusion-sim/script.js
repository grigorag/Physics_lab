(function () {
  "use strict";

  var canvas = document.getElementById("sim");
  var ctx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height;

  var msdCanvas = document.getElementById("msd");
  var msdCtx = msdCanvas.getContext("2d");

  var tempSlider = document.getElementById("tempSlider");
  var countSlider = document.getElementById("countSlider");
  var massSlider = document.getElementById("massSlider");
  var trailToggle = document.getElementById("trailToggle");
  var resetBtn = document.getElementById("resetBtn");
  var pauseBtn = document.getElementById("pauseBtn");

  var tempVal = document.getElementById("tempVal");
  var countVal = document.getElementById("countVal");
  var massVal = document.getElementById("massVal");
  var speedVal = document.getElementById("speedVal");
  var pathVal = document.getElementById("pathVal");
  var timeVal = document.getElementById("timeVal");

  var SMALL_RADIUS = 3;
  var BIG_RADIUS = 15;

  function currentMass() { return parseFloat(massSlider.value); }

  var molecules = [];
  var big = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: BIG_RADIUS, m: currentMass() };
  var trail = [];
  var msdHistory = [];
  var time = 0;
  var pathLength = 0;
  var paused = false;
  var startPos = { x: W / 2, y: H / 2 };
  var currentTemp = parseFloat(tempSlider.value);

  function rand(min, max) { return min + Math.random() * (max - min); }
  function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }

  function makeMolecule(temp) {
    var angle = rand(0, Math.PI * 2);
    var speed = temp * rand(0.7, 1.3);
    return {
      x: rand(SMALL_RADIUS, W - SMALL_RADIUS),
      y: rand(SMALL_RADIUS, H - SMALL_RADIUS),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: SMALL_RADIUS,
      m: 1
    };
  }

  function init() {
    var n = parseInt(countSlider.value, 10);
    molecules = [];
    for (var i = 0; i < n; i++) {
      var m, tries = 0;
      do {
        m = makeMolecule(currentTemp);
        tries++;
      } while (dist(m.x, m.y, W / 2, H / 2) < BIG_RADIUS + 20 && tries < 50);
      molecules.push(m);
    }
    big = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: BIG_RADIUS, m: currentMass() };
    startPos = { x: big.x, y: big.y };
    trail = [{ x: big.x, y: big.y }];
    msdHistory = [];
    time = 0;
    pathLength = 0;
  }

  function resolveWall(p) {
    if (p.x - p.r < 0) { p.x = p.r; p.vx *= -1; }
    if (p.x + p.r > W) { p.x = W - p.r; p.vx *= -1; }
    if (p.y - p.r < 0) { p.y = p.r; p.vy *= -1; }
    if (p.y + p.r > H) { p.y = H - p.r; p.vy *= -1; }
  }

  // Elastic collision between two circles a and b (2D, equal or different mass)
  function resolveCollision(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var d = Math.hypot(dx, dy);
    var minDist = a.r + b.r;
    if (d === 0 || d > minDist) return;

    var nx = dx / d, ny = dy / d;
    var overlap = (minDist - d) / 2;
    a.x -= nx * overlap; a.y -= ny * overlap;
    b.x += nx * overlap; b.y += ny * overlap;

    var rvx = a.vx - b.vx, rvy = a.vy - b.vy;
    var velAlongNormal = rvx * nx + rvy * ny;
    if (velAlongNormal < 0) return; // already separating

    var impulse = (2 * velAlongNormal) / (a.m + b.m);
    a.vx -= impulse * b.m * nx; a.vy -= impulse * b.m * ny;
    b.vx += impulse * a.m * nx; b.vy += impulse * a.m * ny;
  }

  function step(dt) {
    var i, mo;
    for (i = 0; i < molecules.length; i++) {
      mo = molecules[i];
      mo.x += mo.vx * dt; mo.y += mo.vy * dt;
      resolveWall(mo);
    }
    big.x += big.vx * dt; big.y += big.vy * dt;
    resolveWall(big);

    for (i = 0; i < molecules.length; i++) {
      for (var j = i + 1; j < molecules.length; j++) {
        resolveCollision(molecules[i], molecules[j]);
      }
    }
    for (i = 0; i < molecules.length; i++) {
      resolveCollision(molecules[i], big);
    }

    var last = trail[trail.length - 1];
    pathLength += Math.hypot(big.x - last.x, big.y - last.y);
    trail.push({ x: big.x, y: big.y });
    if (trail.length > 1500) trail.shift();

    time += dt / 60;
    var msd = (big.x - startPos.x) * (big.x - startPos.x) + (big.y - startPos.y) * (big.y - startPos.y);
    msdHistory.push({ t: time, msd: msd });
    if (msdHistory.length > 400) msdHistory.shift();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    if (trailToggle.checked && trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (var i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
      ctx.strokeStyle = "rgba(231, 185, 92, 0.35)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    ctx.fillStyle = "#6FB3D2";
    for (var m = 0; m < molecules.length; m++) {
      var mo = molecules[m];
      ctx.beginPath();
      ctx.arc(mo.x, mo.y, mo.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(big.x, big.y, big.r, 0, Math.PI * 2);
    ctx.fillStyle = "#E7B95C";
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawMSD() {
    var w = msdCanvas.width, h = msdCanvas.height;
    msdCtx.clearRect(0, 0, w, h);
    if (msdHistory.length < 2) return;

    var maxMSD = 1, i;
    for (i = 0; i < msdHistory.length; i++) if (msdHistory[i].msd > maxMSD) maxMSD = msdHistory[i].msd;
    var minT = msdHistory[0].t;
    var maxT = msdHistory[msdHistory.length - 1].t;
    var spanT = (maxT - minT) || 1;

    msdCtx.beginPath();
    for (i = 0; i < msdHistory.length; i++) {
      var p = msdHistory[i];
      var x = ((p.t - minT) / spanT) * w;
      var y = h - (p.msd / maxMSD) * (h - 6) - 3;
      if (i === 0) msdCtx.moveTo(x, y); else msdCtx.lineTo(x, y);
    }
    msdCtx.strokeStyle = "#E7B95C";
    msdCtx.lineWidth = 2;
    msdCtx.stroke();
  }

  function updateReadout() {
    var speed = Math.hypot(big.vx, big.vy);
    speedVal.textContent = speed.toFixed(2);
    pathVal.textContent = Math.round(pathLength);
    timeVal.textContent = time.toFixed(1) + " վ";
  }

  var lastTs = null;
  function loop(ts) {
    if (lastTs === null) lastTs = ts;
    var dt = Math.min((ts - lastTs) / 16.6667, 3);
    lastTs = ts;

    if (!paused) {
      var substeps = 2, s;
      for (s = 0; s < substeps; s++) step(dt / substeps);
      draw();
      drawMSD();
      updateReadout();
    }
    requestAnimationFrame(loop);
  }

  tempSlider.addEventListener("input", function () {
    var newTemp = parseFloat(tempSlider.value);
    tempVal.textContent = newTemp.toFixed(1);
    var ratio = newTemp / currentTemp;
    for (var i = 0; i < molecules.length; i++) {
      molecules[i].vx *= ratio;
      molecules[i].vy *= ratio;
    }
    currentTemp = newTemp;
  });

  countSlider.addEventListener("input", function () {
    countVal.textContent = countSlider.value;
  });
  countSlider.addEventListener("change", init);

  massSlider.addEventListener("input", function () {
    massVal.textContent = massSlider.value;
    big.m = currentMass();
  });

  resetBtn.addEventListener("click", init);

  pauseBtn.addEventListener("click", function () {
    paused = !paused;
    pauseBtn.textContent = paused ? "Շարունակել" : "Դադար";
  });

  init();
  requestAnimationFrame(loop);
})();

// ===== Переключение вкладок =====
(function () {
  var tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      tabBtns.forEach(function (b) {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");

      document.querySelectorAll(".panel").forEach(function (p) {
        p.classList.remove("active");
      });
      var target = document.getElementById("panel-" + btn.dataset.tab);
      if (target) target.classList.add("active");
    });
  });
})();

// ===== Симуляция 2: смешение двух газов через перегородку =====
(function () {
  var canvas = document.getElementById("diffSim");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height;

  var chartCanvas = document.getElementById("diffChart");
  var chartCtx = chartCanvas.getContext("2d");

  var tempSlider = document.getElementById("diffTempSlider");
  var countSlider = document.getElementById("diffCountSlider");
  var wallBtn = document.getElementById("diffWallBtn");
  var resetBtn = document.getElementById("diffResetBtn");
  var tempVal = document.getElementById("diffTempVal");
  var countVal = document.getElementById("diffCountVal");

  var R = 4;
  var WALL_X = W / 2;
  var BINS = 24;

  var particles = [];
  var wallPresent = true;
  var currentTemp = parseFloat(tempSlider.value);

  function rand(min, max) { return min + Math.random() * (max - min); }

  function makeParticle(side, temp) {
    var x = side === "left" ? rand(R, WALL_X - R) : rand(WALL_X + R, W - R);
    var angle = rand(0, Math.PI * 2);
    var speed = temp * rand(0.7, 1.3);
    return {
      x: x, y: rand(R, H - R),
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      r: R, m: 1,
      species: side // "left" -> голубой газ, "right" -> оранжевый газ
    };
  }

  function init() {
    var n = parseInt(countSlider.value, 10);
    particles = [];
    var i;
    for (i = 0; i < n; i++) particles.push(makeParticle("left", currentTemp));
    for (i = 0; i < n; i++) particles.push(makeParticle("right", currentTemp));
    wallPresent = true;
    wallBtn.disabled = false;
  }

  function resolveWall(p) {
    if (p.x - p.r < 0) { p.x = p.r; p.vx *= -1; }
    if (p.x + p.r > W) { p.x = W - p.r; p.vx *= -1; }
    if (p.y - p.r < 0) { p.y = p.r; p.vy *= -1; }
    if (p.y + p.r > H) { p.y = H - p.r; p.vy *= -1; }
    if (wallPresent) {
      if (p.species === "left" && p.x + p.r > WALL_X) { p.x = WALL_X - p.r; p.vx *= -1; }
      if (p.species === "right" && p.x - p.r < WALL_X) { p.x = WALL_X + p.r; p.vx *= -1; }
    }
  }

  function resolveCollision(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var d = Math.hypot(dx, dy);
    var minDist = a.r + b.r;
    if (d === 0 || d > minDist) return;

    var nx = dx / d, ny = dy / d;
    var overlap = (minDist - d) / 2;
    a.x -= nx * overlap; a.y -= ny * overlap;
    b.x += nx * overlap; b.y += ny * overlap;

    var rvx = a.vx - b.vx, rvy = a.vy - b.vy;
    var velAlongNormal = rvx * nx + rvy * ny;
    if (velAlongNormal < 0) return;

    var impulse = (2 * velAlongNormal) / (a.m + b.m);
    a.vx -= impulse * b.m * nx; a.vy -= impulse * b.m * ny;
    b.vx += impulse * a.m * nx; b.vy += impulse * a.m * ny;
  }

  function step(dt) {
    var i, p;
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      resolveWall(p);
    }
    for (i = 0; i < particles.length; i++) {
      for (var j = i + 1; j < particles.length; j++) resolveCollision(particles[i], particles[j]);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (wallPresent) {
      ctx.fillStyle = "#3A5A80";
      ctx.fillRect(WALL_X - 2, 0, 4, H);
    }
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.species === "left" ? "#6FB3D2" : "#E2835A";
      ctx.fill();
    }
  }

  function drawChart() {
    var w = chartCanvas.width, h = chartCanvas.height;
    chartCtx.clearRect(0, 0, w, h);

    var binsA = new Array(BINS).fill(0);
    var binsB = new Array(BINS).fill(0);
    var binW = W / BINS;
    var i;
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      var bin = Math.min(BINS - 1, Math.max(0, Math.floor(p.x / binW)));
      if (p.species === "left") binsA[bin]++; else binsB[bin]++;
    }

    var maxCount = 1;
    for (i = 0; i < BINS; i++) maxCount = Math.max(maxCount, binsA[i] + binsB[i]);

    var colW = w / BINS;
    for (i = 0; i < BINS; i++) {
      var hA = (binsA[i] / maxCount) * (h - 8);
      var hB = (binsB[i] / maxCount) * (h - 8);
      chartCtx.fillStyle = "#6FB3D2";
      chartCtx.fillRect(i * colW + 1, h - hA, colW - 2, hA);
      chartCtx.fillStyle = "#E2835A";
      chartCtx.fillRect(i * colW + 1, h - hA - hB, colW - 2, hB);
    }
  }

  var lastTs = null;
  function loop(ts) {
    if (lastTs === null) lastTs = ts;
    var dt = Math.min((ts - lastTs) / 16.6667, 3);
    lastTs = ts;

    var substeps = 2, s;
    for (s = 0; s < substeps; s++) step(dt / substeps);
    draw();
    drawChart();
    requestAnimationFrame(loop);
  }

  tempSlider.addEventListener("input", function () {
    var newTemp = parseFloat(tempSlider.value);
    tempVal.textContent = newTemp.toFixed(1);
    var ratio = newTemp / currentTemp;
    for (var i = 0; i < particles.length; i++) {
      particles[i].vx *= ratio;
      particles[i].vy *= ratio;
    }
    currentTemp = newTemp;
  });

  countSlider.addEventListener("input", function () {
    countVal.textContent = countSlider.value;
  });
  countSlider.addEventListener("change", init);

  wallBtn.addEventListener("click", function () {
    wallPresent = false;
    wallBtn.disabled = true;
  });

  resetBtn.addEventListener("click", init);

  init();
  requestAnimationFrame(loop);
})();
