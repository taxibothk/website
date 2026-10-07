// Fare maths, a line-by-line port of ridebot/core/fares.py (tested against it in tests/test_site.py).
// Usage: const { meter, estimate, detectTunnels } = RideBotFares(window.RIDEBOT);
(function (root) {
  "use strict";
  function RideBotFares(D) {
    function meter(km, waitingMin, type) {
      const [flag, step, threshold, stepAfter] = D.tariffs[type];
      const units = Math.max(0, Math.ceil((km - 2) / 0.2 - 1e-9)) + Math.max(0, Math.ceil(waitingMin - 1e-9));
      const fullRate = Math.ceil((threshold - flag) / step - 1e-9);
      const v = units <= fullRate ? flag + units * step : flag + fullRate * step + (units - fullRate) * stepAfter;
      return Math.round(v * 10) / 10;
    }

    const M_PER_DEG = 111320;
    function closeToRoute(point, route, metres) {
      const [plat, plon] = point;
      const kx = M_PER_DEG * Math.cos(plat * Math.PI / 180);
      for (let i = 0; i + 1 < route.length; i++) {
        const [alat, alon] = route[i], [blat, blon] = route[i + 1];
        const ax = (alon - plon) * kx, ay = (alat - plat) * M_PER_DEG;
        const bx = (blon - plon) * kx, by = (blat - plat) * M_PER_DEG;
        const dx = bx - ax, dy = by - ay, seg2 = dx * dx + dy * dy;
        const t = seg2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / seg2));
        if (Math.hypot(ax + t * dx, ay + t * dy) <= metres) return true;
      }
      return false;
    }

    function detectTunnels(route, metres = 40) {
      if (route.length < 2) return [];
      const lats = route.map(p => p[0]), lons = route.map(p => p[1]), pad = 0.003;
      const box = [Math.min(...lats) - pad, Math.max(...lats) + pad, Math.min(...lons) - pad, Math.max(...lons) + pad];
      const found = [];
      for (const [key, points] of Object.entries(D.tunnelPoints)) {
        const inside = points.filter(p => p[0] >= box[0] && p[0] <= box[1] && p[1] >= box[2] && p[1] <= box[3]);
        const near = list => list.filter(p => closeToRoute(p, route, metres)).length;
        if (near(inside.filter((_, i) => i % 2 === 0)) >= 2 || near(inside) >= 2) found.push(key);
      }
      return Object.keys(D.tolls).filter(k => found.includes(k));
    }

    function estimate(km, minutes, tunnels, type, luggage, pets) {
      const meterLow = meter(km, minutes * 0.15, type);
      const meterHigh = meter(km * 1.15, minutes * 0.5 + 3, type);
      const tolls = tunnels.map(k => [k, D.tolls[k].fee]);   // single tunnel fee for harbour crossings
      const tollTotal = tolls.reduce((a, [, f]) => a + f, 0);
      const surcharges = luggage * D.luggage + pets * D.pet;
      return {
        meterLow: Math.floor(meterLow), meterHigh: Math.ceil(meterHigh), tolls, tollTotal, surcharges, luggage, pets,
        low: Math.floor(meterLow + tollTotal + surcharges), high: Math.ceil(meterHigh + tollTotal + surcharges),
      };
    }

    return { meter, estimate, detectTunnels };
  }
  if (typeof module !== "undefined") module.exports = RideBotFares;
  else root.RideBotFares = RideBotFares;
})(typeof window !== "undefined" ? window : globalThis);
