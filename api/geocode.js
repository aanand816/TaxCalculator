// api/geocode.js — Vercel serverless function (keeps the ORS key off the page)
module.exports = async (req, res) => {
  const key = process.env.ORS_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server is missing ORS_API_KEY. Enter km and hours manually.' });
  const text = String((req.query && req.query.text) || '').trim();
  if (text.length < 5) return res.status(400).json({ error: 'Address is too short.' });
  const p = new URLSearchParams({
    api_key: key, text, size: '7',
    'boundary.country': 'CA',
    'focus.point.lon': '-93.4', 'focus.point.lat': '49.2'   // bias results toward NW Ontario
  });
  try {
    const r = await fetch('https://api.openrouteservice.org/geocode/search?' + p.toString());
    if (!r.ok) return res.status(502).json({ error: 'Address service error (' + r.status + '). Enter km and hours manually.' });
    const j = await r.json();
    const results = (j.features || []).map(f => ({
      label: f.properties && f.properties.label,
      layer: f.properties && f.properties.layer,            // "address" = exact house; "street" = street only
      matchType: f.properties && f.properties.match_type,   // exact | interpolated | fallback
      lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1]
    })).filter(x => x.label);
    res.setHeader('Cache-Control', 's-maxage=3600');
    return res.status(200).json({ results });
  } catch (e) {
    return res.status(502).json({ error: 'Address service unreachable. Enter km and hours manually.' });
  }
};
