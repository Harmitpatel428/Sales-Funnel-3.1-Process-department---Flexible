// Debug script to test login API directly
const http = require('http');

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
    },
    timeout: 30000
};

console.log('Testing login API...');
console.log('Request:', { path: options.path, body: { username: 'admin', password: '***' } });

const req = http.request(options, (res) => {
    console.log(`Response Status: ${res.statusCode}`);
    console.log('Response Headers:', res.headers);

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('Response Body:', data);
        try {
            const json = JSON.parse(data);
            console.log('Parsed Response:', JSON.stringify(json, null, 2));
        } catch (e) {
            console.log('Raw response (not JSON):', data);
        }
    });
});

req.on('error', (e) => {
    console.error(`Request error: ${e.message}`);
});

req.on('timeout', () => {
    console.error('Request timed out after 30 seconds');
    req.destroy();
});

req.write(postData);
req.end();
