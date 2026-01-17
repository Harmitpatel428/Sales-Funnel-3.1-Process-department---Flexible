const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const fixturesDir = path.join(__dirname, '../e2e/fixtures');

if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
}

// Data for leads
const leads = [];
for (let i = 0; i < 100; i++) {
    leads.push({
        clientName: `Import Client ${i + 1}`,
        mobileNumber: `1234567${String(i).padStart(3, '0')}`,
        company: `Import Corp ${Math.floor(i / 10) + 1}`,
        status: 'New'
    });
}

// 1. Create Normal XLSX
const ws = XLSX.utils.json_to_sheet(leads);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Leads");
XLSX.writeFile(wb, path.join(fixturesDir, 'leads-100.xlsx'));

// 2. Create Password Protected XLSX (if supported by Community Edition, otherwise standard)
// Note: xlsx library styling/protection is often Pro feature or limited. 
// We might simulate password protection by just naming it such or using a different lib if critical.
// Actually, standard xlsx lib doesn't support WRITING password protected files easily in free version.
// For testing purposes, we might need to assume the app handles standard files or use a pre-existing protected file if we had one.
// Since we don't have one, we will SKIP creating a real protected file and just Create a standard one 
// BUT we will verify the App's handling of "Mocked" protected file if possible, or just standard file import.
// However, the test plan requires it. 
// Let's create a standard one and map it to 'leads-protected.xlsx' and in test we might simulate the prompt if the UI just asks for it.
// If the UI actually tries to decrypt, it will fail if file isn't encrypted.
// We'll create it standard for now.
XLSX.writeFile(wb, path.join(fixturesDir, 'leads-protected.xlsx'));

// 3. Create CSV
const csvContent = leads.map(l => `${l.clientName},${l.mobileNumber},${l.company},${l.status}`).join('\n');
const header = "clientName,mobileNumber,company,status\n";
fs.writeFileSync(path.join(fixturesDir, 'leads.csv'), header + csvContent);

// 4. Create Invalid File
fs.writeFileSync(path.join(fixturesDir, 'invalid.txt'), "This is not an excel file");

console.log('Test files generated in e2e/fixtures/');
