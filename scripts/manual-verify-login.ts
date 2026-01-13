async function test() {
    const url = 'http://localhost:3001/api/auth/login';
    console.log(`Testing POST ${url}`);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'testuser@example.com', password: 'correct_password' })
        });
        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log('Response:', text);
    } catch (e) {
        console.error("Fetch error:", e);
    }
}
test();
