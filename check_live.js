const https = require('https');
https.get('https://respectful-clarity-production-008b.up.railway.app/', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Length:', data.length);
    let checks = {
      'lilith.webp': false,
      '哈喽哈': false,
      'amiyaCanvas': false,
      'wallpaper.mp4': false,
      '__INITIAL_DATA__': false,
      'y2k.js': false,
      'newspaper.js': false,
      'pet.js': false
    };
    for (const k of Object.keys(checks)) checks[k] = data.includes(k);
    console.log(JSON.stringify(checks, null, 2));
    // blocks data
    const m = data.match(/^.*blocks:\s*(\[.*?\])\s*,/ms);
    if (m) {
      console.log('Blocks raw len:', m[1].length);
      console.log('First 150:', m[1].substring(0,150));
    } else {
      console.log('No blocks match found');
      // Try broader match
      const m2 = data.match(/homepage_blocks/);
      console.log('has homepage_blocks ref:', !!m2);
    }
  });
});
