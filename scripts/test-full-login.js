// Test full login flow with session validation
const http = require('http');

// Step 1: Login and get session cookie
function login() {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            username: 'admin',
            password: 'Admin@123456',
            rememberMe: false
        });

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/auth/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const cookies = res.headers['set-cookie'];
                console.log('Login Status:', res.statusCode);
                console.log('Session Cookie:', cookies?.[0]?.substring(0, 50) + '...');
                resolve({ status: res.statusCode, cookies, body: data });
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// Step 2: Check /api/auth/me with the session cookie
function checkMe(cookie) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/auth/me',
            method: 'GET',
            headers: {
                'Cookie': cookie
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('\n/api/auth/me Status:', res.statusCode);
                try {
                    const json = JSON.parse(data);
                    console.log('Valid:', json.valid);
                    console.log('User:', json.user?.username);
                } catch (e) {
                    console.log('Response:', data.substring(0, 200));
                }
                resolve({ status: res.statusCode, body: data });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function main() {
    console.log('=== Testing Full Login Flow ===\n');

    const loginResult = await login();

    if (loginResult.status === 200 && loginResult.cookies) {
        // Extract just the session_token cookie
        const sessionCookie = loginResult.cookies.find(c => c.startsWith('session_token='));
        if (sessionCookie) {
            const cookieValue = sessionCookie.split(';')[0]; // Get just "session_token=..."
            await checkMe(cookieValue);
        } else {
            console.log('No session_token cookie found!');
        }
    } else {
        console.log('Login failed!');
    }
}

main().catch(console.error);
