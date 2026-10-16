async function test() {
  console.log('================================================================');
  console.log('TEST POINT 1 : RÉSISTANCE AU SPOOFING D’EN-TÊTE X-FORWARDED-FOR');
  console.log('================================================================');

  const spoofedIps = [
    '203.0.113.101',
    '203.0.113.102',
    '203.0.113.103',
    '203.0.113.104',
    '203.0.113.105',
    '203.0.113.106' // 6ème tentative depuis la même machine
  ];

  for (let i = 0; i < spoofedIps.length; i++) {
    const fakeIp = spoofedIps[i];
    const res = await fetch('http://localhost:3000/api/rooms/BADCODE99', {
      headers: {
        'X-Forwarded-For': fakeIp,
        'User-Agent': 'SecurityTester/1.0'
      }
    });

    const data = await res.json();
    console.log(`Tentative ${i + 1}/6 (X-Forwarded-For forgé: "${fakeIp}") -> HTTP ${res.status} | Code: ${data.code || 'NON_429'} | Message: "${data.error}"`);

    if (i === 5) {
      if (res.status === 429 && data.code === 'RATE_LIMIT_EXCEEDED') {
        console.log('✅ SUCCÈS POINT 1 : La 6ème tentative a bien été bloquée en HTTP 429 malgré un en-tête X-Forwarded-For différent.');
      } else {
        console.error('❌ ÉCHEC POINT 1 : La 6ème tentative n’a pas été bloquée en 429 !');
        process.exit(1);
      }
    }
  }
}

test().catch(console.error);
