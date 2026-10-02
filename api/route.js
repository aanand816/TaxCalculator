// api/route.js — Vercel serverless function: closest office by DRIVING distance
// EDIT THESE if an office moves. Coordinates are [lon, lat] (approximate city mid-points).
const OFFICES = [
  { name: 'Fort Frances',  lon: -93.4108, lat: 48.6094 },   // set to 305 Kirsti Pl for more precision
  { name: 'Kenora',        lon: -94.4894, lat: 49.7667 },
  { name: 'Dryden',        lon: -92.8370, lat: 49.7830 },
  { name: 'Sioux Lookout', lon: -91.9170, lat: 50.0997 }
];

// Newer ORS address first, deprecated one as a fallback.
const MATRIX_URLS = [
  'https://api.heigit.org/openrouteservice/v2/matrix/driving-car',
  'https://api.openrouteservice.org/v2/matrix/driving-car'
];

module.exports = async (req, res) => {
  const raw = process.env.ORS_API_KEY;
  if (!raw) return res.status(500).json({ error: 'Server is missing ORS_API_KEY. Enter km and hours manually.' });
  const key = raw.trim().replace(/^["']|["']$/g, '');      // strips accidental quotes/spaces
  const lon = Number(req.query && req.query.lon), lat = Number(req.query && req.query.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90)
    return res.status(400).json({ error: 'Bad coordinates.' });

  const body = JSON.stringify({
    locations: [...OFFICES.map(o => [o.lon, o.lat]), [lon, lat]],
    sources: OFFICES.map((_, i) => i), destinations: [OFFICES.length],
    metrics: ['distance', 'duration'], units: 'km'
  });

  let last = null;
  for (const url of MATRIX_URLS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: key, 'Content-Type': 'application/json' },
        body
      });
      if (r.ok) {
        const j = await r.json();
        let best = null;
        OFFICES.forEach((o, i) => {
          const km = j.distances && j.distances[i] && j.distances[i][0];
          const sec = j.durations && j.durations[i] && j.durations[i][0];
          if (typeof km === 'number' && typeof sec === 'number' && (!best || km < best.km)) best = { office: o.name, km, seconds: sec };
        });
        if (!best) return res.status(422).json({ error: 'No driving route found from any office. Enter km and hours manually.' });
        return res.status(200).json(best);
      }
      const text = await r.text();
      console.error('ORS matrix', url, r.status, text.slice(0, 300));     // visible in Vercel > Logs
      last = { status: r.status, text: text.slice(0, 200), url };
      if (r.status !== 403 && r.status < 500) break;                       // only retry on 403 / server errors
    } catch (e) {
      console.error('ORS matrix fetch failed', url, e && e.message);
      last = { status: 0, text: String(e && e.message), url };
    }
  }
  const s = last ? last.status : 0;
  const hint = s === 403 ? 'ORS refused the key (403). Check the key and your ORS dashboard.'
    : s === 429 ? 'Too many requests in a minute (429). Wait a minute and try again.'
    : 'Routing service error (' + s + ').';
  return res.status(502).json({ error: hint + ' Enter km and hours manually.', detail: last });
};
