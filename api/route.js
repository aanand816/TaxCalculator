// api/route.js — Vercel serverless function: closest office by DRIVING distance
// EDIT THESE if an office moves. Coordinates are [lon, lat] (approximate city mid-points).
const OFFICES = [
  { name: 'Fort Frances',  lon: -93.4108, lat: 48.6094 },   // set to 305 Kirsti Pl for more precision
  { name: 'Kenora',        lon: -94.4894, lat: 49.7667 },
  { name: 'Dryden',        lon: -92.8370, lat: 49.7830 },
  { name: 'Sioux Lookout', lon: -91.9170, lat: 50.0997 }
];

module.exports = async (req, res) => {
  const key = process.env.ORS_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server is missing ORS_API_KEY. Enter km and hours manually.' });
  const lon = Number(req.query && req.query.lon), lat = Number(req.query && req.query.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90)
    return res.status(400).json({ error: 'Bad coordinates.' });
  const locations = [...OFFICES.map(o => [o.lon, o.lat]), [lon, lat]];
  try {
    const r = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations, sources: OFFICES.map((_, i) => i), destinations: [OFFICES.length],
        metrics: ['distance', 'duration'], units: 'km'
      })
    });
    if (!r.ok) return res.status(502).json({ error: 'Routing service error (' + r.status + '). Enter km and hours manually.' });
    const j = await r.json();
    let best = null;
    OFFICES.forEach((o, i) => {
      const km = j.distances && j.distances[i] && j.distances[i][0];
      const sec = j.durations && j.durations[i] && j.durations[i][0];
      if (typeof km === 'number' && typeof sec === 'number' && (!best || km < best.km)) best = { office: o.name, km, seconds: sec };
    });
    if (!best) return res.status(422).json({ error: 'No driving route found from any office. Enter km and hours manually.' });
    return res.status(200).json(best);
  } catch (e) {
    return res.status(502).json({ error: 'Routing service unreachable. Enter km and hours manually.' });
  }
};
