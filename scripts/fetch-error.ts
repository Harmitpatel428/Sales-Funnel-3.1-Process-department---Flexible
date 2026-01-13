
import fs from 'fs';

async function main() {
    try {
        const res = await fetch('http://localhost:3000/api/leads');
        const text = await res.text();
        console.log('Status:', res.status);
        fs.writeFileSync('debug_500.html', text);
        console.log('Saved response to debug_500.html');
    } catch (err) {
        console.error('Fetch failed:', err);
    }
}

main();
