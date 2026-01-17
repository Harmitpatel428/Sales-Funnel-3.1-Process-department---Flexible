import { spawn } from 'child_process';

console.log('Starting Playwright UI Mode for interactive testing...');
// Spawns Playwright UI mode which watches files and allows running specific tests
const p = spawn('npx', ['playwright', 'test', '--ui'], { stdio: 'inherit', shell: true });

p.on('exit', (code) => {
    process.exit(code ?? 0);
});
